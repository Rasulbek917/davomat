import { AttendanceSessionStatus, AttendanceStatus, EnrollmentStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  addStatus,
  computeStats,
  countsFromStatuses,
  emptyCounts,
  mergeCounts,
  rankClasses,
  type AttendanceStats,
  type RankedClass,
  type StatusCounts,
} from "@/lib/attendance/percentage";
import { countSchoolDays, getCalendarOverrides } from "@/lib/attendance/working-days";
import { formatDateOnly, parseDateOnly, type DateRange } from "@/lib/date";
import { classLabel } from "@/lib/utils";
import { fullName } from "@/lib/utils";

/**
 * Attendance data access.
 *
 * Every function in this module takes an explicit `schoolId` and always
 * filters by it — callers obtain that id through `assertSchoolAccess`, so the
 * isolation guarantee is enforced here for read paths as well.
 */

export type RegisterStudent = {
  studentId: string;
  enrollmentId: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  gender: "MALE" | "FEMALE" | null;
  recordId: string | null;
  status: AttendanceStatus | null;
  reason: string | null;
  note: string | null;
};

export type RegisterData = {
  class: { id: string; name: string; gradeYear: number; academicYear: string } | null;
  session: {
    id: string;
    date: Date;
    slot: "FULL_DAY" | "MORNING" | "AFTERNOON";
    status: AttendanceSessionStatus;
    note: string | null;
    recordedById: string | null;
    recordedByName: string | null;
    submittedAt: Date | null;
    createdAt: Date;
  } | null;
  students: RegisterStudent[];
};

/** The full register for a class on a date — used by the marking screen. */
export async function getRegister(
  schoolId: string,
  classId: string,
  date: Date,
  slot: "FULL_DAY" | "MORNING" | "AFTERNOON",
): Promise<RegisterData> {
  const schoolClass = await prisma.schoolClass.findFirst({
    where: { id: classId, schoolId, isActive: true, deletedAt: null },
    select: { id: true, name: true, gradeYear: true, academicYear: true },
  });
  if (!schoolClass) {
    return { class: null, session: null, students: [] };
  }

  const session = await prisma.attendanceSession.findUnique({
    where: { classId_date_slot: { classId, date, slot } },
    select: {
      id: true,
      date: true,
      slot: true,
      status: true,
      note: true,
      recordedById: true,
      submittedAt: true,
      createdAt: true,
      recorder: { select: { firstName: true, lastName: true } },
    },
  });

  // Enrolled students on the given date: enrolment must cover the date.
  const enrollments = await prisma.enrollment.findMany({
    where: {
      schoolId,
      classId,
      isActive: true,
      status: EnrollmentStatus.ACTIVE,
      startDate: { lte: date },
      OR: [{ endDate: null }, { endDate: { gte: date } }],
      student: { isActive: true, deletedAt: null },
    },
    select: {
      id: true,
      student: {
        select: { id: true, firstName: true, lastName: true, middleName: true, gender: true },
      },
    },
    orderBy: [{ student: { lastName: "asc" } }, { student: { firstName: "asc" } }],
  });

  let records: { id: string; studentId: string; status: AttendanceStatus; reason: string | null; note: string | null }[] = [];
  if (session) {
    records = await prisma.attendanceRecord.findMany({
      where: { sessionId: session.id, schoolId },
      select: { id: true, studentId: true, status: true, reason: true, note: true },
    });
  }
  const recordByStudent = new Map(records.map((r) => [r.studentId, r]));

  const students: RegisterStudent[] = enrollments.map((e) => {
    const record = recordByStudent.get(e.student.id);
    return {
      studentId: e.student.id,
      enrollmentId: e.id,
      firstName: e.student.firstName,
      lastName: e.student.lastName,
      middleName: e.student.middleName,
      gender: e.student.gender,
      recordId: record?.id ?? null,
      status: record?.status ?? null,
      reason: record?.reason ?? null,
      note: record?.note ?? null,
    };
  });

  return {
    class: { id: schoolClass.id, name: schoolClass.name, gradeYear: schoolClass.gradeYear, academicYear: schoolClass.academicYear },
    session: session
      ? {
          id: session.id,
          date: session.date,
          slot: session.slot,
          status: session.status,
          note: session.note,
          recordedById: session.recordedById,
          recordedByName: session.recorder ? fullName(session.recorder) : null,
          submittedAt: session.submittedAt,
          createdAt: session.createdAt,
        }
      : null,
    students,
  };
}

export type SessionListItem = {
  id: string;
  date: Date;
  slot: "FULL_DAY" | "MORNING" | "AFTERNOON";
  status: AttendanceSessionStatus;
  note: string | null;
  recordedByName: string | null;
  submittedAt: Date | null;
  createdAt: Date;
  recordCount: number;
  presentCount: number;
  classId: string;
  className: string;
};

export async function listSessions(
  schoolId: string,
  opts: { classId?: string; from?: Date; to?: Date; status?: AttendanceSessionStatus } = {},
): Promise<SessionListItem[]> {
  const sessions = await prisma.attendanceSession.findMany({
    where: {
      schoolId,
      ...(opts.classId ? { classId: opts.classId } : {}),
      ...(opts.from || opts.to
        ? { date: { ...(opts.from ? { gte: opts.from } : {}), ...(opts.to ? { lte: opts.to } : {}) } }
        : {}),
      ...(opts.status ? { status: opts.status } : {}),
    },
    select: {
      id: true,
      date: true,
      slot: true,
      status: true,
      note: true,
      submittedAt: true,
      createdAt: true,
      recorder: { select: { firstName: true, lastName: true } },
      class: { select: { id: true, name: true } },
      records: { select: { status: true } },
    },
    orderBy: [{ date: "desc" }, { slot: "asc" }],
    take: 200,
  });

  return sessions.map((s) => ({
    id: s.id,
    date: s.date,
    slot: s.slot,
    status: s.status,
    note: s.note,
    recordedByName: s.recorder ? fullName(s.recorder) : null,
    submittedAt: s.submittedAt,
    createdAt: s.createdAt,
    classId: s.class.id,
    className: s.class.name,
    recordCount: s.records.length,
    presentCount: s.records.filter((r) => r.status === "PRESENT" || r.status === "LATE").length,
  }));
}

/** Per-student attendance summary over a range (used in student reports). */
export async function studentSummary(
  schoolId: string,
  studentId: string,
  range: DateRange,
): Promise<{ counts: StatusCounts; sessions: number; classNames: string[] }> {
  const records = await prisma.attendanceRecord.findMany({
    where: {
      schoolId,
      studentId,
      session: { date: { gte: range.from, lte: range.to } },
    },
    select: {
      status: true,
      session: {
        select: {
          date: true,
          class: { select: { name: true } },
        },
      },
    },
    orderBy: { session: { date: "asc" } },
  });

  const counts = emptyCounts();
  const classNames = new Set<string>();
  for (const record of records) {
    addStatus(counts, record.status);
    classNames.add(record.session.class.name);
  }
  return { counts, sessions: records.length, classNames: [...classNames] };
}

/** Distinct enrolled-student count for a class during a range. */
async function eligibleForRange(
  schoolId: string,
  classId: string,
  range: DateRange,
): Promise<number> {
  return prisma.enrollment.count({
    where: {
      schoolId,
      classId,
      isActive: true,
      status: EnrollmentStatus.ACTIVE,
      startDate: { lte: range.to },
      OR: [{ endDate: null }, { endDate: { gte: range.from } }],
      student: { isActive: true, deletedAt: null },
    },
  });
}

export type ClassRangeInput = {
  schoolId: string;
  classId: string;
  range: DateRange;
  slots?: ("FULL_DAY" | "MORNING" | "AFTERNOON")[];
};

/** Aggregated statistics for one class over a date range. */
export async function classStatsForRange(input: ClassRangeInput): Promise<RankedClass> {
  const schoolClass = await prisma.schoolClass.findFirst({
    where: { id: input.classId, schoolId: input.schoolId },
    select: { id: true, name: true, letter: true, gradeYear: true },
  });
  if (!schoolClass) {
    return {
      classId: input.classId,
      className: "Noma’lum",
      letter: null,
      gradeYear: 0,
      stats: {
        ...emptyCounts(),
        recorded: 0,
        eligible: 0,
        attended: 0,
        missed: 0,
        unrecorded: 0,
        rate: 0,
        coverage: 0,
        reliable: false,
      } as AttendanceStats,
    };
  }

  const [eligible, records, overrides] = await Promise.all([
    eligibleForRange(input.schoolId, input.classId, input.range),
    prisma.attendanceRecord.findMany({
      where: {
        schoolId: input.schoolId,
        session: {
          classId: input.classId,
          date: { gte: input.range.from, lte: input.range.to },
          ...(input.slots?.length
            ? { slot: { in: input.slots } }
            : {}),
        },
      },
      select: { status: true },
    }),
    getCalendarOverrides(input.schoolId, input.range.from, input.range.to),
  ]);

  const schoolDays = countSchoolDays(input.range.from, input.range.to, overrides);
  const denominator = eligible * Math.max(schoolDays, 1);
  const counts = countsFromStatuses(records.map((r) => r.status));
  const stats = computeStats(counts, denominator);

  return {
    classId: schoolClass.id,
    className: classLabel(schoolClass.name, schoolClass.letter),
    letter: schoolClass.letter,
    gradeYear: schoolClass.gradeYear,
    stats,
  };
}

export type SchoolStats = {
  stats: AttendanceStats;
  classCount: number;
  studentCount: number;
  sessionCount: number;
  ranking: ReturnType<typeof rankClasses>;
};

/** Whole-school aggregation over a range, including best/worst ranking. */
export async function schoolStatsForRange(
  schoolId: string,
  range: DateRange,
  slots?: ("FULL_DAY" | "MORNING" | "AFTERNOON")[],
): Promise<SchoolStats> {
  const [classes, overrides] = await Promise.all([
    prisma.schoolClass.findMany({
      where: { schoolId, isActive: true, deletedAt: null },
      select: { id: true, name: true, letter: true, gradeYear: true },
      orderBy: [{ gradeYear: "asc" }, { name: "asc" }],
    }),
    getCalendarOverrides(schoolId, range.from, range.to),
  ]);
  const schoolDays = Math.max(countSchoolDays(range.from, range.to, overrides), 1);

  const classStats = await Promise.all(
    classes.map((c) => classStatsForRange({ schoolId, classId: c.id, range, slots })),
  );

  const ranking = rankClasses(classStats);

  const totalCounts = classStats.reduce(
    (acc, c) => mergeCounts(acc, { present: c.stats.present, absent: c.stats.absent, late: c.stats.late, excused: c.stats.excused }),
    emptyCounts(),
  );

  const [eligibleStudents, sessionCount] = await Promise.all([
    prisma.enrollment.count({
      where: {
        schoolId,
        isActive: true,
        status: EnrollmentStatus.ACTIVE,
        startDate: { lte: range.to },
        OR: [{ endDate: null }, { endDate: { gte: range.from } }],
        student: { isActive: true, deletedAt: null },
      },
    }),
    prisma.attendanceSession.count({
      where: {
        schoolId,
        date: { gte: range.from, lte: range.to },
        ...(slots?.length ? { slot: { in: slots } } : {}),
      },
    }),
  ]);

  const stats = computeStats(totalCounts, eligibleStudents * schoolDays);

  return {
    stats,
    classCount: classes.length,
    studentCount: eligibleStudents,
    sessionCount,
    ranking,
  };
}

/** Status distribution for charts: [{name, value, color}] over a range. */
export async function statusDistribution(
  schoolId: string,
  range: DateRange,
  slots?: ("FULL_DAY" | "MORNING" | "AFTERNOON")[],
): Promise<StatusCounts> {
  const records = await prisma.attendanceRecord.findMany({
    where: {
      schoolId,
      session: {
        date: { gte: range.from, lte: range.to },
        ...(slots?.length ? { slot: { in: slots } } : {}),
      },
    },
    select: { status: true },
  });
  return countsFromStatuses(records.map((r) => r.status));
}

/** How many days each class has a register — for coverage visuals. */
export async function classDayCoverage(
  schoolId: string,
  range: DateRange,
): Promise<{ classId: string; className: string; daysWithData: number; schoolDays: number }[]> {
  const [classes, overrides] = await Promise.all([
    prisma.schoolClass.findMany({
      where: { schoolId, isActive: true, deletedAt: null },
      select: { id: true, name: true, letter: true },
    }),
    getCalendarOverrides(schoolId, range.from, range.to),
  ]);
  const schoolDays = Math.max(countSchoolDays(range.from, range.to, overrides), 1);

  const sessions = await prisma.attendanceSession.findMany({
    where: { schoolId, date: { gte: range.from, lte: range.to } },
    select: { classId: true, date: true },
  });
  const dayCountByClass = new Map<string, number>();
  const seen = new Set<string>();
  for (const s of sessions) {
    const key = `${s.classId}:${formatDateOnly(s.date)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    dayCountByClass.set(s.classId, (dayCountByClass.get(s.classId) ?? 0) + 1);
  }

  return classes.map((c) => ({
    classId: c.id,
    className: classLabel(c.name, c.letter),
    daysWithData: dayCountByClass.get(c.id) ?? 0,
    schoolDays,
  }));
}

/** Daily series of attendance rates for a trend chart. */
export type DailyRatePoint = {
  date: string;
  label: string;
  rate: number;
  recorded: number;
  isSchoolDay: boolean;
};

export async function dailyRateSeries(
  schoolId: string,
  range: DateRange,
): Promise<DailyRatePoint[]> {
  const overrides = await getCalendarOverrides(schoolId, range.from, range.to);
  const rows = await prisma.attendanceRecord.findMany({
    where: { schoolId, session: { date: { gte: range.from, lte: range.to } } },
    select: { status: true, session: { select: { date: true } } },
  });

  const byDay = new Map<string, StatusCounts>();
  for (const row of rows) {
    const key = formatDateOnly(row.session.date);
    const bucket = byDay.get(key) ?? emptyCounts();
    addStatus(bucket, row.status);
    byDay.set(key, bucket);
  }

  const out: { date: string; label: string; rate: number; recorded: number; isSchoolDay: boolean }[] = [];
  let cursor = new Date(range.from.getTime());
  while (cursor.getTime() <= range.to.getTime()) {
    const key = formatDateOnly(cursor);
    const counts = byDay.get(key) ?? emptyCounts();
    const stats = computeStats(counts, counts.present + counts.absent + counts.late + counts.excused);
    out.push({
      date: key,
      label: formatDateOnly(cursor).slice(5),
      rate: stats.rate,
      recorded: stats.recorded,
      isSchoolDay: (() => {
        const override = overrides.get(key);
        if (override) return override.isWorkingDay;
        const dow = cursor.getUTCDay();
        return dow !== 0 && dow !== 6;
      })(),
    });
    cursor = new Date(cursor.getTime() + 86_400_000);
  }
  return out;
}

export type HighAbsenceStudent = {
  studentId: string;
  fullName: string;
  className: string;
  absentDays: number;
  rate: number; // absences per school day, as %
};

/** Students whose absences exceed the school-wide threshold, for alerts. */
export async function highAbsenceStudents(
  schoolId: string,
  range: DateRange,
  thresholdPercent = 25,
): Promise<HighAbsenceStudent[]> {
  const overrides = await getCalendarOverrides(schoolId, range.from, range.to);
  const schoolDays = Math.max(countSchoolDays(range.from, range.to, overrides), 1);
  if (schoolDays === 0) return [];

  const records = await prisma.attendanceRecord.findMany({
    where: {
      schoolId,
      status: { in: ["ABSENT", "EXCUSED"] },
      session: { date: { gte: range.from, lte: range.to } },
    },
    select: {
      student: {
        select: { id: true, firstName: true, lastName: true, middleName: true },
      },
      session: { select: { date: true, classId: true } },
    },
  });

  const byStudent = new Map<string, { name: string; missed: Set<string>; classId: string }>();
  for (const r of records) {
    const entry = byStudent.get(r.student.id) ?? {
      name: fullName(r.student),
      missed: new Set<string>(),
      classId: r.session.classId,
    };
    entry.missed.add(formatDateOnly(r.session.date));
    byStudent.set(r.student.id, entry);
  }

  const classNames = new Map<string, string>();
  const classRows = await prisma.schoolClass.findMany({
    where: { schoolId },
    select: { id: true, name: true, letter: true },
  });
  for (const c of classRows) classNames.set(c.id, classLabel(c.name, c.letter));

  const out: HighAbsenceStudent[] = [];
  for (const [studentId, entry] of byStudent) {
    const rate = (entry.missed.size / schoolDays) * 100;
    if (rate >= thresholdPercent) {
      out.push({
        studentId,
        fullName: entry.name,
        className: classNames.get(entry.classId) ?? "—",
        absentDays: entry.missed.size,
        rate: Math.round(rate * 10) / 10,
      });
    }
  }
  out.sort((a, b) => b.rate - a.rate);
  return out.slice(0, 50);
}

export type { AttendanceStats, RankedClass, StatusCounts };
export { parseDateOnly };