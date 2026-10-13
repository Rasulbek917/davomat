import { prisma } from "@/lib/db";
import {
  addDays,
  eachDay,
  endOfMonth,
  endOfWeek,
  formatDateOnly,
  startOfMonth,
  startOfWeek,
} from "@/lib/date";
import { DEFAULT_WORKING_DAYS, isoWeekday } from "@/lib/constants";
import { fullName } from "@/lib/utils";
import type { DutyAssignmentStatus } from "@prisma/client";

/**
 * Read-side helpers for the duty (navbatchilik) module. All queries are scoped
 * by `schoolId`; the caller derives that from the session.
 */

export type DutySettingsSummary = {
  id: string;
  title: string;
  startDate: string | null;
  endDate: string | null;
  perDay: number;
  weekdays: number[];
  avoidConsecutive: boolean;
  isActive: boolean;
};

export type DutyAssignmentRow = {
  id: string;
  date: string;
  dateLabel: string;
  teacherId: string;
  teacherName: string;
  slotIndex: number;
  status: DutyAssignmentStatus;
  note: string | null;
  originalTeacherName: string | null;
};

const nameOf = (user: { firstName: string; lastName: string; middleName: string | null } | null) =>
  user ? fullName(user) || "Noma’lum" : null;

export async function loadDutySettings(schoolId: string): Promise<DutySettingsSummary | null> {
  const settings = await prisma.dutySettings.findUnique({
    where: { schoolId },
    select: {
      id: true,
      title: true,
      startDate: true,
      endDate: true,
      perDay: true,
      weekdays: true,
      avoidConsecutive: true,
      isActive: true,
    },
  });
  if (!settings) return null;
  return {
    id: settings.id,
    title: settings.title,
    startDate: settings.startDate ? formatDateOnly(settings.startDate) : null,
    endDate: settings.endDate ? formatDateOnly(settings.endDate) : null,
    perDay: settings.perDay,
    weekdays: settings.weekdays.sort((a, b) => a - b),
    avoidConsecutive: settings.avoidConsecutive,
    isActive: settings.isActive,
  };
}

export type DutyRange = { from: Date; to: Date };

export async function listDutyAssignments(
  schoolId: string,
  range: DutyRange,
  teacherId?: string,
): Promise<DutyAssignmentRow[]> {
  const rows = await prisma.dutyAssignment.findMany({
    where: {
      schoolId,
      date: { gte: range.from, lte: range.to },
      ...(teacherId ? { teacherId } : {}),
    },
    orderBy: [{ date: "asc" }, { slotIndex: "asc" }],
    select: {
      id: true,
      date: true,
      slotIndex: true,
      status: true,
      note: true,
      teacherId: true,
      teacher: { select: { firstName: true, lastName: true, middleName: true } },
      originalTeacher: { select: { firstName: true, lastName: true, middleName: true } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    date: formatDateOnly(row.date),
    dateLabel: `${formatDateOnly(row.date)}`,
    teacherId: row.teacherId,
    teacherName: nameOf(row.teacher) ?? "Noma’lum",
    slotIndex: row.slotIndex,
    status: row.status,
    note: row.note,
    originalTeacherName: nameOf(row.originalTeacher),
  }));
}

export type DutyFairnessRow = {
  teacherId: string;
  teacherName: string;
  total: number;
  planned: number;
  completed: number;
  lastDate: string | null;
  consecutivePairs: number;
};

export type DutyDashboard = {
  settings: DutySettingsSummary | null;
  teacherOptions: { id: string; label: string }[];
  todayAssignments: DutyAssignmentRow[];
  nextDate: string | null;
  nextAssignments: DutyAssignmentRow[];
  weekCount: number;
  monthCount: number;
  unplannedDates: string[];
  consecutivePairs: number;
  fairness: DutyFairnessRow[];
};

/** Dates in a range that are duty days according to the weekly settings. */
export function dutyDates(settings: DutySettingsSummary, from: Date, to: Date): string[] {
  const allowed = new Set(settings.weekdays.length > 0 ? settings.weekdays : DEFAULT_WORKING_DAYS);
  const start = settings.startDate ? new Date(`${settings.startDate}T00:00:00.000Z`) : from;
  const end = settings.endDate ? new Date(`${settings.endDate}T00:00:00.000Z`) : to;
  const effectiveFrom = start.getTime() > from.getTime() ? start : from;
  const effectiveTo = end.getTime() < to.getTime() ? end : to;
  if (effectiveFrom.getTime() > effectiveTo.getTime()) return [];
  return eachDay(effectiveFrom, effectiveTo, 1000)
    .filter((date) => allowed.has(isoWeekday(date)))
    .map((date) => formatDateOnly(date));
}

export async function getDutyDashboard(schoolId: string, today: Date): Promise<DutyDashboard> {
  const settings = await loadDutySettings(schoolId);

  const [teachers, assignments, fairnessRows] = await Promise.all([
    prisma.user.findMany({
      where: { schoolId, deletedAt: null, isActive: true, role: { key: { in: ["TEACHER", "DEPUTY_DIRECTOR"] } } },
      select: { id: true, firstName: true, lastName: true, middleName: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    listDutyAssignments(schoolId, { from: addDays(today, -400), to: addDays(today, 400) }),
    loadFairness(schoolId),
  ]);

  const todayIso = formatDateOnly(today);
  const todayAssignments = assignments.filter((a) => a.date === todayIso && a.status !== "CANCELLED");
  const upcoming = assignments.filter((a) => a.date > todayIso && a.status !== "CANCELLED");
  const nextDate = upcoming.length > 0 ? upcoming[0].date : null;
  const nextAssignments = nextDate ? upcoming.filter((a) => a.date === nextDate) : [];

  const weekFrom = formatDateOnly(startOfWeek(today));
  const weekTo = formatDateOnly(endOfWeek(today));
  const monthFrom = formatDateOnly(startOfMonth(today));
  const monthTo = formatDateOnly(endOfMonth(today));

  const active = assignments.filter((a) => a.status !== "CANCELLED");
  const weekCount = active.filter((a) => a.date >= weekFrom && a.date <= weekTo).length;
  const monthCount = active.filter((a) => a.date >= monthFrom && a.date <= monthTo).length;

  let unplannedDates: string[] = [];
  if (settings) {
    const plannedSet = new Set(active.map((a) => a.date));
    const horizon = eachDay(today, addDays(today, 60), 90)
      .map((d) => formatDateOnly(d))
      .filter((iso) => iso >= todayIso);
    unplannedDates = horizon.filter((iso) => !plannedSet.has(iso));
  }

  const consecutivePairs = countConsecutivePairs(active);

  return {
    settings,
    teacherOptions: teachers.map((t) => ({ id: t.id, label: fullName(t) || "Noma’lum" })),
    todayAssignments,
    nextDate,
    nextAssignments,
    weekCount,
    monthCount,
    unplannedDates,
    consecutivePairs,
    fairness: fairnessRows,
  };
}

async function loadFairness(schoolId: string): Promise<DutyFairnessRow[]> {
  const rows = await prisma.dutyAssignment.findMany({
    where: { schoolId },
    select: {
      teacherId: true,
      date: true,
      status: true,
      teacher: { select: { firstName: true, lastName: true, middleName: true, isActive: true, deletedAt: true } },
    },
    orderBy: { date: "asc" },
  });

  const map = new Map<string, DutyFairnessRow & { dates: string[] }>();
  for (const row of rows) {
    const entry = map.get(row.teacherId) ?? {
      teacherId: row.teacherId,
      teacherName: nameOf(row.teacher) ?? "Noma’lum",
      total: 0,
      planned: 0,
      completed: 0,
      lastDate: null,
      consecutivePairs: 0,
      dates: [],
    };
    entry.total += 1;
    if (row.status === "PLANNED") entry.planned += 1;
    if (row.status === "COMPLETED") entry.completed += 1;
    entry.dates.push(formatDateOnly(row.date));
    map.set(row.teacherId, entry);
  }

  return [...map.values()]
    .map((entry) => {
      const sorted = [...entry.dates].sort();
      let pairs = 0;
      for (let i = 1; i < sorted.length; i += 1) {
        const prev = new Date(`${sorted[i - 1]}T00:00:00.000Z`);
        const cur = new Date(`${sorted[i]}T00:00:00.000Z`);
        if (cur.getTime() - prev.getTime() === 86_400_000) pairs += 1;
      }
      return {
        teacherId: entry.teacherId,
        teacherName: entry.teacherName,
        total: entry.total,
        planned: entry.planned,
        completed: entry.completed,
        lastDate: sorted.length > 0 ? sorted[sorted.length - 1] : null,
        consecutivePairs: pairs,
      };
    })
    .sort((a, b) => b.total - a.total || a.teacherName.localeCompare(b.teacherName, "uz"));
}

function countConsecutivePairs(assignments: DutyAssignmentRow[]): number {
  const byTeacher = new Map<string, string[]>();
  for (const a of assignments) {
    const list = byTeacher.get(a.teacherId) ?? [];
    list.push(a.date);
    byTeacher.set(a.teacherId, list);
  }
  let pairs = 0;
  for (const dates of byTeacher.values()) {
    const sorted = [...new Set(dates)].sort();
    for (let i = 1; i < sorted.length; i += 1) {
      const prev = new Date(`${sorted[i - 1]}T00:00:00.000Z`);
      const cur = new Date(`${sorted[i]}T00:00:00.000Z`);
      if (cur.getTime() - prev.getTime() === 86_400_000) pairs += 1;
    }
  }
  return pairs;
}
