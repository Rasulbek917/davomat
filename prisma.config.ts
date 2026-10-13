import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "prisma/config";

/**
 * Prisma 7 does not preload `.env` into the config module, so we load it here.
 * This keeps the CLI (`migrate`, `db`, `db seed`) working without `dotenv`.
 */
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

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  datasource: {
    // Client generation does not connect to the database. Use a local placeholder only
    // when DATABASE_URL is absent; real migrations/runtime still require a valid URL.
    url: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/davomat",
  },
  migrations: {
    path: path.join("prisma", "migrations"),
    seed: "tsx prisma/seed.ts",
  },
});
