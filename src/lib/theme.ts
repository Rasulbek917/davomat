import type { ThemePreference } from "@prisma/client";

export const THEME_COOKIE = "davomat_theme";

export type ThemeChoice = ThemePreference; // LIGHT | DARK | SYSTEM

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/** Current stored preference ("LIGHT" | "DARK" | "SYSTEM"). */
export function resolveTheme(): ThemeChoice | null {
  const value = readCookie(THEME_COOKIE);
  if (value === "LIGHT" || value === "DARK" || value === "SYSTEM") return value;
  return null;
}

/** Whether the UI should currently render in dark mode. */
export function isDarkResolved(theme: ThemeChoice): boolean {
  if (theme === "DARK") return true;
  if (theme === "LIGHT") return false;
  if (typeof window !== "undefined") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  return false;
}

/** Apply (and persist) a theme choice. */
export function applyTheme(theme: ThemeChoice): void {
  if (typeof document === "undefined") return;
  const dark = isDarkResolved(theme);
  document.documentElement.classList.toggle("dark", dark);
  document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}