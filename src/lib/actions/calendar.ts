"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { calendarDaySchema } from "@/lib/validation/schemas";
import { requireSchoolPermission } from "@/lib/auth/guards";
import { recordAudit } from "@/lib/audit";
import { fail, ok, type ActionResult } from "@/lib/errors";
import { requestMeta } from "@/lib/request-meta";
import { parseDateOnly } from "@/lib/date";
import { PERMISSION } from "@/lib/constants";

/**
 * School calendar overrides.
 *
 * By default Monday–Friday are working days. A school overrides individual dates
 * (holidays, exam days, extra working Saturdays). Statistics such as "number of
 * school days in a period" read these rows, so changing them changes what a
 * weekly report means — hence the audit entry on every change.
 */

const REVALIDATE = ["/dashboard/settings", "/dashboard", "/dashboard/reports", "/dashboard/history"];

export async function setCalendarDayAction(raw: unknown): Promise<ActionResult> {
  try {
    const actor = await requireSchoolPermission(PERMISSION.CLASSES_MANAGE);
    const input = calendarDaySchema.parse(raw);
    const { ip, userAgent } = await requestMeta();

    const date = parseDateOnly(input.date);
    if (!date) return fail(new Error("Sana noto‘g‘ri."));

    await prisma.schoolCalendar.upsert({
      where: { schoolId_date: { schoolId: actor.schoolId, date } },
      update: {
        isWorkingDay: input.isWorkingDay,
        note: input.note ?? null,
        academicYear: input.academicYear ?? null,
      },
      create: {
        schoolId: actor.schoolId,
        date,
        isWorkingDay: input.isWorkingDay,
        note: input.note ?? null,
        academicYear: input.academicYear ?? null,
      },
    });

    await recordAudit({
      actorUserId: actor.id,
      schoolId: actor.schoolId,
      action: "calendar.updated",
      entityType: "SchoolCalendar",
      entityId: input.date,
      summary: `${input.date} sanasi ${input.isWorkingDay ? "ish kuni" : "dam olish kuni"} sifatida belgilandi.`,
      ip,
      userAgent,
    });
    for (const path of REVALIDATE) revalidatePath(path);
    return ok();
  } catch (error) {
    return fail(error);
  }
}

export async function removeCalendarDayAction(input: { date: string }): Promise<ActionResult> {
  try {
    const actor = await requireSchoolPermission(PERMISSION.CLASSES_MANAGE);
    const { ip, userAgent } = await requestMeta();
    const date = parseDateOnly(input.date);
    if (!date) return fail(new Error("Sana noto‘g‘ri."));

    await prisma.schoolCalendar.deleteMany({ where: { schoolId: actor.schoolId, date } });

    await recordAudit({
      actorUserId: actor.id,
      schoolId: actor.schoolId,
      action: "calendar.updated",
      entityType: "SchoolCalendar",
      entityId: input.date,
      summary: `${input.date} sanasidagi o‘zgartirish olib tashlandi (standart qoidaga qaytdi).`,
      ip,
      userAgent,
    });
    for (const path of REVALIDATE) revalidatePath(path);
    return ok();
  } catch (error) {
    return fail(error);
  }
}
