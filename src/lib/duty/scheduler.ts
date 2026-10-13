/**
 * ---------------------------------------------------------------------------
 * Duty (navbatchilik) auto-scheduler
 * ---------------------------------------------------------------------------
 * A deterministic, fairness-first greedy algorithm. It is a pure function so
 * it can be unit-tested and previewed without touching the database.
 *
 * Fairness rules, in priority order:
 *   1. Fewest total assignments so far (including history handed in).
 *   2. Avoid putting a teacher on duty on consecutive duty dates when
 *      `avoidConsecutive` is enabled.
 *   3. Longest time since that teacher's last duty.
 *   4. Name (locale compare) as a stable, deterministic tie-breaker.
 *
 * The algorithm never fabricates a schedule: if there are not enough available
 * teachers for a date it records an explicit conflict instead of silently
 * producing a short or unfair day.
 */

export type SchedulerTeacher = {
  id: string;
  name: string;
  /** Assignments already recorded before this run. */
  assignedCount: number;
  /** Most recent duty date (YYYY-MM-DD) before this run, or null. */
  lastAssignedDate: string | null;
  /** ISO weekday availability windows already excluded upstream. */
  unavailableDates?: Iterable<string>;
};

export type SchedulerInput = {
  /** Duty dates in ascending order (YYYY-MM-DD). */
  dates: string[];
  /** Teachers required per day. */
  perDay: number;
  teachers: SchedulerTeacher[];
  avoidConsecutive: boolean;
};

export type SchedulerAssignment = { date: string; teacherId: string; slotIndex: number };

export type SchedulerConflict = {
  date: string;
  required: number;
  available: number;
  message: string;
};

export type SchedulerDistribution = {
  teacherId: string;
  name: string;
  total: number;
  added: number;
};

export type SchedulerResult = {
  assignments: SchedulerAssignment[];
  conflicts: SchedulerConflict[];
  distribution: SchedulerDistribution[];
};

export function scheduleDuty(input: SchedulerInput): SchedulerResult {
  const { dates, perDay, teachers, avoidConsecutive } = input;

  const state = teachers.map((teacher) => ({
    id: teacher.id,
    name: teacher.name,
    total: teacher.assignedCount,
    added: 0,
    lastDate: teacher.lastAssignedDate,
    unavailable: new Set(teacher.unavailableDates ?? []),
  }));
  const byId = new Map(state.map((t) => [t.id, t]));

  const assignments: SchedulerAssignment[] = [];
  const conflicts: SchedulerConflict[] = [];

  let previousDate: string | null = null;

  for (const date of dates) {
    const available = state.filter((t) => !t.unavailable.has(date));
    if (available.length === 0) {
      conflicts.push({
        date,
        required: perDay,
        available: 0,
        message: "Bu sana uchun navbatchilikka tayin o‘qituvchi yo‘q.",
      });
      previousDate = date;
      continue;
    }

    const candidates = [...available].sort((a, b) => {
      // 1. Fairness: fewest total assignments.
      if (a.total !== b.total) return a.total - b.total;
      // 2. Avoid consecutive duty.
      if (avoidConsecutive) {
        const aConsec = a.lastDate === previousDate ? 1 : 0;
        const bConsec = b.lastDate === previousDate ? 1 : 0;
        if (aConsec !== bConsec) return aConsec - bConsec;
      }
      // 3. Longest since last duty (null = never → highest priority).
      const aLast = a.lastDate ?? "";
      const bLast = b.lastDate ?? "";
      if (aLast !== bLast) return aLast.localeCompare(bLast);
      // 4. Stable tie-break.
      return a.name.localeCompare(b.name, "uz");
    });

    const needed = Math.min(perDay, candidates.length);
    if (needed < perDay) {
      conflicts.push({
        date,
        required: perDay,
        available: candidates.length,
        message: `Bu sanada faqat ${candidates.length} nafar o‘qituvchi mavjud (kerak: ${perDay}).`,
      });
    }

    for (let slot = 0; slot < needed; slot += 1) {
      const chosen = candidates[slot];
      const teacher = byId.get(chosen.id);
      if (!teacher) continue;
      teacher.total += 1;
      teacher.added += 1;
      teacher.lastDate = date;
      assignments.push({ date, teacherId: chosen.id, slotIndex: slot });
      // Re-sort for the next slot handled naturally: we already picked distinct
      // candidates, so no duplicate within the same day.
    }

    previousDate = date;
  }

  const distribution: SchedulerDistribution[] = state
    .map((t) => ({ teacherId: t.id, name: t.name, total: t.total, added: t.added }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "uz"));

  return { assignments, conflicts, distribution };
}

/** Summary of how evenly duty was distributed (0 = perfectly even). */
export function distributionSpread(distribution: SchedulerDistribution[]): number {
  if (distribution.length === 0) return 0;
  const totals = distribution.map((d) => d.total);
  return Math.max(...totals) - Math.min(...totals);
}
