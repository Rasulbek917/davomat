"use client";

import * as React from "react";

/**
 * Structural shape accepted by {@link useAction}. Both `ActionResult<T>` and
 * `ActionResult<undefined>` are assignable to it, which keeps call sites free of
 * generic annotations.
 */
export type LooseActionResult =
  | { ok: true; data?: unknown }
  | { ok: false; error: string; code?: string; fields?: Record<string, string> };

/**
 * Small client-side helper for calling Server Actions from forms/dialogs.
 * It tracks a pending flag, surfaces the (safe) error message and per-field
 * errors returned by the action, and runs an `onSuccess` callback.
 */
export function useAction() {
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  const run = React.useCallback(
    (action: () => Promise<LooseActionResult>, options?: { onSuccess?: (data: unknown) => void }) => {
      setError(null);
      setFieldErrors({});
      startTransition(async () => {
        const result = await action();
        if (result.ok) {
          options?.onSuccess?.(result.data);
        } else {
          setError(result.error);
          setFieldErrors(result.fields ?? {});
        }
      });
    },
    [],
  );

  const reset = React.useCallback(() => {
    setError(null);
    setFieldErrors({});
  }, []);

  return { pending, error, fieldErrors, run, reset, setError };
}
