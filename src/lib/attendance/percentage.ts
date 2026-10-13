import type { AttendanceStatus } from "@prisma/client";

/**
 * ---------------------------------------------------------------------------
 * Attendance percentage — single source of truth
 * ---------------------------------------------------------------------------
 * Rules (see ARCHITECTURE.md §"Attendance semantics"):
 *
 *  1. Eligibility: only students who were actually enrolled in the class on the
 *     selected date are counted. Students who joined later or left earlier are
 *     excluded from the denominator.
 *  2. "Attended"  = PRESENT + LATE   (a late student did attend).
 *  3. "Missed"    = ABSENT + EXCUSED (excused still means not present).
 *  4. Attendance rate = attended / recorded. Unrecorded students are NEVER
 *     silently treated as absent — they are reported separately as `coverage`.
 *  5. Coverage = recorded / eligible. A class whose coverage is below
 *     {@link MIN_COVERAGE_FOR_RANKING} is flagged `reliable: false` and must not
 *     be presented as "best"/"worst" without indicating the limitation.
 * ---------------------------------------------------------------------------
 */

export const MIN_COVERAGE_FOR_RANKING = 70;

export type StatusCounts = {
  present: number;
  absent: number;
  late: number;
  excused: number;
};

export type AttendanceStats = StatusCounts & {
  /** Number of attendance records present for the period. */
  recorded: number;
  /** Students eligible to be marked (enrolment-based). */
  eligible: number;
  /** present + late */
  attended: number;
  /** absent + excused */
  missed: number;
  /** Unrecorded students: max(eligible - recorded, 0). */
  unrecorded: number;
  /** attended / recorded, 0 when nothing recorded. */
  rate: number;
  /** recorded / eligible, 0 when nobody is eligible. */
  coverage: number;
  /** Whether the sample is complete enough to be ranked/compared. */
  reliable: boolean;
};

export function emptyCounts(): StatusCounts {
  return { present: 0, absent: 0, late: 0, excused: 0 };
}

export function countsFromStatuses(statuses: AttendanceStatus[]): StatusCounts {
  const counts = emptyCounts();
  for (const status of statuses) addStatus(counts, status);
  return counts;
}

export function addStatus(counts: StatusCounts, status: AttendanceStatus): void {
  switch (status) {
    case "PRESENT":
      counts.present += 1;
      break;
    case "ABSENT":
      counts.absent += 1;
      break;
    case "LATE":
      counts.late += 1;
      break;
    case "EXCUSED":
      counts.excused += 1;
      break;
  }
}

export function mergeCounts(a: StatusCounts, b: StatusCounts): StatusCounts {
  return {
    present: a.present + b.present,
    absent: a.absent + b.absent,
    late: a.late + b.late,
    excused: a.excused + b.excused,
  };
}

export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function computeStats(
  counts: StatusCounts,
  eligible: number,
  options: { minCoverage?: number } = {},
): AttendanceStats {
  const recorded = counts.present + counts.absent + counts.late + counts.excused;
  const attended = counts.present + counts.late;
  const missed = counts.absent + counts.excused;
  const safeEligible = Math.max(eligible, recorded);
  const unrecorded = Math.max(safeEligible - recorded, 0);
  const rate = recorded > 0 ? round1((attended / recorded) * 100) : 0;
  const coverage = safeEligible > 0 ? round1((recorded / safeEligible) * 100) : 0;
  const minCoverage = options.minCoverage ?? MIN_COVERAGE_FOR_RANKING;

  return {
    ...counts,
    recorded,
    eligible: safeEligible,
    attended,
    missed,
    unrecorded,
    rate,
    coverage,
    reliable: recorded > 0 && coverage >= minCoverage,
  };
}

export type RankedClass = {
  classId: string;
  className: string;
  letter: string | null;
  gradeYear: number;
  stats: AttendanceStats;
};

export type RankingOutcome = {
  best: RankedClass | null;
  worst: RankedClass | null;
  /** True when no class had enough data to be ranked meaningfully. */
  insufficientData: boolean;
  /** All classes that had at least one record but insufficient coverage. */
  excludedForInsufficientData: RankedClass[];
  ranked: RankedClass[];
};

/**
 * Rank classes by attendance rate.
 * - Classes with no records at all are excluded entirely.
 * - Classes with insufficient coverage are excluded from best/worst and
 *   reported separately so the UI can explain why.
 */
export function rankClasses(classes: RankedClass[], minCoverage = MIN_COVERAGE_FOR_RANKING): RankingOutcome {
  const withData = classes.filter((c) => c.stats.recorded > 0);
  const eligibleForRanking = withData.filter((c) => c.stats.coverage >= minCoverage);
  const excludedForInsufficientData = withData.filter((c) => c.stats.coverage < minCoverage);

  if (eligibleForRanking.length === 0) {
    return {
      best: null,
      worst: null,
      insufficientData: withData.length > 0,
      excludedForInsufficientData,
      ranked: [],
    };
  }

  const ranked = [...eligibleForRanking].sort((a, b) => {
    if (b.stats.rate !== a.stats.rate) return b.stats.rate - a.stats.rate;
    // Tie-break by fewer missed, then by name for stability.
    if (a.stats.missed !== b.stats.missed) return a.stats.missed - b.stats.missed;
    return a.className.localeCompare(b.className, "uz");
  });

  const best = ranked[0];
  const worst = ranked[ranked.length - 1];

  // A single class cannot be both best and worst.
  const sameClass = ranked.length === 1;

  return {
    best,
    worst: sameClass ? null : worst,
    insufficientData: false,
    excludedForInsufficientData,
    ranked,
  };
}

/** Threshold above which an absence rate is considered "unusually high". */
export const HIGH_ABSENCE_THRESHOLD = 25;
