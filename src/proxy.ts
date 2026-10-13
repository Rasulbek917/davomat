import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/cookie";

/**
 * Route protection (Next.js 16 "proxy", formerly middleware).
 *
 * This is a cheap first line of defence only: it redirects requests without a
 * session cookie away from the authenticated areas so unauthenticated users
 * never even render a protected page. It deliberately does NOT trust the
 * cookie's validity — every page, server action and route handler re-checks the
 * session and permissions server-side (see src/lib/auth/guards.ts). Hiding UI
 * is never treated as security.
 */
const PROTECTED_PREFIXES = ["/admin", "/dashboard"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  if (!isProtected) return NextResponse.next();

  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);
  if (hasSession) return NextResponse.next();

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = "";
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/admin/:path*", "/dashboard/:path*"],
};