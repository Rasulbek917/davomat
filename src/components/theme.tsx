"use client";

import * as React from "react";
import { applyTheme, resolveTheme, THEME_COOKIE } from "@/lib/theme";

/** Fired locally whenever a theme choice is applied, so subscribers re-read. */
const THEME_EVENT = "davomat-theme-change";

/**
 * Subscribes to anything that can change the applied appearance: the OS colour
 * scheme (only relevant while the preference is "SYSTEM") and our own theme
 * changes. Cookies do not emit events, so we notify through a custom event.
 */
function subscribeTheme(onChange: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const onSystemChange = () => {
    if (resolveTheme() === "SYSTEM") applyTheme("SYSTEM");
    onChange();
  };
  media.addEventListener("change", onSystemChange);
  window.addEventListener(THEME_EVENT, onChange);
  return () => {
    media.removeEventListener("change", onSystemChange);
    window.removeEventListener(THEME_EVENT, onChange);
  };
}

/**
 * Whether the UI is *actually* dark right now, read from the applied class.
 * Distinct from the stored preference (which may be "SYSTEM"). Reading the DOM
 * keeps the toggle icon/label in sync so a click always flips what is shown.
 */
function useIsDark(serverValue: boolean) {
  return React.useSyncExternalStore(
    subscribeTheme,
    () => document.documentElement.classList.contains("dark"),
    () => serverValue,
  );
}

/**
 * Client-side theme control in sync with the server-side inline script.
 * `initial` is the stored preference; the resolved appearance is derived from
 * the DOM, which the inline script has already set before hydration.
 */
export function ThemeScript() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `!function(){try{var c=(document.cookie.match(/(?:^|; )${THEME_COOKIE}=([^;]*)/)||[])[1]||"SYSTEM";var d=c==="DARK"||(c!=="LIGHT"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d)}catch(e){}}()`,
      }}
    />
  );
}

export function useTheme(initial: "LIGHT" | "DARK" | "SYSTEM") {
  const [theme, setThemeState] = React.useState<"LIGHT" | "DARK" | "SYSTEM">(initial);
  const isDark = useIsDark(initial === "DARK");

  const setTheme = React.useCallback((next: "LIGHT" | "DARK" | "SYSTEM") => {
    setThemeState(next);
    applyTheme(next);
    window.dispatchEvent(new Event(THEME_EVENT));
  }, []);

  return { theme, isDark, setTheme };
}
