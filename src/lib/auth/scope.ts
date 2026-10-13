import { cache } from "react";
import type { AuthUser } from "@/lib/auth/session";
import { ROLE } from "@/lib/constants";
import { prisma } from "@/lib/db";

export const MANAGER_ROLES = [ROLE.SUPER_ADMIN, ROLE.DIRECTOR, ROLE.DEPUTY_DIRECTOR] as const;

export type ClassScope =
  | { kind: "PLATFORM" }
  | { kind: "SCHOOL"; schoolId: string }
  | { kind: "CLASSES"; schoolId: string; classIds: string[] };

export function isSchoolWideRole(roleKey: string): boolean {
  return (MANAGER_ROLES as readonly string[]).includes(roleKey);
}

/**
 * Resolve the data scope for a user.
 * - SUPER_ADMIN/DIRECTOR/DEPUTY_DIRECTOR: school/platform wide
 * - TEACHER/EMPLOYEE who are class teachers (assigned to classes): restricted to those classes
 * - TEACHER with no class assignments: empty scope (no access)
 * - EMPLOYEE with no class assignments: school-wide (preserves existing behavior)
 */
export const getClassScope = cache(async (user: AuthUser): Promise<ClassScope> => {
  if (user.roleKey === ROLE.SUPER_ADMIN) {
    return { kind: "PLATFORM" };
  }

  if (!user.schoolId) {
    return { kind: "SCHOOL", schoolId: "__none__" } as ClassScope;
  }

  if (isSchoolWideRole(user.roleKey)) {
    return { kind: "SCHOOL", schoolId: user.schoolId };
  }

  const classes = await prisma.schoolClass.findMany({
    where: { schoolId: user.schoolId, teacherId: user.id, deletedAt: null, isActive: true },
    select: { id: true },
    orderBy: [{ gradeYear: "asc" }, { name: "asc" }],
  });

  const classIds = classes.map((c) => c.id);

  if (classIds.length > 0) {
    return { kind: "CLASSES", schoolId: user.schoolId, classIds };
  }

  if (user.roleKey === ROLE.TEACHER) {
    // No class assigned -> deny access to class-scoped data
    return { kind: "CLASSES", schoolId: user.schoolId, classIds: [] };
  }

  // EMPLOYEE with no class assignment -> school wide (preserve behavior)
  return { kind: "SCHOOL", schoolId: user.schoolId };
});

export function scopeClassIds(scope: ClassScope): string[] | null {
  if (scope.kind === "CLASSES") return scope.classIds.length === 0 ? [] : scope.classIds;
  return null;
}

export function hasAnyClass(scope: ClassScope): boolean {
  if (scope.kind === "CLASSES") return scope.classIds.length > 0;
  return true; // school/platform wide
}

export function scopeAllowsClass(scope: ClassScope, classId: string): boolean {
  const ids = scopeClassIds(scope);
  if (ids === null) return true;
  return ids.includes(classId);
}
