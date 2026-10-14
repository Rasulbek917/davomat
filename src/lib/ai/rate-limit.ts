import { Errors } from "@/lib/errors";
import { prisma } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { AUDIT_ACTIONS } from "@/lib/audit";

/**
 * Lightweight cost/abuse control for AI requests.
 *
 * Two layers:
 *   1. an in-memory sliding window (per warm server instance) that stops bursts;
 *   2. a durable daily cap counted from the audit log, which survives cold
 *      starts and is shared across instances.
 *
 * This is intentionally simple. If the app is later deployed at scale, swap the
 * in-memory map for a shared store (Redis/Upstash) behind the same function.
 */

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 8;

const recentHits = new Map<string, number[]>();

function startOfUtcDay(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export async function assertAiRateLimit(userId: string): Promise<void> {
  const now = Date.now();
  const pruned = (recentHits.get(userId) ?? []).filter((at) => now - at < WINDOW_MS);
  if (pruned.length >= MAX_PER_WINDOW) {
    throw Errors.rateLimited("Juda ko‘p AI so‘rovi yuborildi. Bir daqiqadan so‘ng qayta urinib ko‘ring.");
  }
  pruned.push(now);
  recentHits.set(userId, pruned);

  const daily = Number.parseInt(serverEnv().AI_DAILY_REQUEST_LIMIT, 10);
  if (Number.isFinite(daily) && daily > 0) {
    const used = await prisma.auditLog.count({
      where: {
        actorUserId: userId,
        action: AUDIT_ACTIONS.AI_QUERY,
        createdAt: { gte: startOfUtcDay() },
      },
    });
    if (used >= daily) {
      throw Errors.rateLimited("Kunlik AI so‘rovlar limiti tugadi. Ertaga qayta urinib ko‘ring.");
    }
  }
}
