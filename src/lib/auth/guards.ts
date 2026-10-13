import { redirect } from "next/navigation";
import { Errors } from "@/lib/errors";
import { isSuperAdmin, PERMISSION, roleHasPermission, type PermissionKey } from "@/lib/constants";
import { getCurrentUser, homeRouteFor, type AuthUser } from "@/lib/auth/session";

/**
 * Server-side authorization. Every server action, route handler and page must
 * pass through these helpers — hiding UI is never considered security.
 */

/** For Server Actions / Route Handlers: throws a typed error. */
export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) throw Errors.unauthorized();
  return user;
}

/** For pages/layouts: redirects unauthenticated visitors to the login page. */
export async function requirePageUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requirePermission(permission: PermissionKey): Promise<AuthUser> {
  const user = await requireUser();
  if (!roleHasPermission(user.permissions, permission)) {
    throw Errors.forbidden();
  }
  return user;
}

export async function requireAnyPermission(permissions: PermissionKey[]): Promise<AuthUser> {
  const user = await requireUser();
  if (!permissions.some((p) => roleHasPermission(user.permissions, p))) {
    throw Errors.forbidden();
  }
  return user;
}

export async function requireSuperAdmin(): Promise<AuthUser> {
  const user = await requireUser();
  if (!isSuperAdmin(user.permissions)) throw Errors.forbidden();
  return user;
}

/** A school-scoped user (director/employee). Super admins are rejected here. */
export async function requireSchoolUser(): Promise<AuthUser & { schoolId: string }> {
  const user = await requireUser();
  if (!user.schoolId) {
    throw Errors.forbidden("Bu amal maktabga biriktirilgan foydalanuvchilar uchun.");
  }
  return user as AuthUser & { schoolId: string };
}

/**
 * A school-scoped user that additionally holds `permission`.
 * The returned `schoolId` is always taken from the session — never from client
 * input — which is what makes cross-school access impossible.
 */
export async function requireSchoolPermission(
  permission: PermissionKey,
): Promise<AuthUser & { schoolId: string }> {
  const user = await requirePermission(permission);
  if (!user.schoolId) {
    throw Errors.forbidden("Bu amal maktabga biriktirilgan foydalanuvchilar uchun.");
  }
  return user as AuthUser & { schoolId: string };
}

/**
 * Verify a user may act on `schoolId`. This is the single choke point that
 * prevents horizontal privilege escalation (e.g. changing an id in a URL).
 */
export function assertSchoolAccess(user: AuthUser, schoolId: string | null | undefined): asserts schoolId is string {
  if (!schoolId) throw Errors.forbidden();
  if (isSuperAdmin(user.permissions)) return;
  if (user.schoolId !== schoolId) {
    throw Errors.forbidden("Boshqa maktab ma’lumotlariga kirish mumkin emas.");
  }
}

/**
 * Prisma `where` fragment that scopes a query to what the user may see.
 * Super admins are unscoped; everyone else is pinned to their school.
 */
export function schoolScope(user: AuthUser): { schoolId?: string } {
  if (isSuperAdmin(user.permissions)) return {};
  if (!user.schoolId) return { schoolId: "__none__" };
  return { schoolId: user.schoolId };
}

export async function assertClassAccess(user: AuthUser, classId: string) {
  const { getClassScope, scopeAllowsClass } = await import("@/lib/auth/scope");
  const scope = await getClassScope(user);
  if (!scopeAllowsClass(scope, classId)) {
    throw Errors.forbidden("Ushbu sinf ma’lumotlariga kirish mumkin emas.");
  }
}

export function can(user: AuthUser, permission: PermissionKey): boolean {
  return roleHasPermission(user.permissions, permission);
}

export function isAdmin(user: AuthUser): boolean {
  return isSuperAdmin(user.permissions);
}

/** Redirect a signed-in user away from auth pages / to their home. */
export async function redirectIfAuthenticated(): Promise<void> {
  const user = await getCurrentUser();
  if (user) redirect(homeRouteFor(user.roleKey));
}

export { PERMISSION };
