import { AttendanceStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  classStatsForRange,
  dailyRateSeries,
  highAbsenceStudents,
  schoolStatsForRange,
  statusDistribution,
  studentSummary,
  type HighAbsenceStudent,
  type SchoolStats,
} from "@/lib/attendance/queries";
import { ATTENDANCE_SHORT_LABEL, ATTENDANCE_STATUSES } from "@/lib/constants";
import { computeStats, emptyCounts, mergeCounts, type AttendanceStats } from "@/lib/attendance/percentage";
import { formatUzDate, type DateRange } from "@/lib/date";
import { classLabel } from "@/lib/utils";
import type { DailyRatePoint } from "@/lib/attendance/queries";
import type { StatusCounts } from "@/lib/attendance/percentage";

/**
 * Report builders. Each returns plain serialisable data so the same report can
 * be rendered in the UI, exported to CSV/Excel or to PDF from one structure.
 */

export type ClassReportRow = {
  classId: string;
  className: string;
  gradeYear: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  recorded: number;
  rate: number;
  coverage: number;
  reliable: boolean;
};

export type StudentReportRow = {
  studentId: string;
  fullName: string;
  className: string;
  present: number;
  absent: number;
  late: number;
  excused: number;
  recorded: number;
  rate: number;
};

export type ClassReport = {
  schoolName: string;
  range: DateRange;
  className: string;
  stats: ClassReportRow;
  students: StudentReportRow[];
};

export type SchoolReport = {
  schoolName: string;
  range: DateRange;
  stats: SchoolStats;
  classes: ClassReportRow[];
  distribution: StatusCounts;
  daily: DailyRatePoint[];
  highAbsence: HighAbsenceStudent[];
};

export function statusField(status: AttendanceStatus): "present" | "absent" | "late" | "excused" {
  switch (status) {
    case AttendanceStatus.PRESENT:
      return "present";
    case AttendanceStatus.ABSENT:
      return "absent";
    case AttendanceStatus.LATE:
      return "late";
    case AttendanceStatus.EXCUSED:
      return "excused";
    default: {
      const exhaustiveCheck: never = status as never;
      throw new Error(`Noma'lum davomat holati: ${exhaustiveCheck}`);
    }
  }
}

export async function buildSchoolReport(schoolId: string, range: DateRange, classIds?: string[]): Promise<SchoolReport> {
  const [school, stats, distribution, daily, highAbsence, classRows] = await Promise.all([
    prisma.school.findUnique({ where: { id: schoolId }, select: { name: true } }),
    schoolStatsForRange(schoolId, range),
    statusDistribution(schoolId, range),
    dailyRateSeries(schoolId, range),
    highAbsenceStudents(schoolId, range),
    buildClassReportRows(schoolId, range, classIds),
  ]);

  return {
    schoolName: school?.name ?? "Maktab",
    range,
    stats,
    classes: classRows,
    distribution,
    daily,
    highAbsence,
  };
}

export async function buildClassReportRows(schoolId: string, range: DateRange, classIds?: string[]): Promise<ClassReportRow[]> {
  const classes = await prisma.schoolClass.findMany({
    where: {
      schoolId,
      isActive: true,
      deletedAt: null,
      ...(classIds ? { id: { in: classIds } } : {}),
    },
    select: { id: true, name: true, letter: true, gradeYear: true },
    orderBy: [{ gradeYear: "asc" }, { name: "asc" }],
  });

  const rows = await Promise.all(
    classes.map(async (c) => {
      const ranked = await classStatsForRange({ schoolId, classId: c.id, range });
      const s = ranked.stats;
      return {
        classId: c.id,
        className: classLabel(c.name, c.letter),
        gradeYear: c.gradeYear,
        present: s.present,
        absent: s.absent,
        late: s.late,
        excused: s.excused,
        recorded: s.recorded,
        rate: s.rate,
        coverage: s.coverage,
        reliable: s.reliable,
      };
    }),
  );

  rows.sort((a, b) => b.rate - a.rate || a.className.localeCompare(b.className, "uz"));
  return rows;
}

export async function buildClassReport(
  schoolId: string,
  classId: string,
  range: DateRange,
): Promise<ClassReport | null> {
  const [school, schoolClass, ranked] = await Promise.all([
    prisma.school.findUnique({ where: { id: schoolId }, select: { name: true } }),
    prisma.schoolClass.findFirst({
      where: { id: classId, schoolId },
      select: { id: true, name: true, letter: true, gradeYear: true, academicYear: true },
    }),
    classStatsForRange({ schoolId, classId, range }),
  ]);
  if (!schoolClass) return null;

  const enrollments = await prisma.enrollment.findMany({
    where: {
      schoolId,
      classId,
      isActive: true,
      status: "ACTIVE",
      student: { isActive: true, deletedAt: null },
    },
    select: {
      id: true,
      student: { select: { id: true, firstName: true, lastName: true, middleName: true } },
    },
    orderBy: [{ student: { lastName: "asc" } }, { student: { firstName: "asc" } }],
  });

  const records = await prisma.attendanceRecord.findMany({
    where: {
      schoolId,
      enrollmentId: { in: enrollments.map((e) => e.id) },
      session: { date: { gte: range.from, lte: range.to } },
    },
    select: { enrollmentId: true, status: true },
  });

  const byEnrollment = new Map<string, Record<AttendanceStatus, number>>();
  for (const e of enrollments) byEnrollment.set(e.id, { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0 });
  for (const r of records) {
    const bucket = byEnrollment.get(r.enrollmentId ?? "");
    if (bucket) bucket[r.status] += 1;
  }

  const students: StudentReportRow[] = enrollments.map((e) => {
    const counts = byEnrollment.get(e.id) ?? { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0 };
    const recorded = counts.PRESENT + counts.ABSENT + counts.LATE + counts.EXCUSED;
    const attended = counts.PRESENT + counts.LATE;
    return {
      studentId: e.student.id,
      fullName: [e.student.lastName, e.student.firstName, e.student.middleName].filter(Boolean).join(" "),
      className: classLabel(schoolClass.name, schoolClass.letter),
      present: counts.PRESENT,
      absent: counts.ABSENT,
      late: counts.LATE,
      excused: counts.EXCUSED,
      recorded,
      rate: recorded > 0 ? Math.round((attended / recorded) * 1000) / 10 : 0,
    };
  });

  const s = ranked.stats;
  const stats: ClassReportRow = {
    classId: schoolClass.id,
    className: classLabel(schoolClass.name, schoolClass.letter),
    gradeYear: schoolClass.gradeYear,
    present: s.present,
    absent: s.absent,
    late: s.late,
    excused: s.excused,
    recorded: s.recorded,
    rate: s.rate,
    coverage: s.coverage,
    reliable: s.reliable,
  };

  return { schoolName: school?.name ?? "Maktab", range, className: stats.className, stats, students };
}

export type StudentReport = Awaited<ReturnType<typeof buildStudentReport>>;

export async function buildStudentReport(schoolId: string, studentId: string, range: DateRange) {
  const student = await prisma.student.findFirst({
    where: { id: studentId, schoolId, deletedAt: null },
    select: { id: true, firstName: true, lastName: true, middleName: true },
  });
  if (!student) return null;

  const summary = await studentSummary(schoolId, studentId, range);

  const days = await prisma.attendanceRecord.findMany({
    where: { schoolId, studentId, session: { date: { gte: range.from, lte: range.to } } },
    select: {
      status: true,
      reason: true,
      note: true,
      session: {
        select: {
          date: true,
          slot: true,
          class: { select: { name: true, letter: true } },
        },
      },
    },
    orderBy: { session: { date: "desc" } },
  });

  const recorded = days.length;
  const attended = summary.counts.present + summary.counts.late;

  return {
    studentId: student.id,
    fullName: [student.lastName, student.firstName, student.middleName].filter(Boolean).join(" "),
    rangeLabel: `${formatUzDate(range.from)} — ${formatUzDate(range.to)}`,
    counts: summary.counts,
    classNames: summary.classNames,
    recorded,
    rate: recorded > 0 ? Math.round((attended / recorded) * 1000) / 10 : 0,
    days: days.map((d) => ({
      date: d.session.date,
      slot: d.session.slot,
      className: classLabel(d.session.class.name, d.session.class.letter),
      status: d.status,
      statusLabel: ATTENDANCE_SHORT_LABEL[d.status],
      reason: d.reason,
      note: d.note,
    })),
  };
}

export { ATTENDANCE_SHORT_LABEL, ATTENDANCE_STATUSES };

// ---------------------------------------------------------------------------
// Platform-wide report (Super Admin)
// ---------------------------------------------------------------------------

export type PlatformReportRow = {
  schoolId: string;
  schoolName: string;
  rate: number;
  coverage: number;
  recorded: number;
  eligible: number;
  studentCount: number;
  classCount: number;
  sessionCount: number;
  reliable: boolean;
};

export type PlatformReport = {
  range: DateRange;
  rows: PlatformReportRow[];
  totals: AttendanceStats;
};

/**
 * Cross-school aggregation for the Super Admin. Schools are never mixed into
 * one another's permission scope here — this is a platform-level read that only
 * a super admin can reach.
 */
export async function buildPlatformReport(range: DateRange): Promise<PlatformReport> {
  const schools = await prisma.school.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const rows: PlatformReportRow[] = [];
  let totalCounts = emptyCounts();
  let totalEligible = 0;

  for (const school of schools) {
    const stats = await schoolStatsForRange(school.id, range);
    totalCounts = mergeCounts(totalCounts, {
      present: stats.stats.present,
      absent: stats.stats.absent,
      late: stats.stats.late,
      excused: stats.stats.excused,
    });
    totalEligible += stats.stats.eligible;
    rows.push({
      schoolId: school.id,
      schoolName: school.name,
      rate: stats.stats.rate,
      coverage: stats.stats.coverage,
      recorded: stats.stats.recorded,
      eligible: stats.stats.eligible,
      studentCount: stats.studentCount,
      classCount: stats.classCount,
      sessionCount: stats.sessionCount,
      reliable: stats.stats.reliable,
    });
  }

  rows.sort((a, b) => b.rate - a.rate || a.schoolName.localeCompare(b.schoolName, "uz"));

  return { range, rows, totals: computeStats(totalCounts, totalEligible) };
}