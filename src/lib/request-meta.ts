import { headers } from "next/headers";

/**
 * Request metadata for audit logs. `headers()` is async in Next.js 16.
 */
export async function requestMeta(): Promise<{ ip: string; userAgent: string | null }> {
  const h = await headers();
  const forward = h.get("x-forwarded-for");
  const ip = forward ? (forward.split(",")[0] ?? "").trim() || "unknown" : h.get("x-real-ip") ?? "unknown";
  return { ip, userAgent: h.get("user-agent") };
}