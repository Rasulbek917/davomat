"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { enrollStudentSchema, studentSchema } from "@/lib/validation/schemas";
import { requireSchoolPermission } from "@/lib/auth/guards";
import { recordAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { fail, ok, type ActionResult } from "@/lib/errors";
import { Errors } from "@/lib/errors";
import { requestMeta } from "@/lib/request-meta";
import { parseDateOnly, today, addDays } from "@/lib/date";
import { PERMISSION } from "@/lib/constants";
import { EnrollmentStatus } from "@prisma/client";

/**
 * Student management. A student row is never hard-deleted; lifecycle changes
 * are expressed through `status` and `isActive`, and class membership lives in
 * `Enrollment` so historical attendance stays intact.
 */

const REVALIDATE = ["/dashboard/students", "/dashboard/classes", "/dashboard"];

/**
 * Put a student into a class: close any other active membership and (re)activate
 * the target enrolment. Runs inside a transaction so the student is never
 * momentarily enrolled in two classes.
 */
async function assignToClass(
  schoolId: string,
  studentId: string,
  classId: string,
  startDate: Date,
): Promise<void> {
  const schoolClass = await prisma.schoolClass.findFirst({
    where: { id: classId, schoolId, deletedAt: null },
    select: { id: true, academicYear: true },
  });
  if (!schoolClass) throw Errors.validation("Tanlangan sinf topilmadi.");

  await prisma.$transaction(async (tx) => {
    await tx.enrollment.updateMany({
      where: { schoolId, studentId, isActive: true, NOT: { classId } },
      data: {
        isActive: false,
        status: EnrollmentStatus.INACTIVE,
        endDate: addDays(startDate, -1),
      },
    });

    await tx.enrollment.upsert({
      where: {
        studentId_classId_academicYear: {
          studentId,
          classId,
          academicYear: schoolClass.academicYear,
        },
      },
      update: { isActive: true, status: EnrollmentStatus.ACTIVE, endDate: null, startDate },
      create: {
        schoolId,
        studentId,
        classId,
        academicYear: schoolClass.academicYear,
        startDate,
        status: EnrollmentStatus.ACTIVE,
        isActive: true,
      },
    });
  });
}

export async function createStudentAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requireSchoolPermission(PERMISSION.STUDENTS_MANAGE);
    const input = studentSchema.parse(raw);
    const { ip, userAgent } = await requestMeta();

    if (input.externalId) {
      const clash = await prisma.student.findUnique({
        where: { schoolId_externalId: { schoolId: actor.schoolId, externalId: input.externalId } },
        select: { id: true },
      });
      if (clash) return fail(new Error("Bu tashqi ID bilan o‘quvchi allaqachon mavjud."));
    }

    const created = await prisma.student.create({
      data: {
        schoolId: actor.schoolId,
        firstName: input.firstName,
        lastName: input.lastName,
        middleName: input.middleName ?? null,
        externalId: input.externalId ?? null,
        birthDate: parseDateOnly(input.birthDate) ?? null,
        gender: input.gender ?? null,
        status: input.status ?? "ACTIVE",
        isActive: input.isActive ?? true,
        guardianName: input.guardianName ?? null,
        guardianPhone: input.guardianPhone ?? null,
        note: input.note ?? null,
      },
      select: { id: true },
    });

    if (input.classId) {
      await assignToClass(actor.schoolId, created.id, input.classId, today());
    }

    await recordAudit({
      actorUserId: actor.id,
      schoolId: actor.schoolId,
      action: AUDIT_ACTIONS.STUDENT_CREATED,
      entityType: "Student",
      entityId: created.id,
      summary: `O‘quvchi qo‘shildi: ${input.lastName} ${input.firstName}.`,
      ip,
      userAgent,
    });
    for (const path of REVALIDATE) revalidatePath(path);
    return ok({ id: created.id });
  } catch (error) {
    return fail(error);
  }
}

export async function updateStudentAction(raw: unknown): Promise<ActionResult> {
  try {
    const actor = await requireSchoolPermission(PERMISSION.STUDENTS_MANAGE);
    const input = studentSchema.parse(raw);
    if (!input.id) return fail(new Error("O‘quvchi ID ko‘rsatilmagan."));
    const { ip, userAgent } = await requestMeta();

    const existing = await prisma.student.findFirst({
      where: { id: input.id, schoolId: actor.schoolId },
      select: { id: true },
    });
    if (!existing) return fail(new Error("O‘quvchi topilmadi."));

    if (input.externalId) {
      const clash = await prisma.student.findFirst({
        where: {
          schoolId: actor.schoolId,
          externalId: input.externalId,
          id: { not: input.id },
        },
        select: { id: true },
      });
      if (clash) return fail(new Error("Bu tashqi ID bilan boshqa o‘quvchi mavjud."));
    }

    await prisma.student.update({
      where: { id: input.id },
      data: {
        firstName: input.firstName,
        lastName: input.lastName,
        middleName: input.middleName ?? null,
        externalId: input.externalId ?? null,
        birthDate: parseDateOnly(input.birthDate) ?? null,
        gender: input.gender ?? null,
        status: input.status ?? "ACTIVE",
        isActive: input.isActive ?? true,
        guardianName: input.guardianName ?? null,
        guardianPhone: input.guardianPhone ?? null,
        note: input.note ?? null,
      },
    });

    if (input.classId) {
      await assignToClass(actor.schoolId, input.id, input.classId, today());
    }

    await recordAudit({
      actorUserId: actor.id,
      schoolId: actor.schoolId,
      action: AUDIT_ACTIONS.STUDENT_UPDATED,
      entityType: "Student",
      entityId: input.id,
      summary: `O‘quvchi yangilandi: ${input.lastName} ${input.firstName}.`,
      ip,
      userAgent,
    });
    for (const path of REVALIDATE) revalidatePath(path);
    return ok();
  } catch (error) {
    return fail(error);
  }
}

export async function setStudentStatusAction(input: {
  id: string;
  status: "ACTIVE" | "TRANSFERRED" | "GRADUATED" | "INACTIVE";
  isActive?: boolean;
}): Promise<ActionResult> {
  try {
    const actor = await requireSchoolPermission(PERMISSION.STUDENTS_MANAGE);
    const { ip, userAgent } = await requestMeta();

    const existing = await prisma.student.findFirst({
      where: { id: input.id, schoolId: actor.schoolId },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!existing) return fail(new Error("O‘quvchi topilmadi."));

    const isActive = input.isActive ?? (input.status === "ACTIVE");
    await prisma.$transaction(async (tx) => {
      await tx.student.update({
        where: { id: input.id },
        data: { status: input.status, isActive },
      });
      if (!isActive) {
        await tx.enrollment.updateMany({
          where: { schoolId: actor.schoolId, studentId: input.id, isActive: true },
          data: {
            isActive: false,
            status:
              input.status === "TRANSFERRED"
                ? EnrollmentStatus.TRANSFERRED
                : input.status === "GRADUATED"
                  ? EnrollmentStatus.GRADUATED
                  : EnrollmentStatus.INACTIVE,
            endDate: today(),
          },
        });
      }
    });

    await recordAudit({
      actorUserId: actor.id,
      schoolId: actor.schoolId,
      action: AUDIT_ACTIONS.STUDENT_UPDATED,
      entityType: "Student",
      entityId: input.id,
      summary: `${existing.lastName} ${existing.firstName} holati: ${input.status}.`,
      ip,
      userAgent,
    });
    for (const path of REVALIDATE) revalidatePath(path);
    return ok();
  } catch (error) {
    return fail(error);
  }
}

export async function enrollStudentAction(raw: unknown): Promise<ActionResult> {
  try {
    const actor = await requireSchoolPermission(PERMISSION.STUDENTS_MANAGE);
    const input = enrollStudentSchema.parse(raw);
    const { ip, userAgent } = await requestMeta();

    const student = await prisma.student.findFirst({
      where: { id: input.studentId, schoolId: actor.schoolId },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!student) return fail(new Error("O‘quvchi topilmadi."));

    const startDate = parseDateOnly(input.startDate) ?? today();
    await assignToClass(actor.schoolId, input.studentId, input.classId, startDate);

    await recordAudit({
      actorUserId: actor.id,
      schoolId: actor.schoolId,
      action: AUDIT_ACTIONS.ENROLLMENT_CHANGED,
      entityType: "Enrollment",
      entityId: input.studentId,
      summary: `${student.lastName} ${student.firstName} sinfga biriktirildi.`,
      ip,
      userAgent,
    });
    for (const path of REVALIDATE) revalidatePath(path);
    return ok();
  } catch (error) {
    return fail(error);
  }
}

export async function unenrollStudentAction(input: {
  enrollmentId: string;
  endDate?: string;
}): Promise<ActionResult> {
  try {
    const actor = await requireSchoolPermission(PERMISSION.STUDENTS_MANAGE);
    const { ip, userAgent } = await requestMeta();

    const enrollment = await prisma.enrollment.findFirst({
      where: { id: input.enrollmentId, schoolId: actor.schoolId },
      select: { id: true, student: { select: { firstName: true, lastName: true } } },
    });
    if (!enrollment) return fail(new Error("Biriktirish topilmadi."));

    await prisma.enrollment.update({
      where: { id: input.enrollmentId },
      data: {
        isActive: false,
        status: EnrollmentStatus.INACTIVE,
        endDate: parseDateOnly(input.endDate) ?? today(),
      },
    });

    await recordAudit({
      actorUserId: actor.id,
      schoolId: actor.schoolId,
      action: AUDIT_ACTIONS.ENROLLMENT_CHANGED,
      entityType: "Enrollment",
      entityId: input.enrollmentId,
      summary: `${enrollment.student.lastName} ${enrollment.student.firstName} sinfdan chiqarildi.`,
      ip,
      userAgent,
    });
    for (const path of REVALIDATE) revalidatePath(path);
    return ok();
  } catch (error) {
    return fail(error);
  }
}
