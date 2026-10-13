import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This is a fully dynamic, authenticated dashboard. Cache Components (PPR)
  // would force Suspense boundaries around every uncached database read, so it
  // is intentionally disabled. See AGENTS.md / ARCHITECTURE.md.
  reactStrictMode: true,
  poweredByHeader: false,
  // exceljs / sharp are native-adjacent CJS packages; keep them external to the
  // server bundle so they resolve from node_modules at runtime.
  serverExternalPackages: ["exceljs", "sharp", "bcryptjs", "@prisma/client"],
  experimental: {
    // eMaktab CSV/XLSX exports (a whole school can be thousands of rows) are
    // uploaded through a Server Action. Next caps Action bodies at 1 MB by
    // default, which rejects real exports, so raise it. The file is parsed in
    // memory server-side and never written to disk.
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
