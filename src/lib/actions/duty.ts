"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import {
  dutyAssignSchema,
  dutyGenerateSchema,
  dutyReasonSchema,
  dutyReplaceSchema,
  dutySettingsSchema,
  dutyStatusSchema,
} from "@/lib/validation/schemas";
import { requireSchoolPermission } from "@/lib/auth/guards";
import { recordAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { fail, ok, type ActionResult } from "@/lib/errors";
import { requestMeta } from "@/lib/request-meta";
import { DEFAULT_WORKING_DAYS, PERMISSION, isoWeekday } from "@/lib/constants";
import { eachDay, formatDateOnly, parseDateOnly } from "@/lib/date";
import { scheduleDuty, type SchedulerResult, type SchedulerTeacher } from "@/lib/duty/scheduler";
import { loadDutySettings } from "@/lib/duty/queries";

/**
 * Duty (navbatchilik) management. Every mutation is school-scoped and audited.
 * History is never silently rewritten: generating a schedule only replaces
 * PLANNED assignments, and every change appends a `DutyChange` row.
 */

const REVALIDATE = ["/dashboard/duty", "/dashboard", "/dashboard/settings"];

function revalidateAll(): void {
  for (const path of REVALIDATE) revalidatePath(path);
}

function parseOptionalDate(value: string | undefined): Date | null {
  if (!value) return null;
  return parseDateOnly(value);
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function saveDutySettingsAction(raw: unknown): Promise<ActionResult> {
  try {
    const actor = await requireSchoolPermission(PERMISSION.DUTY_MANAGE);
    const input = dutySettingsSchema.parse(raw);
    const { ip, userAgent } = await requestMeta();

    const startDate = parseOptionalDate(input.startDate);
    const endDate = parseOptionalDate(input.endDate);
    if (startDate && endDate && endDate.getTime() < startDate.getTime()) {
      return fail(new Error("Tugash sanasi boshlanish sanasidan keyin bo‘lishi kerak."));
    }

    const settings = await prisma.dutySettings.upsert({
      where: { schoolId: actor.schoolId },
      create: {
        schoolId: actor.schoolId,
        title: input.title,
        startDate,
        endDate,
        perDay: input.perDay,
        weekdays: input.weekdays,
        avoidConsecutive: input.avoidConsecutive,
        isActive: input.isActive,
        createdById: actor.id,
      },
      update: {
        title: input.title,
        startDate,
        endDate,
        perDay: input.perDay,
        weekdays: input.weekdays,
        avoidConsecutive: input.avoidConsecutive,
        isActive: input.isActive,
      },
      select: { id: true },
    });

    // Eligibility: keep only teachers that belong to this school.
    const requestedIds = input.eligibility.map((e) => e.teacherId);
    const validTeachers =
      requestedIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: requestedIds }, schoolId: actor.schoolId, deletedAt: null },
            select: { id: true },
          })
        : [];
    const validSet = new Set(validTeachers.map((t) => t.id));

    await prisma.$transaction([
      prisma.dutyTeacherEligibility.deleteMany({ where: { dutySettingsId: settings.id } }),
      ...(input.eligibility.length > 0
        ? [
            prisma.dutyTeacherEligibility.createMany({
              data: input.eligibility
                .filter((e) => validSet.has(e.teacherId))
                .map((e) => ({
                  schoolId: actor.schoolId,
                  dutySettingsId: settings.id,
                  teacherId: e.teacherId,
                  isEligible: e.isEligible,
                  unavailableFrom: parseOptionalDate(e.unavailableFrom),
                  unavailableTo: parseOptionalDate(e.unavailableTo),
                  note: e.note ?? null,
                })),
            }),
          ]
        : []),
    ]);

    await recordAudit({
      actorUserId: actor.id,
      schoolId: actor.schoolId,
      action: AUDIT_ACTIONS.DUTY_SETTINGS_UPDATED,
      entityType: "DutySettings",
      entityId: settings.id,
      summary: `Navbatchilik sozlamalari yangilandi (kuniga ${input.perDay}, ${input.weekdays.length} kun).`,
      ip,
      userAgent,
    });
    revalidateAll();
    return ok();
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------------------
// Automatic generation
// ---------------------------------------------------------------------------

export type DutyGenerateResult = {
  created: number;
  skipped: number;
  dates: number;
  conflicts: { date: string; message: string }[];
  distribution: { teacherId: string; name: string; total: number; added: number }[];
};

export type DutyPlanPreview = {
  dates: number;
  totalAssignments: number;
  conflicts: { date: string; message: string }[];
  days: { date: string; teachers: { id: string; name: string }[] }[];
  distribution: { teacherId: string; name: string; total: number; added: number }[];
};

type DutyPlan = { settingsId: string; dates: string[]; result: SchedulerResult };

/**
 * Shared, read-only computation used by both the preview and the commit action.
 * It never writes to the database, so a manager can inspect the plan first.
 */
async function computeDutyPlan(
  schoolId: string,
  from: Date,
  to: Date,
): Promise<{ plan: DutyPlan } | { error: string }> {
  const settingsRow = await prisma.dutySettings.findUnique({ where: { schoolId } });
  if (!settingsRow) return { error: "Avval navbatchilik sozlamalarini saqlang." };
  const settings = await loadDutySettings(schoolId);
  if (!settings) return { error: "Navbatchilik sozlamalari topilmadi." };

  // Determine duty dates: weekly pattern ∩ not a school holiday.
  const allowed = new Set(settings.weekdays.length > 0 ? settings.weekdays : DEFAULT_WORKING_DAYS);
  const overrides = await prisma.schoolCalendar.findMany({
    where: { schoolId, date: { gte: from, lte: to } },
    select: { date: true, isWorkingDay: true },
  });
  const overrideMap = new Map(overrides.map((o) => [formatDateOnly(o.date), o.isWorkingDay]));
  const dates = eachDay(from, to, 500)
    .map((d) => formatDateOnly(d))
    .filter((iso) => {
      if (!allowed.has(isoWeekday(new Date(`${iso}T00:00:00.000Z`)))) return false;
      return overrideMap.get(iso) !== false;
    });

  const eligibility = await prisma.dutyTeacherEligibility.findMany({
    where: { dutySettingsId: settings.id, isEligible: true },
    select: { teacherId: true, unavailableFrom: true, unavailableTo: true },
  });
  if (eligibility.length === 0) {
    return { error: "Navbatchilikka qatnashadigan o‘qituvchilar tanlanmagan." };
  }

  const teacherRecords = await prisma.user.findMany({
    where: {
      id: { in: eligibility.map((e) => e.teacherId) },
      schoolId,
      deletedAt: null,
      isActive: true,
    },
    select: { id: true, firstName: true, lastName: true, middleName: true },
  });
  if (teacherRecords.length === 0) return { error: "Faol o‘qituvchilar topilmadi." };

  const history = await prisma.dutyAssignment.groupBy({
    by: ["teacherId"],
    where: { schoolId },
    _count: { _all: true },
    _max: { date: true },
  });
  const countMap = new Map(history.map((h) => [h.teacherId, h._count._all]));
  const lastMap = new Map(history.map((h) => [h.teacherId, h._max.date ? formatDateOnly(h._max.date) : null]));

  const eligibilityById = new Map(eligibility.map((e) => [e.teacherId, e]));
  const teachers: SchedulerTeacher[] = teacherRecords.map((t) => {
    const window = eligibilityById.get(t.id);
    const unavailable: string[] = [];
    if (window?.unavailableFrom || window?.unavailableTo) {
      const fromIso = window?.unavailableFrom ? formatDateOnly(window.unavailableFrom) : "0000-01-01";
      const toIso = window?.unavailableTo ? formatDateOnly(window.unavailableTo) : "9999-12-31";
      for (const iso of dates) if (iso >= fromIso && iso <= toIso) unavailable.push(iso);
    }
    return {
      id: t.id,
      name: [t.lastName, t.firstName].filter(Boolean).join(" "),
      assignedCount: countMap.get(t.id) ?? 0,
      lastAssignedDate: lastMap.get(t.id) ?? null,
      unavailableDates: unavailable,
    };
  });

  const result = scheduleDuty({
    dates,
    perDay: settings.perDay,
    teachers,
    avoidConsecutive: settings.avoidConsecutive,
  });

  return { plan: { settingsId: settings.id, dates, result } };
}

function emptyPlanPreview(plan: DutyPlan): DutyPlanPreview {
  const nameById = new Map(plan.result.distribution.map((d) => [d.teacherId, d.name]));
  const daysMap = new Map<string, { id: string; name: string }[]>();
  for (const assignment of plan.result.assignments) {
    const list = daysMap.get(assignment.date) ?? [];
    list.push({ id: assignment.teacherId, name: nameById.get(assignment.teacherId) ?? assignment.teacherId });
    daysMap.set(assignment.date, list);
  }
  return {
    dates: plan.dates.length,
    totalAssignments: plan.result.assignments.length,
    conflicts: plan.result.conflicts.map((c) => ({ date: c.date, message: c.message })),
    days: [...daysMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, teachers]) => ({ date, teachers })),
    distribution: plan.result.distribution.map((d) => ({
      teacherId: d.teacherId,
      name: d.name,
      total: d.total,
      added: d.added,
    })),
  };
}

/** Dry run: compute the schedule and return it for review without saving. */
export async function previewDutyScheduleAction(raw: unknown): Promise<ActionResult<DutyPlanPreview>> {
  try {
    const actor = await requireSchoolPermission(PERMISSION.DUTY_MANAGE);
    const input = dutyGenerateSchema.parse(raw);
    const from = parseDateOnly(input.from);
    const to = parseDateOnly(input.to);
    if (!from || !to) return fail(new Error("Sana noto‘g‘ri."));
    if (to.getTime() < from.getTime()) return fail(new Error("Tugash sanasi boshlanishdan keyin bo‘lishi kerak."));
    if (eachDay(from, to, 500).length >= 500) {
      return fail(new Error("Davr juda katta. Iltimos, davrni qisqartiring (maks. 500 kun)."));
    }

    const computed = await computeDutyPlan(actor.schoolId, from, to);
    if ("error" in computed) return fail(new Error(computed.error));
    return ok(emptyPlanPreview(computed.plan));
  } catch (error) {
    return fail(error);
  }
}

export async function generateDutyScheduleAction(raw: unknown): Promise<ActionResult<DutyGenerateResult>> {
  try {
    const actor = await requireSchoolPermission(PERMISSION.DUTY_MANAGE);
    const input = dutyGenerateSchema.parse(raw);
    const { ip, userAgent } = await requestMeta();

    const from = parseDateOnly(input.from);
    const to = parseDateOnly(input.to);
    if (!from || !to) return fail(new Error("Sana noto‘g‘ri."));
    if (to.getTime() < from.getTime()) return fail(new Error("Tugash sanasi boshlanishdan keyin bo‘lishi kerak."));
    if (eachDay(from, to, 500).length >= 500) {
      return fail(new Error("Davr juda katta. Iltimos, davrni qisqartiring (maks. 500 kun)."));
    }

    const computed = await computeDutyPlan(actor.schoolId, from, to);
    if ("error" in computed) return fail(new Error(computed.error));
    const { settingsId, dates, result } = computed.plan;

    // Replace existing PLANNED assignments in range when requested; never touch
    // COMPLETED / REPLACED / CANCELLED history.
    let deleted = 0;
    if (input.replaceExisting) {
      const del = await prisma.dutyAssignment.deleteMany({
        where: { schoolId: actor.schoolId, date: { gte: from, lte: to }, status: "PLANNED" },
      });
      deleted = del.count;
    }

    let created = 0;
    let skipped = 0;
    for (const assignment of result.assignments) {
      const dateValue = parseDateOnly(assignment.date);
      if (!dateValue) continue;
      try {
        const row = await prisma.dutyAssignment.create({
          data: {
            schoolId: actor.schoolId,
            dutySettingsId: settingsId,
            date: dateValue,
            teacherId: assignment.teacherId,
            slotIndex: assignment.slotIndex,
            status: "PLANNED",
            createdById: actor.id,
          },
          select: { id: true },
        });
        await prisma.dutyChange.create({
          data: {
            schoolId: actor.schoolId,
            assignmentId: row.id,
            changedById: actor.id,
            action: "GENERATED",
            toTeacherId: assignment.teacherId,
            toStatus: "PLANNED",
            reason: "Avtomatik jadval",
          },
        });
        created += 1;
      } catch {
        // Unique clash with an existing (non-deleted) assignment.
        skipped += 1;
      }
    }

    await recordAudit({
      actorUserId: actor.id,
      schoolId: actor.schoolId,
      action: AUDIT_ACTIONS.DUTY_GENERATED,
      entityType: "DutySettings",
      entityId: settingsId,
      summary: `Navbatchilik jadvali tuzildi: ${created} tayinlov, ${input.from}–${input.to} (${deleted} qayta yozildi).`,
      metadata: { conflicts: result.conflicts.length, skipped },
      ip,
      userAgent,
    });
    revalidateAll();

    return ok({
      created,
      skipped,
      dates: dates.length,
      conflicts: result.conflicts.map((c) => ({ date: c.date, message: c.message })),
      distribution: result.distribution.map((d) => ({
        teacherId: d.teacherId,
        name: d.name,
        total: d.total,
        added: d.added,
      })),
    });
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------------------
// Manual changes
// ---------------------------------------------------------------------------

async function requireSettings(schoolId: string) {
  const settings = await prisma.dutySettings.findUnique({ where: { schoolId }, select: { id: true } });
  return settings;
}

export async function assignDutyAction(raw: unknown): Promise<ActionResult> {
  try {
    const actor = await requireSchoolPermission(PERMISSION.DUTY_MANAGE);
    const input = dutyAssignSchema.parse(raw);
    const { ip, userAgent } = await requestMeta();

    const settings = await requireSettings(actor.schoolId);
    if (!settings) return fail(new Error("Avval navbatchilik sozlamalarini saqlang."));
    const date = parseDateOnly(input.date);
    if (!date) return fail(new Error("Sana noto‘g‘ri."));

    const teachers = await prisma.user.findMany({
      where: { id: { in: input.teacherIds }, schoolId: actor.schoolId, deletedAt: null },
      select: { id: true },
    });
    if (teachers.length !== new Set(input.teacherIds).size) {
      return fail(new Error("Tanlangan o‘qituvchilardan biri topilmadi."));
    }

    let created = 0;
    let slot = 0;
    for (const teacherId of [...new Set(input.teacherIds)]) {
      const exists = await prisma.dutyAssignment.findFirst({
        where: { dutySettingsId: settings.id, date, teacherId },
        select: { id: true },
      });
      if (exists) {
        slot += 1;
        continue;
      }
      const row = await prisma.dutyAssignment.create({
        data: {
          schoolId: actor.schoolId,
          dutySettingsId: settings.id,
          date,
          teacherId,
          slotIndex: slot,
          status: "PLANNED",
          note: input.note ?? null,
          createdById: actor.id,
        },
        select: { id: true },
      });
      await prisma.dutyChange.create({
        data: {
          schoolId: actor.schoolId,
          assignmentId: row.id,
          changedById: actor.id,
          action: "ASSIGNED",
          toTeacherId: teacherId,
          toStatus: "PLANNED",
          reason: input.note ?? "Qo‘lda tayinlash",
        },
      });
      created += 1;
      slot += 1;
    }

    await recordAudit({
      actorUserId: actor.id,
      schoolId: actor.schoolId,
      action: AUDIT_ACTIONS.DUTY_ASSIGNED,
      entityType: "DutyAssignment",
      summary: `${input.date} sanasiga ${created} nafar navbatchi qo‘shildi.`,
      ip,
      userAgent,
    });
    revalidateAll();
    if (created === 0) return fail(new Error("Tanlangan o‘qituvchilar allaqachon shu kunga tayinlangan."));
    return ok();
  } catch (error) {
    return fail(error);
  }
}

export async function replaceDutyAction(raw: unknown): Promise<ActionResult> {
  try {
    const actor = await requireSchoolPermission(PERMISSION.DUTY_MANAGE);
    const input = dutyReplaceSchema.parse(raw);
    const { ip, userAgent } = await requestMeta();

    const assignment = await prisma.dutyAssignment.findFirst({
      where: { id: input.assignmentId, schoolId: actor.schoolId },
      select: { id: true, teacherId: true, originalTeacherId: true, status: true, date: true },
    });
    if (!assignment) return fail(new Error("Navbatchilik yozuvi topilmadi."));
    if (assignment.teacherId === input.teacherId) {
      return fail(new Error("Yangi o‘qituvchi hozirgi navbatchi bilan bir xil."));
    }

    const nextTeacher = await prisma.user.findFirst({
      where: { id: input.teacherId, schoolId: actor.schoolId, deletedAt: null, isActive: true },
      select: { id: true },
    });
    if (!nextTeacher) return fail(new Error("Yangi o‘qituvchi topilmadi."));

    await prisma.dutyAssignment.update({
      where: { id: assignment.id },
      data: {
        teacherId: input.teacherId,
        originalTeacherId: assignment.originalTeacherId ?? assignment.teacherId,
        status: "REPLACED",
        updatedById: actor.id,
        note: input.reason,
      },
    });
    await prisma.dutyChange.create({
      data: {
        schoolId: actor.schoolId,
        assignmentId: assignment.id,
        changedById: actor.id,
        action: "REPLACED",
        fromTeacherId: assignment.teacherId,
        toTeacherId: input.teacherId,
        fromStatus: assignment.status,
        toStatus: "REPLACED",
        reason: input.reason,
      },
    });

    await recordAudit({
      actorUserId: actor.id,
      schoolId: actor.schoolId,
      action: AUDIT_ACTIONS.DUTY_REPLACED,
      entityType: "DutyAssignment",
      entityId: assignment.id,
      summary: `Navbatchi almashtirildi (${formatDateOnly(assignment.date)}).`,
      metadata: { reason: input.reason },
      ip,
      userAgent,
    });
    revalidateAll();
    return ok();
  } catch (error) {
    return fail(error);
  }
}

export async function cancelDutyAction(raw: unknown): Promise<ActionResult> {
  try {
    const actor = await requireSchoolPermission(PERMISSION.DUTY_MANAGE);
    const input = dutyReasonSchema.parse(raw);
    const { ip, userAgent } = await requestMeta();

    const assignment = await prisma.dutyAssignment.findFirst({
      where: { id: input.assignmentId, schoolId: actor.schoolId },
      select: { id: true, status: true, date: true, teacherId: true },
    });
    if (!assignment) return fail(new Error("Navbatchilik yozuvi topilmadi."));
    if (assignment.status === "CANCELLED") return fail(new Error("Bu navbatchilik allaqachon bekor qilingan."));

    await prisma.dutyAssignment.update({
      where: { id: assignment.id },
      data: { status: "CANCELLED", updatedById: actor.id, note: input.reason },
    });
    await prisma.dutyChange.create({
      data: {
        schoolId: actor.schoolId,
        assignmentId: assignment.id,
        changedById: actor.id,
        action: "CANCELLED",
        fromTeacherId: assignment.teacherId,
        fromStatus: assignment.status,
        toStatus: "CANCELLED",
        reason: input.reason,
      },
    });

    await recordAudit({
      actorUserId: actor.id,
      schoolId: actor.schoolId,
      action: AUDIT_ACTIONS.DUTY_CANCELLED,
      entityType: "DutyAssignment",
      entityId: assignment.id,
      summary: `Navbatchilik bekor qilindi (${formatDateOnly(assignment.date)}).`,
      metadata: { reason: input.reason },
      ip,
      userAgent,
    });
    revalidateAll();
    return ok();
  } catch (error) {
    return fail(error);
  }
}

export async function setDutyStatusAction(raw: unknown): Promise<ActionResult> {
  try {
    const actor = await requireSchoolPermission(PERMISSION.DUTY_MANAGE);
    const input = dutyStatusSchema.parse(raw);
    const { ip, userAgent } = await requestMeta();

    const assignment = await prisma.dutyAssignment.findFirst({
      where: { id: input.assignmentId, schoolId: actor.schoolId },
      select: { id: true, status: true, date: true, teacherId: true },
    });
    if (!assignment) return fail(new Error("Navbatchilik yozuvi topilmadi."));

    await prisma.dutyAssignment.update({
      where: { id: assignment.id },
      data: { status: input.status, updatedById: actor.id },
    });
    await prisma.dutyChange.create({
      data: {
        schoolId: actor.schoolId,
        assignmentId: assignment.id,
        changedById: actor.id,
        action: "STATUS",
        fromStatus: assignment.status,
        toStatus: input.status,
        fromTeacherId: assignment.teacherId,
      },
    });

    await recordAudit({
      actorUserId: actor.id,
      schoolId: actor.schoolId,
      action: AUDIT_ACTIONS.DUTY_STATUS_CHANGED,
      entityType: "DutyAssignment",
      entityId: assignment.id,
      summary: `Navbatchilik holati o‘zgardi: ${input.status} (${formatDateOnly(assignment.date)}).`,
      ip,
      userAgent,
    });
    revalidateAll();
    return ok();
  } catch (error) {
    return fail(error);
  }
}
