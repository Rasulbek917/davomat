import { prisma } from "@/lib/db";
import { isWeekend, parseDateOnly, type DateRange } from "@/lib/date";

/**
 * School days.
 *
 * The default rule is: Monday–Friday are school days. A school may override any
 * individual date through the `SchoolCalendar` table (holidays, exam days,
 * extra working Saturdays, ...). Statistics that need "the number of school
 * days in a period" must use {@link countSchoolDays} instead of assuming every
 * calendar day counts.
 */

export type CalendarOverride = { date: string; isWorkingDay: boolean; note: string | null };

export async function getCalendarOverrides(
  schoolId: string,
  from: Date,
  to: Date,
): Promise<Map<string, CalendarOverride>> {
  const rows = await prisma.schoolCalendar.findMany({
    where: { schoolId, date: { gte: from, lte: to } },
    select: { date: true, isWorkingDay: true, note: true },
  });
  const map = new Map<string, CalendarOverride>();
  for (const row of rows) {
    const key = row.date.toISOString().slice(0, 10);
    map.set(key, { date: key, isWorkingDay: row.isWorkingDay, note: row.note });
  }
  return map;
}

export function isWorkingDayFor(
  date: Date,
  overrides: Map<string, CalendarOverride>,
): { isWorkingDay: boolean; source: "override" | "default"; note: string | null } {
  const key = date.toISOString().slice(0, 10);
  const override = overrides.get(key);
  if (override) {
    return { isWorkingDay: override.isWorkingDay, source: "override", note: override.note };
  }
  return { isWorkingDay: !isWeekend(date), source: "default", note: null };
}

export function countSchoolDays(from: Date, to: Date, overrides: Map<string, CalendarOverride>): number {
  let count = 0;
  let cursor = new Date(from.getTime());
  while (cursor.getTime() <= to.getTime()) {
    if (isWorkingDayFor(cursor, overrides).isWorkingDay) count += 1;
    cursor = new Date(cursor.getTime() + 86_400_000);
  }
  return count;
}

/** All working dates in an inclusive range. */
export function listSchoolDays(from: Date, to: Date, overrides: Map<string, CalendarOverride>): Date[] {
  const days: Date[] = [];
  let cursor = new Date(from.getTime());
  while (cursor.getTime() <= to.getTime()) {
    if (isWorkingDayFor(cursor, overrides).isWorkingDay) days.push(new Date(cursor.getTime()));
    cursor = new Date(cursor.getTime() + 86_400_000);
  }
  return days;
}

export async function loadWorkingDays(schoolId: string, range: DateRange) {
  const overrides = await getCalendarOverrides(schoolId, range.from, range.to);
  return {
    overrides,
    schoolDays: listSchoolDays(range.from, range.to, overrides),
    defaultWorkingDayCount: countSchoolDays(range.from, range.to, overrides),
  };
}

/** Convenience for URL/parameter parsing of a school day. */
export function normalizeDay(input: string | null | undefined): Date {
  return parseDateOnly(input) ?? parseDateOnly(new Date().toISOString().slice(0, 10))!;
}
