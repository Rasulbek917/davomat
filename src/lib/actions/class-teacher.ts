"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireSchoolPermission } from "@/lib/auth/guards";
import { recordAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { fail, ok, type ActionResult } from "@/lib/errors";
import { requestMeta } from "@/lib/request-meta";
import { PERMISSION } from "@/lib/constants";
import { today } from "@/lib/date";

export async function assignClassTeacherAction(input: {
  classId: string;
  teacherId: string | null;
  note?: string;
}): Promise<ActionResult> {
  try {
    const actor = await requireSchoolPermission(PERMISSION.CLASSES_MANAGE);
    const { ip, userAgent } = await requestMeta();

    const schoolClass = await prisma.schoolClass.findFirst({
      where: { id: input.classId, schoolId: actor.schoolId },
      select: { id: true, name: true, teacherId: true },
    });
    if (!schoolClass) return fail(new Error("Sinf topilmadi."));

    if (input.teacherId) {
      const teacher = await prisma.user.findFirst({
        where: { id: input.teacherId, schoolId: actor.schoolId, isActive: true, deletedAt: null },
        select: { id: true, firstName: true, lastName: true },
      });
      if (!teacher) return fail(new Error("Tanlangan o‘qituvchi topilmadi."));
    }

    const previousTeacherId = schoolClass.teacherId;

    // Update current assignment
    await prisma.schoolClass.update({
      where: { id: input.classId },
      data: { teacherId: input.teacherId ?? null },
    });

    // Close previous history rows
    await prisma.classTeacherAssignment.updateMany({
      where: { classId: input.classId, endedAt: null },
      data: { endedAt: today(), endReason: input.teacherId ? "REPLACED" : "REMOVED" },
    });

    // Create new history if assigned
    if (input.teacherId) {
      await prisma.classTeacherAssignment.create({
        data: {
          schoolId: actor.schoolId,
          classId: input.classId,
          teacherId: input.teacherId,
          assignedById: actor.id,
          assignedAt: today(),
        },
      });
    }

    await recordAudit({
      actorUserId: actor.id,
      schoolId: actor.schoolId,
      action: AUDIT_ACTIONS.CLASS_UPDATED,
      entityType: "SchoolClass",
      entityId: input.classId,
      summary: `${schoolClass.name} sinfiga sinf rahbari tayinlandi/yangilandi`,
      metadata: { previousTeacherId, teacherId: input.teacherId },
      ip,
      userAgent,
    });

    for (const path of ["/dashboard/classes", "/dashboard/employees", "/dashboard"]) {
      revalidatePath(path);
    }
    return ok();
  } catch (error) {
    return fail(error);
  }
}
