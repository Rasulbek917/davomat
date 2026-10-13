"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requestMeta } from "@/lib/request-meta";
import { loginSchema, changePasswordSchema, profileSchema, themeSchema } from "@/lib/validation/schemas";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession, destroySession, getCurrentUser, homeRouteFor, revokeUserSessions } from "@/lib/auth/session";
import { enforceRateLimit, resetRateLimit } from "@/lib/rate-limit";
import { recordAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { fail, ok, type ActionResult } from "@/lib/errors";
import { Errors } from "@/lib/errors";
import { deleteAvatar, saveAvatar } from "@/lib/storage";

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;

export type LoginState = { error?: string; fields?: { login?: string } };

/** Server action backing the login form. Redirects on success. */
export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    login: formData.get("login"),
    password: formData.get("password"),
    remember: formData.get("remember") === "on" || formData.get("remember") === "true",
  });
  if (!parsed.success) {
    const first = parsed.error.issues[0]?.message ?? "Ma’lumotlarni tekshiring";
    return { error: first };
  }

  const input = parsed.data;
  const { ip, userAgent } = await requestMeta();
  enforceRateLimit(`login:${input.login.toLowerCase()}|${ip}`, 10, 60);

  const user = await prisma.user.findUnique({
    where: { login: input.login },
    include: { role: true, school: true },
  });

  // Always run a dummy compare to keep timing uniform (user enumeration defence).
  const passwordOk = user ? await verifyPassword(input.password, user.passwordHash) : await verifyPassword(input.password, "$2a$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW");

  if (!user || !passwordOk) {
    if (user && user.isActive && !user.deletedAt) {
      const failed = user.failedLoginCount + 1;
      const lock = failed >= MAX_FAILED_LOGINS;
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount: failed,
          lockedUntil: lock ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
        },
      });
      await recordAudit({
        actorUserId: user.id,
        schoolId: user.schoolId,
        action: lock ? AUDIT_ACTIONS.LOGIN_LOCKED : AUDIT_ACTIONS.LOGIN_FAILED,
        summary: lock
          ? `Hisob ${LOCK_MINUTES} daqiqaga bloklandi (${failed} ta muvaffaqiyatsiz urinish).`
          : `Muvaffaqiyatsiz kirish urinishi ${failed}.`,
        ip,
        userAgent,
      });
    }
    return { error: "Login yoki parol noto‘g‘ri." };
  }

  if (!user.isActive || user.deletedAt) {
    return { error: "Hisob bloklangan. Administratorga murojaat qiling." };
  }
  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    return { error: "Hisob vaqtincha bloklangan. Keyinroq qayta urinib ko‘ring." };
  }
  if (user.school && (!user.school.isActive || user.school.deletedAt)) {
    return { error: "Maktab faol emas. Administratorga murojaat qiling." };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
  });
  resetRateLimit(`login:${input.login.toLowerCase()}|${ip}`);

  await createSession(user.id, { ip, userAgent }, input.remember);

  await recordAudit({
    actorUserId: user.id,
    schoolId: user.schoolId,
    action: AUDIT_ACTIONS.LOGIN_SUCCESS,
    summary: `${user.firstName} ${user.lastName} tizimga kirdi.`,
    ip,
    userAgent,
  });

  const home = homeRouteFor(user.role.key);
  if (user.mustChangePassword) {
    redirect(`${home}/profile?c=1`);
  }
  redirect(home);
}

/** Server action backing the logout button. */
export async function logoutAction(): Promise<void> {
  const user = await getCurrentUser();
  if (user) {
    await recordAudit({
      actorUserId: user.id,
      schoolId: user.schoolId,
      action: AUDIT_ACTIONS.LOGOUT,
      summary: `${user.fullName} tizimdan chiqdi.`,
    });
  }
  await destroySession();
  redirect("/login");
}

const themeInputSchema = themeSchema;

/** Persist theme / sidebar preferences. Safe for every authenticated user. */
export async function updatePreferenceAction(input: z.infer<typeof themeInputSchema>): Promise<ActionResult> {
  try {
    const parsed = themeInputSchema.parse(input);
    const user = await getCurrentUser();
    if (!user) return fail(Errors.unauthorized());

    await prisma.userPreference.upsert({
      where: { userId: user.id },
      update: {
        ...(parsed.theme !== undefined ? { theme: parsed.theme } : {}),
        ...(parsed.sidebarCollapsed !== undefined ? { sidebarCollapsed: parsed.sidebarCollapsed } : {}),
        ...(parsed.attendanceSlot !== undefined ? { attendanceSlot: parsed.attendanceSlot } : {}),
      },
      create: {
        userId: user.id,
        theme: parsed.theme ?? "SYSTEM",
        sidebarCollapsed: parsed.sidebarCollapsed ?? false,
        attendanceSlot: parsed.attendanceSlot ?? "FULL_DAY",
      },
    });

    if (parsed.theme) {
      const store = await cookies();
      store.set("davomat_theme", parsed.theme, {
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      });
      await recordAudit({
        actorUserId: user.id,
        schoolId: user.schoolId,
        action: AUDIT_ACTIONS.THEME_CHANGED,
        summary: `Mavzu: ${parsed.theme}`,
      });
    }
    return ok();
  } catch (error) {
    return fail(error);
  }
}

export async function updateProfileAction(input: z.infer<typeof profileSchema>): Promise<ActionResult> {
  try {
    const parsed = profileSchema.parse(input);
    const user = await getCurrentUser();
    if (!user) return fail(Errors.unauthorized());

    // Login is a user-wide key; verify uniqueness.
    const clash = await prisma.user.findFirst({
      where: { login: parsed.login, id: { not: user.id } },
      select: { id: true },
    });
    if (clash) return fail(new Error("Bu login band. Boshqa loginni tanlang."));

    await prisma.user.update({
      where: { id: user.id },
      data: {
        login: parsed.login,
        firstName: parsed.firstName,
        lastName: parsed.lastName,
        middleName: parsed.middleName ?? null,
        phone: parsed.phone ?? null,
      },
    });

    await recordAudit({
      actorUserId: user.id,
      schoolId: user.schoolId,
      action: AUDIT_ACTIONS.PROFILE_UPDATED,
      summary: "Profil ma’lumotlari yangilandi.",
    });
    return ok();
  } catch (error) {
    return fail(error);
  }
}

export async function changePasswordAction(input: z.infer<typeof changePasswordSchema>): Promise<ActionResult> {
  try {
    const parsed = changePasswordSchema.parse(input);
    const user = await getCurrentUser();
    if (!user) return fail(Errors.unauthorized());

    const record = await prisma.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
    if (!record) return fail(new Error("Foydalanuvchi topilmadi"));

    const currentOk = await verifyPassword(parsed.currentPassword, record.passwordHash);
    if (!currentOk) return fail(new Error("Joriy parol noto‘g‘ri."));

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(parsed.newPassword), mustChangePassword: false },
    });
    await revokeUserSessions(user.id, user.sessionId);
    await recordAudit({
      actorUserId: user.id,
      schoolId: user.schoolId,
      action: AUDIT_ACTIONS.PASSWORD_CHANGED,
      summary: "Parol o‘zgartirildi.",
    });
    return ok();
  } catch (error) {
    return fail(error);
  }
}

export async function updateAvatarAction(formData: FormData): Promise<ActionResult<{ avatarPath: string }>> {
  try {
    const user = await getCurrentUser();
    if (!user) return fail(Errors.unauthorized());

    const file = formData.get("avatar");
    if (!(file instanceof File) || file.size === 0) {
      return fail(new Error("Rasm faylini tanlang."));
    }

    const relativePath = await saveAvatar(file, user.id);
    await deleteAvatar(user.avatarPath);
    await prisma.user.update({ where: { id: user.id }, data: { avatarPath: relativePath } });

    await recordAudit({
      actorUserId: user.id,
      schoolId: user.schoolId,
      action: AUDIT_ACTIONS.AVATAR_UPDATED,
      summary: "Avatar yangilandi.",
    });
    return ok({ avatarPath: relativePath });
  } catch (error) {
    return fail(error);
  }
}