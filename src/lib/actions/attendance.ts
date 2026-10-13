"use server";

import { revalidatePath } from "next/cache";
import { AttendanceSessionStatus, EnrollmentStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { saveAttendanceSchema } from "@/lib/validation/schemas";
import { can, requireSchoolPermission } from "@/lib/auth/guards";
import { recordAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { fail, ok, type ActionResult } from "@/lib/errors";
import { requestMeta } from "@/lib/request-meta";
import { parseDateOnly } from "@/lib/date";
import { PERMISSION } from "@/lib/constants";

/**
 * Attendance marking.
 *
 * Invariants enforced here:
 *   * The class and every student must belong to the actor's school.
 *   * Only students actually enrolled in the class on the date may be marked.
 *   * One record per (session, student) — enforced by a unique constraint and
 *     by the upsert below, so re-saving never creates duplicates.
 *   * Every change to an existing status is appended to `AttendanceChange`
 *     (an immutable audit trail).
 *   * Modifying a SUBMITTED register requires the `attendance:correct`
 *     permission; a teacher can submit but not silently rewrite history.
 */

export async function saveAttendanceAction(raw: unknown): Promise<ActionResult<{ sessionId: string }>> {
  try {
    const actor = await requireSchoolPermission(PERMISSION.ATTENDANCE_WRITE);
    const input = saveAttendanceSchema.parse(raw);
    const { ip, userAgent } = await requestMeta();

    const date = parseDateOnly(input.date);
    if (!date) return fail(new Error("Sana noto‘g‘ri."));

    const schoolClass = await prisma.schoolClass.findFirst({
      where: { id: input.classId, schoolId: actor.schoolId, deletedAt: null },
      select: { id: true, name: true, academicYear: true },
    });
    if (!schoolClass) return fail(new Error("Sinf topilmadi."));

    const existingSession = await prisma.attendanceSession.findUnique({
      where: { classId_date_slot: { classId: input.classId, date, slot: input.slot } },
      select: { id: true, status: true },
    });
    if (existingSession?.status === AttendanceSessionStatus.SUBMITTED && !can(actor, PERMISSION.ATTENDANCE_CORRECT)) {
      return fail(
        new Error("Belgilangan davomatni o‘zgartirish uchun ruxsatingiz yo‘q. O‘quv bo‘limiga murojaat qiling."),
      );
    }

    // Validate entries: unique students, enrolled on the date, EXCUSED needs a reason.
    const seen = new Set<string>();
    const normalized: { studentId: string; enrollmentId: string | null; status: "PRESENT" | "ABSENT" | "LATE" | "EXCUSED"; reason: string | null; note: string | null }[] = [];
    for (const entry of input.entries) {
      if (seen.has(entry.studentId)) continue;
      seen.add(entry.studentId);
      if (entry.status === "EXCUSED" && !entry.reason) {
        return fail(new Error("Sababli kelmagan o‘quvchi uchun sababni ko‘rsating."));
      }
      normalized.push({
        studentId: entry.studentId,
        enrollmentId: entry.enrollmentId ?? null,
        status: entry.status,
        reason: entry.reason ?? null,
        note: entry.note ?? null,
      });
    }
    if (normalized.length === 0) return fail(new Error("Belgilash uchun kamida bitta o‘quvchi kerak."));

    const enrollments = await prisma.enrollment.findMany({
      where: {
        schoolId: actor.schoolId,
        classId: input.classId,
        isActive: true,
        status: EnrollmentStatus.ACTIVE,
        startDate: { lte: date },
        OR: [{ endDate: null }, { endDate: { gte: date } }],
        studentId: { in: normalized.map((e) => e.studentId) },
      },
      select: { id: true, studentId: true },
    });
    const enrollmentByStudent = new Map(enrollments.map((e) => [e.studentId, e.id]));

    const submit = input.submit ?? true;

    const result = await prisma.$transaction(async (tx) => {
      const session = await tx.attendanceSession.upsert({
        where: { classId_date_slot: { classId: input.classId, date, slot: input.slot } },
        update: {
          status: submit ? AttendanceSessionStatus.SUBMITTED : AttendanceSessionStatus.DRAFT,
          recordedById: actor.id,
          ...(submit ? { submittedAt: new Date() } : {}),
        },
        create: {
          schoolId: actor.schoolId,
          classId: input.classId,
          date,
          slot: input.slot,
          status: submit ? AttendanceSessionStatus.SUBMITTED : AttendanceSessionStatus.DRAFT,
          recordedById: actor.id,
          ...(submit ? { submittedAt: new Date() } : {}),
        },
        select: { id: true },
      });

      const existingRecords = await tx.attendanceRecord.findMany({
        where: { sessionId: session.id },
        select: { id: true, studentId: true, status: true, reason: true },
      });
      const existingByStudent = new Map(existingRecords.map((r) => [r.studentId, r]));

      let saved = 0;
      let changes = 0;

      for (const entry of normalized) {
        if (!enrollmentByStudent.has(entry.studentId)) continue; // not enrolled on this date
        const prior = existingByStudent.get(entry.studentId);
        const record = await tx.attendanceRecord.upsert({
          where: { sessionId_studentId: { sessionId: session.id, studentId: entry.studentId } },
          update: {
            status: entry.status,
            reason: entry.reason,
            note: entry.note,
            enrollmentId: enrollmentByStudent.get(entry.studentId) ?? entry.enrollmentId,
            updatedById: actor.id,
          },
          create: {
            schoolId: actor.schoolId,
            sessionId: session.id,
            studentId: entry.studentId,
            enrollmentId: enrollmentByStudent.get(entry.studentId) ?? entry.enrollmentId,
            status: entry.status,
            reason: entry.reason,
            note: entry.note,
            recordedById: actor.id,
          },
          select: { id: true },
        });
        saved += 1;

        if (!prior || prior.status !== entry.status || (prior.reason ?? null) !== (entry.reason ?? null)) {
          await tx.attendanceChange.create({
            data: {
              recordId: record.id,
              changedById: actor.id,
              fromStatus: prior?.status ?? null,
              toStatus: entry.status,
              fromReason: prior?.reason ?? null,
              toReason: entry.reason,
              source: "MANUAL",
            },
          });
          changes += 1;
        }
      }

      return { sessionId: session.id, saved, changes };
    });

    if (result.saved === 0) {
      return fail(new Error("Belgilangan sanada bu sinfda birorta ham mos o‘quvchi topilmadi."));
    }

    await recordAudit({
      actorUserId: actor.id,
      schoolId: actor.schoolId,
      action: result.changes > 0 && existingSession ? AUDIT_ACTIONS.ATTENDANCE_CORRECTED : AUDIT_ACTIONS.ATTENDANCE_SAVED,
      entityType: "AttendanceSession",
      entityId: result.sessionId,
      summary: `${schoolClass.name} sinfi uchun davomat ${submit ? "saqlandi" : "qoralama sifatida saqlandi"} (${date.toISOString().slice(0, 10)}): ${result.saved} yozuv, ${result.changes} o‘zgarish.`,
      metadata: { saved: result.saved, changes: result.changes, slot: input.slot, submit },
      ip,
      userAgent,
    });

    revalidatePath("/dashboard/attendance");
    revalidatePath("/dashboard/history");
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/reports");
    return ok({ sessionId: result.sessionId });
  } catch (error) {
    return fail(error);
  }
}

/** Reopen a submitted register so it can be corrected. Requires correction rights. */
export async function reopenAttendanceSessionAction(input: { sessionId: string }): Promise<ActionResult> {
  try {
    const actor = await requireSchoolPermission(PERMISSION.ATTENDANCE_CORRECT);
    const { ip, userAgent } = await requestMeta();

    const session = await prisma.attendanceSession.findFirst({
      where: { id: input.sessionId, schoolId: actor.schoolId },
      select: { id: true, class: { select: { name: true } }, date: true },
    });
    if (!session) return fail(new Error("Davomat sessiyasi topilmadi."));

    await prisma.attendanceSession.update({
      where: { id: input.sessionId },
      data: { status: AttendanceSessionStatus.DRAFT, submittedAt: null },
    });

    await recordAudit({
      actorUserId: actor.id,
      schoolId: actor.schoolId,
      action: AUDIT_ACTIONS.ATTENDANCE_CORRECTED,
      entityType: "AttendanceSession",
      entityId: input.sessionId,
      summary: `${session.class.name} davomati tahrirlash uchun qayta ochildi (${session.date.toISOString().slice(0, 10)}).`,
      ip,
      userAgent,
    });

    revalidatePath("/dashboard/history");
    revalidatePath("/dashboard/attendance");
    return ok();
  } catch (error) {
    return fail(error);
  }
}
