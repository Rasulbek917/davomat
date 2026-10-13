import { DEFAULT_WORKING_DAYS, isoWeekday } from "@/lib/constants";
import { formatDateOnly } from "@/lib/date";

/**
 * Pure per-class study-day resolution (no database access).
 *
 * Resolution rules:
 *   1. The schedule in force on a date is the version with the greatest
 *      `effectiveFrom` <= date.
 *   2. A class with no versioned schedule falls back to its legacy
 *      `workingDays`, then to the Monday–Friday default.
 *   3. The school calendar may turn a normally-studying weekday into a holiday,
 *      but can NOT force a class to study on a weekday outside its own schedule.
 */

export type ScheduleVersion = {
  classId: string;
  effectiveFrom: string; // YYYY-MM-DD
  effectiveTo: string | null;
  weekdays: number[];
};

export type DateSpan = { from: Date; to: Date };

export type ClassDayResolver = {
  weekdaysFor: (classId: string, date: Date) => number[];
  studiesWeekday: (classId: string, date: Date) => boolean;
  isStudyDay: (classId: string, date: Date, schoolOverride?: boolean) => boolean;
  countStudyDays: (classId: string, span: DateSpan, overrides: Map<string, boolean>) => number;
};

const key = (date: Date) => formatDateOnly(date);

function sortVersions(versions: ScheduleVersion[]): ScheduleVersion[] {
  return [...versions].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
}

export function buildResolver(
  versions: ScheduleVersion[],
  defaultWeekdays: Map<string, number[]>,
): ClassDayResolver {
  const byClass = new Map<string, ScheduleVersion[]>();
  for (const version of versions) {
    const list = byClass.get(version.classId) ?? [];
    list.push(version);
    byClass.set(version.classId, list);
  }
  for (const [classId, list] of byClass) byClass.set(classId, sortVersions(list));

  const weekdaysFor = (classId: string, date: Date): number[] => {
    const iso = key(date);
    const list = byClass.get(classId);
    if (list) {
      let match: ScheduleVersion | null = null;
      for (const version of list) {
        if (version.effectiveFrom <= iso) match = version;
        else break;
      }
      if (match) return match.weekdays;
    }
    return defaultWeekdays.get(classId) ?? DEFAULT_WORKING_DAYS;
  };

  const studiesWeekday = (classId: string, date: Date) =>
    weekdaysFor(classId, date).includes(isoWeekday(date));

  const isStudyDay = (classId: string, date: Date, schoolOverride?: boolean) => {
    if (schoolOverride === false) return false;
    return studiesWeekday(classId, date);
  };

  const countStudyDays = (classId: string, span: DateSpan, overrides: Map<string, boolean>) => {
    let count = 0;
    let cursor = new Date(span.from.getTime());
    while (cursor.getTime() <= span.to.getTime()) {
      if (isStudyDay(classId, cursor, overrides.get(key(cursor)))) count += 1;
      cursor = new Date(cursor.getTime() + 86_400_000);
    }
    return count;
  };

  return { weekdaysFor, studiesWeekday, isStudyDay, countStudyDays };
}
