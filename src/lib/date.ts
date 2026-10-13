/**
 * Date utilities.
 *
 * All attendance/statistics logic works with "date-only" values (a calendar day
 * in the school's timezone, `Asia/Tashkent`) which are represented as a JS Date
 * at UTC midnight so they map cleanly onto Prisma `@db.Date` columns.
 */

export const TIMEZONE = process.env.APP_TIMEZONE || "Asia/Tashkent";
export const LOCALE = "uz-Latn-UZ";

const MS_PER_DAY = 86_400_000;

export const UZ_MONTHS = [
  "yanvar",
  "fevral",
  "mart",
  "aprel",
  "may",
  "iyun",
  "iyul",
  "avgust",
  "sentabr",
  "oktabr",
  "noyabr",
  "dekabr",
] as const;

export const UZ_WEEKDAYS = [
  "yakshanba",
  "dushanba",
  "seshanba",
  "chorshanba",
  "payshanba",
  "juma",
  "shanba",
] as const;

const tzFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

export type DateParts = {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
};

/** Wall-clock parts of an instant in the school timezone. */
export function tzParts(instant: Date = new Date()): DateParts {
  const parts = tzFormatter.formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour") % 24,
    minute: get("minute"),
    second: get("second"),
  };
}

/** Build a date-only value (UTC midnight) from calendar components. */
export function dateOnly(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

/** "Today" as a date-only value in the school timezone. */
export function today(): Date {
  const p = tzParts(new Date());
  return dateOnly(p.year, p.month, p.day);
}

/** Convert an instant into the date-only value of its calendar day in TZ. */
export function toDateOnly(value: Date | string): Date {
  const d = typeof value === "string" ? new Date(value) : value;
  const p = tzParts(d);
  return dateOnly(p.year, p.month, p.day);
}

/** Parse "YYYY-MM-DD" (or an ISO string) into a date-only value. Returns null if invalid. */
export function parseDateOnly(input: string | null | undefined): Date | null {
  if (!input) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(input.trim());
  if (m) {
    const [, y, mo, d] = m;
    const year = Number(y);
    const month = Number(mo);
    const day = Number(d);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const result = dateOnly(year, month, day);
    // Reject overflow like 2026-02-31
    if (result.getUTCMonth() + 1 !== month || result.getUTCDate() !== day) return null;
    return result;
  }
  const parsed = new Date(input);
  return Number.isNaN(parsed.getTime()) ? null : toDateOnly(parsed);
}

/** "YYYY-MM-DD" in UTC from a date-only value (safe for <input type="date">). */
export function formatDateOnly(value: Date): string {
  const y = value.getUTCFullYear();
  const m = String(value.getUTCMonth() + 1).padStart(2, "0");
  const d = String(value.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(value: Date, days: number): Date {
  return new Date(value.getTime() + days * MS_PER_DAY);
}

export function addMonths(value: Date, months: number): Date {
  const y = value.getUTCFullYear();
  const m = value.getUTCMonth();
  const d = value.getUTCDate();
  return dateOnly(y, m + 1 + months, d);
}

export function diffDays(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / MS_PER_DAY);
}

/** Monday-based start of week. */
export function startOfWeek(value: Date): Date {
  const dow = value.getUTCDay(); // 0 = Sunday
  const delta = dow === 0 ? -6 : 1 - dow;
  return addDays(value, delta);
}

export function endOfWeek(value: Date): Date {
  return addDays(startOfWeek(value), 6);
}

export function startOfMonth(value: Date): Date {
  return dateOnly(value.getUTCFullYear(), value.getUTCMonth() + 1, 1);
}

export function endOfMonth(value: Date): Date {
  return dateOnly(value.getUTCFullYear(), value.getUTCMonth() + 2, 0);
}

export function isSameDay(a: Date, b: Date): boolean {
  return formatDateOnly(a) === formatDateOnly(b);
}

/** Inclusive list of date-only values between two dates (max `limit` entries). */
export function eachDay(from: Date, to: Date, limit = 400): Date[] {
  const out: Date[] = [];
  let cursor = from;
  while (cursor.getTime() <= to.getTime() && out.length < limit) {
    out.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return out;
}

export function isWeekend(value: Date): boolean {
  const dow = value.getUTCDay();
  return dow === 0 || dow === 6;
}

// --------------------------- Uzbek formatting -------------------------------

/** "12-may 2026-yil" */
export function formatUzDate(value: Date): string {
  const d = value.getUTCDate();
  const m = UZ_MONTHS[value.getUTCMonth()];
  const y = value.getUTCFullYear();
  return `${d}-${m} ${y}-yil`;
}

/** "12-may" */
export function formatUzDateShort(value: Date): string {
  return `${value.getUTCDate()}-${UZ_MONTHS[value.getUTCMonth()]}`;
}

/** "12-may 2026-yil, dushanba" */
export function formatUzDateLong(value: Date): string {
  return `${formatUzDate(value)}, ${UZ_WEEKDAYS[value.getUTCDay()]}`;
}

export function formatUzMonthYear(value: Date): string {
  return `${UZ_MONTHS[value.getUTCMonth()]} ${value.getUTCFullYear()}`;
}

/** "12-may 2026-yil, 14:30" for an instant, rendered in the school timezone. */
export function formatUzDateTime(instant: Date | string | null | undefined): string {
  if (!instant) return "—";
  const d = typeof instant === "string" ? new Date(instant) : instant;
  if (Number.isNaN(d.getTime())) return "—";
  const p = tzParts(d);
  const hh = String(p.hour).padStart(2, "0");
  const mm = String(p.minute).padStart(2, "0");
  return `${p.day}-${UZ_MONTHS[p.month - 1]} ${p.year}-yil, ${hh}:${mm}`;
}

export function formatUzTime(instant: Date | string | null | undefined): string {
  if (!instant) return "—";
  const d = typeof instant === "string" ? new Date(instant) : instant;
  const p = tzParts(d);
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

/** Relative Uzbek label used in activity feeds. */
export function formatUzRelative(instant: Date | string | null | undefined): string {
  if (!instant) return "—";
  const d = typeof instant === "string" ? new Date(instant) : instant;
  const diff = Date.now() - d.getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "hozir";
  if (mins < 60) return `${mins} daqiqa oldin`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} soat oldin`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} kun oldin`;
  return formatUzDate(toDateOnly(d));
}

// ------------------------------ Period parsing ------------------------------

export type PeriodPreset =
  | "today"
  | "yesterday"
  | "week"
  | "month"
  | "year"
  | "last7"
  | "last30"
  | "custom";

export type DateRange = { from: Date; to: Date; label: string; preset: PeriodPreset };

export const PERIOD_PRESETS: { value: PeriodPreset; label: string }[] = [
  { value: "today", label: "Bugun" },
  { value: "yesterday", label: "Kecha" },
  { value: "week", label: "Shu hafta" },
  { value: "month", label: "Shu oy" },
  { value: "year", label: "Shu yil" },
  { value: "last7", label: "Oxirgi 7 kun" },
  { value: "last30", label: "Oxirgi 30 kun" },
  { value: "custom", label: "Sana oralig‘i" },
];

/** Resolve a preset + optional custom range into a concrete inclusive range. */
export function resolveRange(
  preset: string | null | undefined,
  fromInput?: string | null,
  toInput?: string | null,
  now: Date = today(),
): DateRange {
  switch (preset) {
    case "yesterday": {
      const d = addDays(now, -1);
      return { from: d, to: d, label: "Kecha", preset: "yesterday" };
    }
    case "week": {
      const from = startOfWeek(now);
      const to = endOfWeek(now);
      return { from, to, label: "Shu hafta", preset: "week" };
    }
    case "month": {
      const from = startOfMonth(now);
      const to = endOfMonth(now);
      return { from, to, label: "Shu oy", preset: "month" };
    }
    case "year": {
      const from = dateOnly(now.getUTCFullYear(), 1, 1);
      const to = dateOnly(now.getUTCFullYear(), 12, 31);
      return { from, to, label: "Shu yil", preset: "year" };
    }
    case "last7":
      return { from: addDays(now, -6), to: now, label: "Oxirgi 7 kun", preset: "last7" };
    case "last30":
      return { from: addDays(now, -29), to: now, label: "Oxirgi 30 kun", preset: "last30" };
    case "custom": {
      const from = parseDateOnly(fromInput) ?? now;
      const to = parseDateOnly(toInput) ?? now;
      const [a, b] = from.getTime() <= to.getTime() ? [from, to] : [to, from];
      return { from: a, to: b, label: "Sana oralig‘i", preset: "custom" };
    }
    case "today":
    default:
      return { from: now, to: now, label: "Bugun", preset: "today" };
  }
}
