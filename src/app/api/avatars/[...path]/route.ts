import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { contentTypeForStoredFile, readStoredFile } from "@/lib/storage";

/**
 * Authenticated avatar delivery.
 *
 * Uploads live outside the web root (`UPLOAD_DIR`) and are only ever served
 * through this route, so a guessable filename alone is not enough — a valid
 * session is required. `readStoredFile` also guards against path traversal.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Ruxsat yo‘q", { status: 401 });

  const { path } = await ctx.params;
  const relative = (path ?? []).join("/");
  if (!relative) return new NextResponse("Topilmadi", { status: 404 });

  try {
    const buffer = await readStoredFile(relative);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": contentTypeForStoredFile(relative),
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse("Topilmadi", { status: 404 });
  }
}
