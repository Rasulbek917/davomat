/**
 * Idempotently grant the `ai:use` permission to the roles that should have AI
 * access. This touches ONLY `roles.permissions` — no business data, no users,
 * no passwords.
 *
 * Usage: npm run db:sync-permissions
 *
 * Why not just run the seed? `prisma/seed.ts` also re-upserts demo schools and
 * users, which is fine on a fresh database but unnecessarily risky against
 * production. This script is the minimal, targeted alternative.
 */
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/** Mirror `prisma.config.ts`: Prisma 7 does not preload `.env` for plain scripts. */
function loadEnvFiles() {
  for (const file of [".env.local", ".env"]) {
    const full = path.join(process.cwd(), file);
    if (!fs.existsSync(full)) continue;
    for (const rawLine of fs.readFileSync(full, "utf8").split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  }
}

loadEnvFiles();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL topilmadi (.env faylini tekshiring).");
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

/** Must stay in sync with the `ai:use` entries in `src/lib/constants.ts`. */
const TARGET_ROLES = ["DIRECTOR", "DEPUTY_DIRECTOR", "TEACHER"] as const;

async function main() {
  let changed = 0;
  for (const key of TARGET_ROLES) {
    const role = await prisma.role.findUnique({ where: { key }, select: { permissions: true } });
    if (!role) {
      console.warn(`- rol topilmadi: ${key}`);
      continue;
    }
    if (role.permissions.includes("ai:use")) {
      console.log(`= ${key}: ai:use allaqachon mavjud`);
      continue;
    }
    await prisma.role.update({
      where: { key },
      data: { permissions: [...role.permissions, "ai:use"] },
    });
    changed += 1;
    console.log(`+ ${key}: ai:use qo'shildi`);
  }
  console.log(`Tayyor. Yangilangan rollar: ${changed}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
