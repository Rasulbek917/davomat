import { z } from "zod";

/**
 * Server-side environment access. Validated lazily so that importing this
 * module never throws during build-time module evaluation.
 *
 * Secrets are ONLY read here (server context) and are never exposed with a
 * NEXT_PUBLIC_ prefix.
 */
const serverEnvSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  CREDENTIAL_ENCRYPTION_KEY: z.string().min(1, "CREDENTIAL_ENCRYPTION_KEY is required"),
  APP_URL: z.string().default("http://localhost:3000"),
  UPLOAD_DIR: z.string().default("storage/uploads"),
  APP_TIMEZONE: z.string().default("Asia/Tashkent"),
  EMAKTAB_API_BASE_URL: z.string().optional().default(""),
  // --- AI assistant (server-side only; never exposed to the client) ---------
  // Any OpenAI-compatible endpoint works. Empty AI_API_KEY = AI features show a
  // "not configured" state instead of failing.
  AI_API_KEY: z.string().optional().default(""),
  AI_BASE_URL: z.string().optional().default("https://api.openai.com/v1"),
  AI_MODEL: z.string().optional().default("gpt-4o-mini"),
  AI_MAX_OUTPUT_TOKENS: z.string().optional().default("900"),
  AI_DAILY_REQUEST_LIMIT: z.string().optional().default("150"),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | null = null;

export function serverEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(
      `Invalid server environment configuration:\n${issues}\n\nDid you copy .env.example to .env?`,
    );
  }
  cached = parsed.data;
  return cached;
}

/** Upload directory resolved to an absolute path (process.cwd()-relative by default). */
export function uploadDir(): string {
  const dir = serverEnv().UPLOAD_DIR;
  return dir;
}
