import { ZodError } from "zod";

/**
 * Application error with a safe, user-facing Uzbek message.
 * Anything that is not an AppError is treated as an unexpected error and
 * reported generically to the client (details stay in server logs only).
 */
export class AppError extends Error {
  readonly code: string;
  readonly status: number;
  readonly fields?: Record<string, string>;

  constructor(
    message: string,
    options: { code?: string; status?: number; fields?: Record<string, string> } = {},
  ) {
    super(message);
    this.name = "AppError";
    this.code = options.code ?? "APP_ERROR";
    this.status = options.status ?? 400;
    this.fields = options.fields;
  }
}

export const Errors = {
  unauthorized: () => new AppError("Tizimga kirish talab qilinadi.", { code: "UNAUTHORIZED", status: 401 }),
  forbidden: (message = "Bu amalni bajarishga ruxsatingiz yo‘q.") =>
    new AppError(message, { code: "FORBIDDEN", status: 403 }),
  notFound: (message = "Ma’lumot topilmadi.") =>
    new AppError(message, { code: "NOT_FOUND", status: 404 }),
  validation: (message: string, fields?: Record<string, string>) =>
    new AppError(message, { code: "VALIDATION", status: 422, fields }),
  conflict: (message: string) => new AppError(message, { code: "CONFLICT", status: 409 }),
  rateLimited: (message = "Juda ko‘p urinish. Iltimos, birozdan so‘ng qayta urinib ko‘ring.") =>
    new AppError(message, { code: "RATE_LIMITED", status: 429 }),
};

export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? { data?: undefined } : { data: T }))
  | { ok: false; error: string; code?: string; fields?: Record<string, string> };

export function ok(): ActionResult<undefined>;
export function ok<T>(data: T): ActionResult<T>;
export function ok<T>(data?: T): ActionResult<T | undefined> {
  return { ok: true, data } as ActionResult<T | undefined>;
}

export function fail(error: unknown): ActionResult<never> {
  if (error instanceof AppError) {
    return { ok: false, error: error.message, code: error.code, fields: error.fields };
  }
  if (error instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const issue of error.issues) {
      const key = issue.path.join(".") || "_";
      if (!fields[key]) fields[key] = issue.message;
    }
    const first = error.issues[0]?.message ?? "Ma’lumotlar noto‘g‘ri.";
    return { ok: false, error: first, code: "VALIDATION", fields };
  }
  // Unexpected: log server-side, return a generic message.
  console.error("[unhandled action error]", error);
  return { ok: false, error: "Kutilmagan xatolik yuz berdi. Keyinroq qayta urinib ko‘ring.", code: "INTERNAL" };
}
