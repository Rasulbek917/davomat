"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { classSchema, classScheduleSchema } from "@/lib/validation/schemas";
import { requireSchoolPermission } from "@/lib/auth/guards";
import { recordAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { fail, ok, type ActionResult } from "@/lib/errors";
import { requestMeta } from "@/lib/request-meta";
import { DEFAULT_WORKING_DAYS, PERMISSION } from "@/lib/constants";
import { parseDateOnly, today } from "@/lib/date";

/**
 * Class management for a school. The school is derived from the session, and
 * the optional homeroom teacher must belong to the same school.
 */

const REVALIDATE = ["/dashboard/classes", "/dashboard/students", "/dashboard"];

/** Validate that an optional teacherId references a user in this school. */
async function resolveTeacherId(
  schoolId: string,
  teacherId: string | undefined,
): Promise<{ ok: true; value: string | null } | { ok: false; error: string }> {
  if (!teacherId) return { ok: true, value: null };
  const teacher = await prisma.user.findFirst({
    where: { id: teacherId, schoolId, isActive: true, deletedAt: null },
    select: { id: true },
  });
  if (!teacher) return { ok: false, error: "Tanlangan sinf rahbari topilmadi." };
  return { ok: true, value: teacher.id };
}

/**
 * Persist a weekly-schedule version for a class and refresh the denormalised
 * `workingDays` column. A version effective from the same date replaces the
 * previous one instead of stacking duplicates.
 */
async function recordScheduleVersion(input: {
  schoolId: string;
  classId: string;
  weekdays: number[];
  actorId: string;
  effectiveFrom: Date;
  note?: string | null;
}): Promise<void> {
  const existing = await prisma.classSchedule.findFirst({
    where: { classId: input.classId, effectiveFrom: input.effectiveFrom },
    select: { id: true },
  });
  if (existing) {
    await prisma.classSchedule.update({
      where: { id: existing.id },
      data: { weekdays: input.weekdays, note: input.note ?? null },
    });
  } else {
    await prisma.classSchedule.create({
      data: {
        schoolId: input.schoolId,
        classId: input.classId,
        effectiveFrom: input.effectiveFrom,
        weekdays: input.weekdays,
        note: input.note ?? null,
        createdById: input.actorId,
      },
    });
  }
  // Denormalised current value mirrors the most recent version.
  const latest = await prisma.classSchedule.findFirst({
    where: { classId: input.classId },
    orderBy: { effectiveFrom: "desc" },
    select: { weekdays: true },
  });
  await prisma.schoolClass.update({
    where: { id: input.classId },
    data: { workingDays: latest?.weekdays ?? input.weekdays },
  });
}

export async function createClassAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requireSchoolPermission(PERMISSION.CLASSES_MANAGE);
    const input = classSchema.parse(raw);
    const { ip, userAgent } = await requestMeta();

    const teacher = await resolveTeacherId(actor.schoolId, input.teacherId);
    if (!teacher.ok) return fail(new Error(teacher.error));

    const clash = await prisma.schoolClass.findUnique({
      where: {
        schoolId_name_academicYear: {
          schoolId: actor.schoolId,
          name: input.name,
          academicYear: input.academicYear,
        },
      },
      select: { id: true },
    });
    if (clash) return fail(new Error("Bu nomdagi sinf shu o‘quv yili uchun allaqachon mavjud."));

    const weekdays = input.weekdays ?? DEFAULT_WORKING_DAYS;

    const created = await prisma.schoolClass.create({
      data: {
        schoolId: actor.schoolId,
        name: input.name,
        letter: input.letter ?? null,
        gradeYear: input.gradeYear,
        academicYear: input.academicYear,
        capacity: input.capacity ?? null,
        teacherId: teacher.value,
        workingDays: weekdays,
        isActive: input.isActive ?? true,
      },
      select: { id: true },
    });

    // Record the initial weekly schedule as a version so future changes stay
    // historically accurate.
    await prisma.classSchedule.create({
      data: {
        schoolId: actor.schoolId,
        classId: created.id,
        effectiveFrom: today(),
        weekdays,
        createdById: actor.id,
      },
    });

    await recordAudit({
      actorUserId: actor.id,
      schoolId: actor.schoolId,
      action: AUDIT_ACTIONS.CLASS_CREATED,
      entityType: "SchoolClass",
      entityId: created.id,
      summary: `Sinf yaratildi: ${input.name} (${input.academicYear}).`,
      ip,
      userAgent,
    });
    for (const path of REVALIDATE) revalidatePath(path);
    return ok({ id: created.id });
  } catch (error) {
    return fail(error);
  }
}

export async function updateClassAction(raw: unknown): Promise<ActionResult> {
  try {
    const actor = await requireSchoolPermission(PERMISSION.CLASSES_MANAGE);
    const input = classSchema.parse(raw);
    if (!input.id) return fail(new Error("Sinf ID ko‘rsatilmagan."));
    const { ip, userAgent } = await requestMeta();

    const existing = await prisma.schoolClass.findFirst({
      where: { id: input.id, schoolId: actor.schoolId },
      select: { id: true, workingDays: true },
    });
    if (!existing) return fail(new Error("Sinf topilmadi."));

    const teacher = await resolveTeacherId(actor.schoolId, input.teacherId);
    if (!teacher.ok) return fail(new Error(teacher.error));

    const clash = await prisma.schoolClass.findFirst({
      where: {
        schoolId: actor.schoolId,
        name: input.name,
        academicYear: input.academicYear,
        id: { not: input.id },
      },
      select: { id: true },
    });
    if (clash) return fail(new Error("Bu nomdagi sinf shu o‘quv yili uchun allaqachon mavjud."));

    const weekdays = input.weekdays ?? existing.workingDays ?? DEFAULT_WORKING_DAYS;

    await prisma.schoolClass.update({
      where: { id: input.id },
      data: {
        name: input.name,
        letter: input.letter ?? null,
        gradeYear: input.gradeYear,
        academicYear: input.academicYear,
        capacity: input.capacity ?? null,
        teacherId: teacher.value,
        workingDays: weekdays,
        isActive: input.isActive ?? true,
      },
    });

    // Only version the schedule when the study days actually changed.
    const changed =
      weekdays.length !== existing.workingDays.length ||
      [...weekdays].sort().join(",") !== [...existing.workingDays].sort().join(",");
    if (changed) {
      await recordScheduleVersion({
        schoolId: actor.schoolId,
        classId: input.id,
        weekdays,
        actorId: actor.id,
        effectiveFrom: today(),
      });
    }

    await recordAudit({
      actorUserId: actor.id,
      schoolId: actor.schoolId,
      action: AUDIT_ACTIONS.CLASS_UPDATED,
      entityType: "SchoolClass",
      entityId: input.id,
      summary: `Sinf yangilandi: ${input.name}.`,
      ip,
      userAgent,
    });
    for (const path of REVALIDATE) revalidatePath(path);
    return ok();
  } catch (error) {
    return fail(error);
  }
}

/**
 * Record a new weekly-schedule version for a class. The `effectiveFrom` date
 * lets a director apply a change prospectively without rewriting older reports.
 */
export async function saveClassScheduleAction(raw: unknown): Promise<ActionResult> {
  try {
    const actor = await requireSchoolPermission(PERMISSION.CLASSES_MANAGE);
    const input = classScheduleSchema.parse(raw);
    const { ip, userAgent } = await requestMeta();

    const existing = await prisma.schoolClass.findFirst({
      where: { id: input.classId, schoolId: actor.schoolId },
      select: { id: true, name: true },
    });
    if (!existing) return fail(new Error("Sinf topilmadi."));

    const effectiveFrom = parseDateOnly(input.effectiveFrom) ?? today();
    await recordScheduleVersion({
      schoolId: actor.schoolId,
      classId: input.classId,
      weekdays: input.weekdays,
      actorId: actor.id,
      effectiveFrom,
      note: input.note ?? null,
    });

    await recordAudit({
      actorUserId: actor.id,
      schoolId: actor.schoolId,
      action: AUDIT_ACTIONS.CLASS_SCHEDULE_UPDATED,
      entityType: "SchoolClass",
      entityId: input.classId,
      summary: `${existing.name} o‘qish kunlari yangilandi (${
        input.weekdays.length
      } kun, ${input.effectiveFrom} dan).`,
      ip,
      userAgent,
    });
    for (const path of [...REVALIDATE, "/dashboard/attendance"]) revalidatePath(path);
    return ok();
  } catch (error) {
    return fail(error);
  }
}

export async function setClassActiveAction(input: {
  id: string;
  isActive: boolean;
}): Promise<ActionResult> {
  try {
    const actor = await requireSchoolPermission(PERMISSION.CLASSES_MANAGE);
    const { ip, userAgent } = await requestMeta();

    const existing = await prisma.schoolClass.findFirst({
      where: { id: input.id, schoolId: actor.schoolId },
      select: { name: true },
    });
    if (!existing) return fail(new Error("Sinf topilmadi."));

    await prisma.schoolClass.update({ where: { id: input.id }, data: { isActive: input.isActive } });

    await recordAudit({
      actorUserId: actor.id,
      schoolId: actor.schoolId,
      action: AUDIT_ACTIONS.CLASS_UPDATED,
      entityType: "SchoolClass",
      entityId: input.id,
      summary: `${existing.name} ${input.isActive ? "faollashtirildi" : "arxivlandi"}.`,
      ip,
      userAgent,
    });
    for (const path of REVALIDATE) revalidatePath(path);
    return ok();
  } catch (error) {
    return fail(error);
  }
}
