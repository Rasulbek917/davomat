import { cache } from "react";
import { cookies } from "next/headers";
import type { ThemePreference } from "@prisma/client";
import { prisma } from "@/lib/db";
import { hmacToken, randomToken } from "@/lib/crypto";
import { SESSION_COOKIE, SESSION_TTL_REMEMBER_SECONDS, SESSION_TTL_SECONDS } from "@/lib/auth/cookie";

export { SESSION_COOKIE };

const LAST_USED_THROTTLE_MS = 60_000;

export type AuthUser = {
  id: string;
  login: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  fullName: string;
  avatarPath: string | null;
  mustChangePassword: boolean;
  roleId: string;
  roleKey: string;
  roleNameUz: string;
  permissions: string[];
  schoolId: string | null;
  school: { id: string; name: string; code: string } | null;
  preference: { theme: ThemePreference; sidebarCollapsed: boolean; attendanceSlot: string };
  sessionId: string;
};

export type SessionMeta = { ip?: string | null; userAgent?: string | null };

/**
 * Create a session, persist only the HMAC of the token, and set the cookie.
 * Must be called from a Server Action or Route Handler.
 */
export async function createSession(
  userId: string,
  meta: SessionMeta = {},
  remember = false,
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomToken(32);
  const ttl = remember ? SESSION_TTL_REMEMBER_SECONDS : SESSION_TTL_SECONDS;
  const expiresAt = new Date(Date.now() + ttl * 1000);

  await prisma.session.create({
    data: {
      tokenHash: hmacToken(token),
      userId,
      expiresAt,
      ip: meta.ip ?? null,
      userAgent: meta.userAgent?.slice(0, 400) ?? null,
    },
  });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });

  return { token, expiresAt };
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session
      .updateMany({
        where: { tokenHash: hmacToken(token), revokedAt: null },
        data: { revokedAt: new Date() },
      })
      .catch(() => undefined);
  }
  store.delete(SESSION_COOKIE);
}

/** Invalidate every active session of a user (used on password change/reset). */
export async function revokeUserSessions(userId: string, exceptSessionId?: string): Promise<void> {
  await prisma.session.updateMany({
    where: { userId, revokedAt: null, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
    data: { revokedAt: new Date() },
  });
}

/**
 * Resolve the current authenticated user for this request.
 * Memoised per request with React `cache`.
 */
export const getCurrentUser = cache(async (): Promise<AuthUser | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hmacToken(token) },
    include: {
      user: {
        include: {
          role: true,
          school: { select: { id: true, name: true, code: true, isActive: true, deletedAt: true } },
          preference: true,
        },
      },
    },
  });

  if (!session) return null;
  if (session.revokedAt) return null;
  if (session.expiresAt.getTime() < Date.now()) return null;

  const user = session.user;
  if (!user || !user.isActive || user.deletedAt) return null;
  if (user.school && (!user.school.isActive || user.school.deletedAt)) return null;

  // Throttled "last used" bookkeeping.
  if (Date.now() - session.lastUsedAt.getTime() > LAST_USED_THROTTLE_MS) {
    prisma.session
      .update({ where: { id: session.id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);
  }

  return {
    id: user.id,
    login: user.login,
    firstName: user.firstName,
    lastName: user.lastName,
    middleName: user.middleName,
    fullName: [user.lastName, user.firstName, user.middleName].filter(Boolean).join(" "),
    avatarPath: user.avatarPath,
    mustChangePassword: user.mustChangePassword,
    roleId: user.role.id,
    roleKey: user.role.key,
    roleNameUz: user.role.nameUz,
    permissions: user.role.permissions,
    schoolId: user.schoolId,
    school: user.school ? { id: user.school.id, name: user.school.name, code: user.school.code } : null,
    preference: {
      theme: user.preference?.theme ?? "SYSTEM",
      sidebarCollapsed: user.preference?.sidebarCollapsed ?? false,
      attendanceSlot: user.preference?.attendanceSlot ?? "FULL_DAY",
    },
    sessionId: session.id,
  };
});

/** Landing route for a given role after login. */
export function homeRouteFor(roleKey: string): string {
  switch (roleKey) {
    case "SUPER_ADMIN":
      return "/admin";
    default:
      return "/dashboard";
  }
}
