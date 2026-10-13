"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { employeeSchema, resetPasswordSchema } from "@/lib/validation/schemas";
import { requireSchoolPermission } from "@/lib/auth/guards";
import { generateTemporaryPassword, hashPassword } from "@/lib/auth/password";
import { revokeUserSessions } from "@/lib/auth/session";
import { recordAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { fail, ok, type ActionResult } from "@/lib/errors";
import { requestMeta } from "@/lib/request-meta";
import { ASSIGNABLE_ROLE_KEYS, PERMISSION } from "@/lib/constants";

/**
 * Director-scoped employee management.
 *
 * Every action re-derives the school from the session (`requireSchoolPermission`)
 * and verifies that the target employee belongs to that same school. A director
 * can only assign the "assignable" roles — never SUPER_ADMIN or DIRECTOR — so
 * privilege escalation through this module is impossible.
 */

const REVALIDATE = ["/dashboard/employees", "/dashboard"];

export async function createEmployeeAction(
  raw: unknown,
): Promise<ActionResult<{ id: string; temporaryPassword: string | null }>> {
  try {
    const actor = await requireSchoolPermission(PERMISSION.EMPLOYEES_MANAGE);
    const input = employeeSchema.parse(raw);
    const { ip, userAgent } = await requestMeta();

    if (!ASSIGNABLE_ROLE_KEYS.includes(input.roleKey)) {
      return fail(new Error("Bu rolni biriktirish mumkin emas."));
    }

    const loginClash = await prisma.user.findUnique({ where: { login: input.login }, select: { id: true } });
    if (loginClash) return fail(new Error("Bu login band."));

    const role = await prisma.role.findUnique({ where: { key: input.roleKey }, select: { id: true } });
    if (!role) return fail(new Error("Rol topilmadi. Seed ishga tushirilganini tekshiring."));

    const supplied = input.password && input.password.length > 0 ? input.password : null;
    const temporaryPassword = supplied ?? generateTemporaryPassword();

    const employee = await prisma.user.create({
      data: {
        login: input.login,
        passwordHash: await hashPassword(temporaryPassword),
        firstName: input.firstName,
        lastName: input.lastName,
        middleName: input.middleName ?? null,
        phone: input.phone ?? null,
        roleId: role.id,
        schoolId: actor.schoolId,
        isActive: input.isActive ?? true,
        mustChangePassword: true,
        preference: { create: {} },
        employeeProfile: {
          create: { schoolId: actor.schoolId, position: input.position ?? "" },
        },
      },
      select: { id: true },
    });

    await recordAudit({
      actorUserId: actor.id,
      schoolId: actor.schoolId,
      action: AUDIT_ACTIONS.EMPLOYEE_CREATED,
      entityType: "User",
      entityId: employee.id,
      summary: `Xodim qo‘shildi: ${input.lastName} ${input.firstName} (${input.roleKey}).`,
      ip,
      userAgent,
    });
    for (const path of REVALIDATE) revalidatePath(path);
    return ok({ id: employee.id, temporaryPassword: supplied ? null : temporaryPassword });
  } catch (error) {
    return fail(error);
  }
}

export async function updateEmployeeAction(raw: unknown): Promise<ActionResult> {
  try {
    const actor = await requireSchoolPermission(PERMISSION.EMPLOYEES_MANAGE);
    const input = employeeSchema.parse(raw);
    if (!input.id) return fail(new Error("Xodim ID ko‘rsatilmagan."));
    const { ip, userAgent } = await requestMeta();

    if (!ASSIGNABLE_ROLE_KEYS.includes(input.roleKey)) {
      return fail(new Error("Bu rolni biriktirish mumkin emas."));
    }

    const target = await prisma.user.findUnique({
      where: { id: input.id },
      include: { role: true, employeeProfile: true },
    });
    if (!target || target.schoolId !== actor.schoolId) return fail(new Error("Xodim topilmadi."));
    if (!ASSIGNABLE_ROLE_KEYS.includes(target.role.key as (typeof ASSIGNABLE_ROLE_KEYS)[number])) {
      return fail(new Error("Bu foydalanuvchini tahrirlash mumkin emas."));
    }

    const clash = await prisma.user.findFirst({
      where: { login: input.login, id: { not: input.id } },
      select: { id: true },
    });
    if (clash) return fail(new Error("Bu login band."));

    const role = await prisma.role.findUnique({ where: { key: input.roleKey }, select: { id: true } });
    if (!role) return fail(new Error("Rol topilmadi."));

    const passwordHash = input.password ? await hashPassword(input.password) : null;

    await prisma.user.update({
      where: { id: input.id },
      data: {
        login: input.login,
        firstName: input.firstName,
        lastName: input.lastName,
        middleName: input.middleName ?? null,
        phone: input.phone ?? null,
        roleId: role.id,
        isActive: input.isActive ?? true,
        ...(passwordHash ? { passwordHash, mustChangePassword: true } : {}),
        employeeProfile: target.employeeProfile
          ? { update: { position: input.position ?? "", schoolId: actor.schoolId } }
          : { create: { schoolId: actor.schoolId, position: input.position ?? "" } },
      },
    });

    if (passwordHash) await revokeUserSessions(input.id);

    await recordAudit({
      actorUserId: actor.id,
      schoolId: actor.schoolId,
      action: AUDIT_ACTIONS.EMPLOYEE_UPDATED,
      entityType: "User",
      entityId: input.id,
      summary: `Xodim yangilandi: ${input.lastName} ${input.firstName}.`,
      ip,
      userAgent,
    });
    for (const path of REVALIDATE) revalidatePath(path);
    return ok();
  } catch (error) {
    return fail(error);
  }
}

export async function setEmployeeActiveAction(input: {
  id: string;
  isActive: boolean;
}): Promise<ActionResult> {
  try {
    const actor = await requireSchoolPermission(PERMISSION.EMPLOYEES_MANAGE);
    const { ip, userAgent } = await requestMeta();

    const target = await prisma.user.findUnique({
      where: { id: input.id },
      include: { role: true },
    });
    if (!target || target.schoolId !== actor.schoolId) return fail(new Error("Xodim topilmadi."));
    if (!ASSIGNABLE_ROLE_KEYS.includes(target.role.key as (typeof ASSIGNABLE_ROLE_KEYS)[number])) {
      return fail(new Error("Bu foydalanuvchini o‘zgartirish mumkin emas."));
    }
    // An actor must not lock themselves out.
    if (target.id === actor.id) return fail(new Error("O‘z hisobingizni faolsizlantira olmaysiz."));

    await prisma.user.update({ where: { id: input.id }, data: { isActive: input.isActive } });
    if (!input.isActive) await revokeUserSessions(input.id);

    await recordAudit({
      actorUserId: actor.id,
      schoolId: actor.schoolId,
      action: input.isActive ? AUDIT_ACTIONS.EMPLOYEE_UPDATED : AUDIT_ACTIONS.EMPLOYEE_DEACTIVATED,
      entityType: "User",
      entityId: input.id,
      summary: `${target.lastName} ${target.firstName} ${input.isActive ? "faollashtirildi" : "faolsizlantirildi"}.`,
      ip,
      userAgent,
    });
    for (const path of REVALIDATE) revalidatePath(path);
    return ok();
  } catch (error) {
    return fail(error);
  }
}

/** Director resets a password of an employee in their own school. */
export async function resetEmployeePasswordAction(raw: unknown): Promise<ActionResult> {
  try {
    const actor = await requireSchoolPermission(PERMISSION.EMPLOYEES_MANAGE);
    const input = resetPasswordSchema.parse(raw);
    const { ip, userAgent } = await requestMeta();

    const target = await prisma.user.findUnique({
      where: { id: input.userId },
      include: { role: true },
    });
    if (!target || target.schoolId !== actor.schoolId) return fail(new Error("Xodim topilmadi."));
    if (!ASSIGNABLE_ROLE_KEYS.includes(target.role.key as (typeof ASSIGNABLE_ROLE_KEYS)[number])) {
      return fail(new Error("Bu foydalanuvchi uchun parolni tiklab bo‘lmaydi."));
    }

    await prisma.user.update({
      where: { id: input.userId },
      data: {
        passwordHash: await hashPassword(input.password),
        mustChangePassword: true,
        failedLoginCount: 0,
        lockedUntil: null,
      },
    });
    await revokeUserSessions(input.userId);

    await recordAudit({
      actorUserId: actor.id,
      schoolId: actor.schoolId,
      action: AUDIT_ACTIONS.PASSWORD_RESET,
      entityType: "User",
      entityId: input.userId,
      summary: `Xodim paroli tiklandi: ${target.lastName} ${target.firstName}.`,
      ip,
      userAgent,
    });
    for (const path of REVALIDATE) revalidatePath(path);
    return ok();
  } catch (error) {
    return fail(error);
  }
}
