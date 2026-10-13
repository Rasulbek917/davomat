import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { serverEnv } from "@/lib/env";

/**
 * Prisma 7 requires an explicit driver adapter. Connection pooling is handled
 * by `pg`'s Pool, which is the right choice for a long-lived Node server.
 *
 * IMPORTANT — lazy initialisation:
 * The client is created on first use, never at module-evaluation time. During
 * `next build` the bundler imports every route module to collect page data;
 * if the client were created eagerly, a missing runtime secret (for example on
 * a build machine that only needs to compile) would fail the whole build. By
 * deferring construction, the build only needs to *type-check* the code, while
 * the real environment is validated the first time a query runs.
 *
 * The instance is cached on `globalThis` so hot-reload in development does not
 * open a new connection pool on every module evaluation.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: serverEnv().DATABASE_URL });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

function getClient(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createClient();
  }
  return globalForPrisma.prisma;
}

/**
 * Proxy that forwards every property access to a lazily-created Prisma client.
 * The public API (`prisma.student.findMany`, `prisma.$transaction`, …) is
 * unchanged for all call sites; only the timing of construction differs.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = getClient();
    const value = Reflect.get(client as object, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
  has(_target, prop) {
    return prop in getClient();
  },
});
