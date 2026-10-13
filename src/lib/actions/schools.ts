"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { directorSchema, resetPasswordSchema, schoolSchema } from "@/lib/validation/schemas";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { generateTemporaryPassword, hashPassword } from "@/lib/auth/password";
import { revokeUserSessions } from "@/lib/auth/session";
import { recordAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { fail, ok, type ActionResult } from "@/lib/errors";
import { requestMeta } from "@/lib/request-meta";
import { ROLE } from "@/lib/constants";

/** Super Admin: school CRUD. */

export async function createSchoolAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireSuperAdmin();
    const input = schoolSchema.parse(raw);
    const { ip, userAgent } = await requestMeta();

    const existing = await prisma.school.findUnique({ where: { code: input.code }, select: { id: true } });
    if (existing) return fail(new Error("Bu kod bilan maktab allaqachon mavjud."));

    const school = await prisma.school.create({
      data: {
        code: input.code,
        name: input.name,
        region: input.region ?? null,
        district: input.district ?? null,
        address: input.address ?? null,
        phone: input.phone ?? null,
        email: input.email ?? null,
        isActive: input.isActive ?? true,
      },
      select: { id: true },
    });

    await recordAudit({
      actorUserId: user.id,
      action: AUDIT_ACTIONS.SCHOOL_CREATED,
      entityType: "School",
      entityId: school.id,
      summary: `Maktab yaratildi: ${input.name} (${input.code}).`,
      ip,
      userAgent,
    });
    revalidatePath("/admin/schools");
    revalidatePath("/admin");
    return ok({ id: school.id });
  } catch (error) {
    return fail(error);
  }
}

export async function updateSchoolAction(raw: unknown): Promise<ActionResult> {
  try {
    const user = await requireSuperAdmin();
    const input = schoolSchema.parse(raw);
    if (!input.id) return fail(new Error("Maktab ID ko‘rsatilmagan."));
    const { ip, userAgent } = await requestMeta();

    const clash = await prisma.school.findFirst({
      where: { code: input.code, id: { not: input.id } },
      select: { id: true },
    });
    if (clash) return fail(new Error("Bu kod boshqa maktabda band."));

    await prisma.school.update({
      where: { id: input.id },
      data: {
        code: input.code,
        name: input.name,
        region: input.region ?? null,
        district: input.district ?? null,
        address: input.address ?? null,
        phone: input.phone ?? null,
        email: input.email ?? null,
        isActive: input.isActive ?? true,
      },
    });

    await recordAudit({
      actorUserId: user.id,
      action: AUDIT_ACTIONS.SCHOOL_UPDATED,
      entityType: "School",
      entityId: input.id,
      summary: `Maktab yangilandi: ${input.name}.`,
      ip,
      userAgent,
    });
    revalidatePath("/admin/schools");
    return ok();
  } catch (error) {
    return fail(error);
  }
}

export async function setSchoolActiveAction(input: { id: string; isActive: boolean }): Promise<ActionResult> {
  try {
    const user = await requireSuperAdmin();
    const { ip, userAgent } = await requestMeta();
    const school = await prisma.school.update({
      where: { id: input.id },
      data: { isActive: input.isActive },
      select: { name: true },
    });
    await recordAudit({
      actorUserId: user.id,
      action: input.isActive ? AUDIT_ACTIONS.SCHOOL_UPDATED : AUDIT_ACTIONS.SCHOOL_DEACTIVATED,
      entityType: "School",
      entityId: input.id,
      summary: `${school.name} ${input.isActive ? "faollashtirildi" : "faolsizlantirildi"}.`,
      ip,
      userAgent,
    });
    revalidatePath("/admin/schools");
    return ok();
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------------------
// Directors
// ---------------------------------------------------------------------------

export async function createDirectorAction(
  raw: unknown,
): Promise<ActionResult<{ id: string; temporaryPassword: string | null }>> {
  try {
    const actor = await requireSuperAdmin();
    const input = directorSchema.parse(raw);
    const { ip, userAgent } = await requestMeta();

    const loginClash = await prisma.user.findUnique({ where: { login: input.login }, select: { id: true } });
    if (loginClash) return fail(new Error("Bu login band."));

    const role = await prisma.role.findUnique({ where: { key: ROLE.DIRECTOR }, select: { id: true } });
    if (!role) return fail(new Error("DIRECTOR roli topilmadi. Seed ishga tushirilganini tekshiring."));

    const school = await prisma.school.findUnique({ where: { id: input.schoolId }, select: { id: true, name: true } });
    if (!school) return fail(new Error("Maktab topilmadi."));

    const supplied = input.password && input.password.length > 0 ? input.password : null;
    const temporaryPassword = supplied ?? generateTemporaryPassword();

    const director = await prisma.user.create({
      data: {
        login: input.login,
        passwordHash: await hashPassword(temporaryPassword),
        firstName: input.firstName,
        lastName: input.lastName,
        middleName: input.middleName ?? null,
        phone: input.phone ?? null,
        roleId: role.id,
        schoolId: school.id,
        isActive: input.isActive ?? true,
        mustChangePassword: true,
        preference: { create: {} },
      },
      select: { id: true },
    });

    await recordAudit({
      actorUserId: actor.id,
      schoolId: school.id,
      action: AUDIT_ACTIONS.DIRECTOR_CREATED,
      entityType: "User",
      entityId: director.id,
      summary: `Direktor yaratildi: ${input.firstName} ${input.lastName} (${school.name}).`,
      ip,
      userAgent,
    });
    revalidatePath("/admin/directors");
    revalidatePath("/admin");
    return ok({ id: director.id, temporaryPassword: supplied ? null : temporaryPassword });
  } catch (error) {
    return fail(error);
  }
}

export async function updateDirectorAction(raw: unknown): Promise<ActionResult> {
  try {
    const actor = await requireSuperAdmin();
    const input = directorSchema.parse(raw);
    if (!input.id) return fail(new Error("Direktor ID ko‘rsatilmagan."));
    const { ip, userAgent } = await requestMeta();

    const target = await prisma.user.findUnique({
      where: { id: input.id },
      include: { role: true },
    });
    if (!target || target.role.key !== ROLE.DIRECTOR) return fail(new Error("Direktor topilmadi."));

    const clash = await prisma.user.findFirst({
      where: { login: input.login, id: { not: input.id } },
      select: { id: true },
    });
    if (clash) return fail(new Error("Bu login band."));

    await prisma.user.update({
      where: { id: input.id },
      data: {
        login: input.login,
        firstName: input.firstName,
        lastName: input.lastName,
        middleName: input.middleName ?? null,
        phone: input.phone ?? null,
        schoolId: input.schoolId,
        isActive: input.isActive ?? true,
        ...(input.password ? { passwordHash: await hashPassword(input.password), mustChangePassword: true } : {}),
      },
    });

    if (input.password) await revokeUserSessions(input.id);

    await recordAudit({
      actorUserId: actor.id,
      schoolId: input.schoolId,
      action: AUDIT_ACTIONS.DIRECTOR_UPDATED,
      entityType: "User",
      entityId: input.id,
      summary: `Direktor yangilandi: ${input.firstName} ${input.lastName}.`,
      ip,
      userAgent,
    });
    revalidatePath("/admin/directors");
    return ok();
  } catch (error) {
    return fail(error);
  }
}

export async function setDirectorActiveAction(input: { id: string; isActive: boolean }): Promise<ActionResult> {
  try {
    const actor = await requireSuperAdmin();
    const { ip, userAgent } = await requestMeta();
    const target = await prisma.user.findUnique({ where: { id: input.id }, include: { role: true } });
    if (!target || target.role.key !== ROLE.DIRECTOR) return fail(new Error("Direktor topilmadi."));

    await prisma.user.update({ where: { id: input.id }, data: { isActive: input.isActive } });
    if (!input.isActive) await revokeUserSessions(input.id);

    await recordAudit({
      actorUserId: actor.id,
      schoolId: target.schoolId,
      action: input.isActive ? AUDIT_ACTIONS.DIRECTOR_UPDATED : AUDIT_ACTIONS.DIRECTOR_DEACTIVATED,
      entityType: "User",
      entityId: input.id,
      summary: `${target.firstName} ${target.lastName} ${input.isActive ? "faollashtirildi" : "faolsizlantirildi"}.`,
      ip,
      userAgent,
    });
    revalidatePath("/admin/directors");
    return ok();
  } catch (error) {
    return fail(error);
  }
}

/** Super Admin resets any account's password (director or employee). */
export async function resetPasswordAction(raw: unknown): Promise<ActionResult> {
  try {
    const actor = await requireSuperAdmin();
    const input = resetPasswordSchema.parse(raw);
    const { ip, userAgent } = await requestMeta();

    const target = await prisma.user.findUnique({ where: { id: input.userId }, select: { id: true, schoolId: true } });
    if (!target) return fail(new Error("Foydalanuvchi topilmadi."));

    await prisma.user.update({
      where: { id: input.userId },
      data: { passwordHash: await hashPassword(input.password), mustChangePassword: true, failedLoginCount: 0, lockedUntil: null },
    });
    await revokeUserSessions(input.userId);

    await recordAudit({
      actorUserId: actor.id,
      schoolId: target.schoolId,
      action: AUDIT_ACTIONS.PASSWORD_RESET,
      entityType: "User",
      entityId: input.userId,
      summary: "Parol administrator tomonidan tiklandi.",
      ip,
      userAgent,
    });
    revalidatePath("/admin/directors");
    return ok();
  } catch (error) {
    return fail(error);
  }
}