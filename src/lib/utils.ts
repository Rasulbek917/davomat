import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge conditional class names, resolving Tailwind conflicts. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Uz (Latin) aware name initials, e.g. "Ali Valiyev" -> "AV". */
export function initials(firstName?: string | null, lastName?: string | null) {
  const a = (firstName ?? "").trim().charAt(0);
  const b = (lastName ?? "").trim().charAt(0);
  return `${a}${b}`.toUpperCase() || "?";
}

export function fullName(
  p: { firstName?: string | null; lastName?: string | null; middleName?: string | null } | null | undefined,
) {
  if (!p) return "";
  return [p.lastName, p.firstName, p.middleName].filter(Boolean).join(" ").trim();
}

/** Short, human readable Uzbek label for a full name: "Valiyev Ali". */
export function shortName(
  p: { firstName?: string | null; lastName?: string | null } | null | undefined,
) {
  if (!p) return "";
  return [p.lastName, p.firstName].filter(Boolean).join(" ");
}

export function percentage(part: number, total: number): number {
  if (!total || total <= 0) return 0;
  return Math.round((part / total) * 1000) / 10;
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1).replace(/\.0$/, "")}%`;
}

/** Deterministic, human-readable class label: "5-A". */
export function classLabel(name: string, letter?: string | null) {
  return letter ? `${name}-${letter}` : name;
}

export function pluralUz(n: number, one: string, many: string) {
  return n === 1 ? one : many;
}

export function truncate(value: string, max = 60) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/** Safe JSON parse that never throws. */
export function safeJson<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}
