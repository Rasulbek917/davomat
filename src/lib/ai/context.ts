import { Errors } from "@/lib/errors";
import { getCurrentUser, type AuthUser } from "@/lib/auth/session";
import { getClassScope } from "@/lib/auth/scope";
import { PERMISSION, ROLE, roleHasPermission } from "@/lib/constants";
import { prisma } from "@/lib/db";

/**
 * ---------------------------------------------------------------------------
 * AI request context
 * ---------------------------------------------------------------------------
 * Every AI request resolves its scope **on the server** from the session. The
 * client may never supply `schoolId`/`classId` as an authority — a super admin
 * may *select* a school, but it is validated here; everyone else is pinned to
 * their own school.
 *
 * `allowedClassIds` is the single source of truth for class-level RBAC:
 *   * `null`      -> all classes of the school (director / deputy / employee)
 *   * `string[]`  -> only those classes (class teacher / teacher)
 *   * `[]`        -> no class access at all
 * ---------------------------------------------------------------------------
 */

export type AiContext = {
  userId: string;
  fullName: string;
  roleKey: string;
  permissions: string[];
  schoolId: string;
  schoolName: string;
  /** null = all classes in the school. */
  allowedClassIds: string[] | null;
  /** True when the user is restricted to specific class(es). */
  isClassScoped: boolean;
};

export async function buildAiContext(input?: { schoolId?: string }): Promise<AiContext> {
  const user = await getCurrentUser();
  if (!user) throw Errors.unauthorized();
  if (!roleHasPermission(user.permissions, PERMISSION.AI_USE)) {
    throw Errors.forbidden("AI yordamchisidan foydalanishga ruxsatingiz yo‘q.");
  }

  const schoolId = await resolveSchoolId(user, input?.schoolId);
  const school = await prisma.school.findFirst({
    where: { id: schoolId },
    select: { id: true, name: true },
  });
  if (!school) throw Errors.notFound("Maktab topilmadi.");

  const scope = await getClassScope(user);
  const allowedClassIds =
    scope.kind === "CLASSES" && user.schoolId
      ? scope.classIds
      : scope.kind === "CLASSES"
        ? scope.classIds
        : null;

  return {
    userId: user.id,
    fullName: user.fullName,
    roleKey: user.roleKey,
    permissions: user.permissions,
    schoolId: school.id,
    schoolName: school.name,
    allowedClassIds,
    isClassScoped: Array.isArray(allowedClassIds),
  };
}

async function resolveSchoolId(user: AuthUser, requested?: string): Promise<string> {
  if (user.schoolId) return user.schoolId;

  // Super admin (no school of their own) must pick a school explicitly.
  if (!(user.roleKey === ROLE.SUPER_ADMIN || roleHasPermission(user.permissions, PERMISSION.PLATFORM_STATS))) {
    throw Errors.forbidden("Bu amal maktabga biriktirilgan foydalanuvchilar uchun.");
  }
  const candidate = requested?.trim();
  if (!candidate) {
    throw Errors.validation("Maktabni tanlang.", { schoolId: "AI so‘rovlari uchun maktab tanlanishi shart." });
  }
  const school = await prisma.school.findFirst({
    where: { id: candidate, deletedAt: null },
    select: { id: true },
  });
  if (!school) throw Errors.notFound("Tanlangan maktab topilmadi.");
  return school.id;
}

/** Throws unless the context may read the given class. */
export function assertContextClass(ctx: AiContext, classId: string): void {
  if (ctx.allowedClassIds === null) return;
  if (!ctx.allowedClassIds.includes(classId)) {
    throw Errors.forbidden("Ushbu sinf ma’lumotlariga AI orqali kirish mumkin emas.");
  }
}
