import { type DateRange } from "@/lib/date";
import { AttendanceStatus, EnrollmentStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { countsFromStatuses, emptyCounts, computeStats, type StatusCounts } from "@/lib/attendance/percentage";


export type StudentRankingRow = {
  studentId: string;
  enrollmentId: string;
  fullName: string;
  present: number;
  absent: number;
  late: number;
  excused: number;
  recorded: number;
  rate: number;
};

export async function classStudentRanking(
  schoolId: string,
  classId: string,
  range: DateRange,
): Promise<StudentRankingRow[]> {
  const enrollments = await prisma.enrollment.findMany({
    where: {
      schoolId,
      classId,
      isActive: true,
      status: EnrollmentStatus.ACTIVE,
      startDate: { lte: range.to },
      OR: [{ endDate: null }, { endDate: { gte: range.from } }],
      student: { isActive: true, deletedAt: null },
    },
    select: {
      id: true,
      student: { select: { id: true, firstName: true, lastName: true, middleName: true } },
    },
    orderBy: [{ student: { lastName: "asc" } }, { student: { firstName: "asc" } }],
  });

  if (enrollments.length === 0) return [];

  const records = await prisma.attendanceRecord.findMany({
    where: {
      schoolId,
      enrollmentId: { in: enrollments.map((e) => e.id) },
      session: { date: { gte: range.from, lte: range.to } },
    },
    select: { enrollmentId: true, status: true },
  });

  const map = new Map<string, StatusCounts>();
  for (const e of enrollments) map.set(e.id, emptyCounts());
  for (const r of records) {
    const c = map.get(r.enrollmentId ?? "");
    if (c) {
      switch (r.status) {
        case "PRESENT": c.present++; break;
        case "ABSENT": c.absent++; break;
        case "LATE": c.late++; break;
        case "EXCUSED": c.excused++; break;
      }
    }
  }

  const rows: StudentRankingRow[] = enrollments.map((e) => {
    const c = map.get(e.id) ?? emptyCounts();
    const recorded = c.present + c.absent + c.late + c.excused;
    const attended = c.present + c.late;
    return {
      studentId: e.student.id,
      enrollmentId: e.id,
      fullName: [e.student.lastName, e.student.firstName, e.student.middleName].filter(Boolean).join(" "),
      present: c.present,
      absent: c.absent,
      late: c.late,
      excused: c.excused,
      recorded,
      rate: recorded > 0 ? Math.round((attended / recorded) * 1000) / 10 : 0,
    };
  });

  rows.sort((a, b) => b.rate - a.rate || a.fullName.localeCompare(b.fullName, "uz"));

  return rows;
}

export async function todayStatusStudents(
  schoolId: string,
  classId: string,
  date: Date,
) {
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
      student: { select: { id: true, firstName: true, lastName: true, middleName: true } },
    },
  });

  if (enrollments.length === 0) return [] as Array<{ studentId: string; fullName: string; status: AttendanceStatus }>;

  const sessions = await prisma.attendanceSession.findMany({
    where: { schoolId, classId, date },
    select: { id: true, slot: true },
  });

  if (sessions.length === 0) return [];

  const sessionIds = sessions.map((s) => s.id);
  const records = await prisma.attendanceRecord.findMany({
    where: {
      schoolId,
      sessionId: { in: sessionIds },
      enrollmentId: { in: enrollments.map((e) => e.id) },
      status: { in: [AttendanceStatus.ABSENT, AttendanceStatus.LATE, AttendanceStatus.EXCUSED] },
    },
    select: { studentId: true, status: true, enrollmentId: true },
  });

  const map = new Map<string, AttendanceStatus>();
  for (const r of records) {
    if (!map.has(r.studentId)) map.set(r.studentId, r.status);
  }

  const out: Array<{ studentId: string; fullName: string; status: AttendanceStatus }> = [];
  for (const e of enrollments) {
    const s = map.get(e.student.id);
    if (s) {
      out.push({
        studentId: e.student.id,
        fullName: [e.student.lastName, e.student.firstName, e.student.middleName].filter(Boolean).join(" "),
        status: s,
      });
    }
  }
  out.sort((a, b) => a.fullName.localeCompare(b.fullName, "uz"));
  return out;
}

export async function studentExtremes(
  schoolId: string,
  classId: string,
  range: DateRange,
) {
  const ranking = await classStudentRanking(schoolId, classId, range);
  if (ranking.length === 0) return { best: null, worst: null };
  const best = ranking[0];
  const worst = ranking[ranking.length - 1];
  if (best.studentId === worst.studentId) return { best, worst: null };
  return { best, worst };
}
