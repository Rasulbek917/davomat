import { prisma } from "@/lib/db";
import { formatDateOnly } from "@/lib/date";
import { DEFAULT_WORKING_DAYS } from "@/lib/constants";
import {
  buildResolver,
  type ClassDayResolver,
  type ScheduleVersion,
} from "@/lib/attendance/schedule-core";

/**
 * Database-backed helpers for per-class study days. The pure resolution logic
 * lives in `schedule-core.ts` so it can be unit-tested without a database.
 */

export { buildResolver };
export type { ClassDayResolver, ScheduleVersion };

/** Load all schedule versions (optionally bounded) for a school. */
export async function loadScheduleVersions(
  schoolId: string,
  classIds?: string[],
  to?: Date,
): Promise<ScheduleVersion[]> {
  const rows = await prisma.classSchedule.findMany({
    where: {
      schoolId,
      ...(classIds && classIds.length > 0 ? { classId: { in: classIds } } : {}),
      ...(to ? { effectiveFrom: { lte: to } } : {}),
    },
    orderBy: [{ classId: "asc" }, { effectiveFrom: "asc" }],
    select: { classId: true, effectiveFrom: true, effectiveTo: true, weekdays: true },
  });
  return rows.map((row) => ({
    classId: row.classId,
    effectiveFrom: formatDateOnly(row.effectiveFrom),
    effectiveTo: row.effectiveTo ? formatDateOnly(row.effectiveTo) : null,
    weekdays: row.weekdays,
  }));
}

/** Legacy/default weekly days for classes, used when no versioned schedule exists. */
export async function loadDefaultWeekdays(schoolId: string): Promise<Map<string, number[]>> {
  const rows = await prisma.schoolClass.findMany({
    where: { schoolId, deletedAt: null },
    select: { id: true, workingDays: true },
  });
  return new Map(
    rows.map((row) => [row.id, row.workingDays.length > 0 ? row.workingDays : DEFAULT_WORKING_DAYS]),
  );
}

/** Convenience: build a resolver for a whole school. */
export async function loadClassDayResolver(schoolId: string, to?: Date): Promise<ClassDayResolver> {
  const [versions, defaults] = await Promise.all([
    loadScheduleVersions(schoolId, undefined, to),
    loadDefaultWeekdays(schoolId),
  ]);
  return buildResolver(versions, defaults);
}
