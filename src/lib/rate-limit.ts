import { Errors } from "@/lib/errors";

type Bucket = { count: number; resetAt: number };

/**
 * Small in-process sliding-window limiter for authentication endpoints.
 *
 * NOTE: this is per-process state. For multi-instance deployments replace the
 * store with Redis (see docs/DEPLOYMENT.md). The limiter is a defence-in-depth
 * layer on top of per-account lockout, which is enforced in the database.
 */
const buckets = new Map<string, Bucket>();

function prune(now: number) {
  if (buckets.size < 5000) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export type RateLimitResult = { allowed: boolean; remaining: number; retryAfterSeconds: number };

export function rateLimit(key: string, limit: number, windowSeconds: number): RateLimitResult {
  const now = Date.now();
  prune(now);
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }
  if (bucket.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }
  bucket.count += 1;
  return { allowed: true, remaining: limit - bucket.count, retryAfterSeconds: 0 };
}

/** Throwing wrapper used in server actions. */
export function enforceRateLimit(key: string, limit: number, windowSeconds: number): void {
  const result = rateLimit(key, limit, windowSeconds);
  if (!result.allowed) throw Errors.rateLimited();
}

export function resetRateLimit(key: string): void {
  buckets.delete(key);
}
