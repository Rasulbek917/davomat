import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export type AuditInput = {
  actorUserId?: string | null;
  schoolId?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  summary: string;
  metadata?: Prisma.InputJsonValue | null;
  ip?: string | null;
  userAgent?: string | null;
};

/**
 * Append-only audit trail for sensitive operations.
 * Never throws: a failed audit write must not break the user-facing action,
 * but it is logged loudly.
 */
export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorUserId: input.actorUserId ?? null,
        schoolId: input.schoolId ?? null,
        action: input.action,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        summary: input.summary,
        metadata: input.metadata ?? undefined,
        ip: input.ip ?? null,
        userAgent: input.userAgent?.slice(0, 400) ?? null,
      },
    });
  } catch (error) {
    console.error("[audit] failed to record audit log", { action: input.action, error });
  }
}

export const AUDIT_ACTIONS = {
  LOGIN_SUCCESS: "auth.login.success",
  LOGIN_FAILED: "auth.login.failed",
  LOGIN_LOCKED: "auth.login.locked",
  LOGOUT: "auth.logout",
  PASSWORD_CHANGED: "user.password.changed",
  PASSWORD_RESET: "user.password.reset",
  PROFILE_UPDATED: "user.profile.updated",
  AVATAR_UPDATED: "user.avatar.updated",
  THEME_CHANGED: "user.theme.changed",
  SCHOOL_CREATED: "school.created",
  SCHOOL_UPDATED: "school.updated",
  SCHOOL_DEACTIVATED: "school.deactivated",
  DIRECTOR_CREATED: "director.created",
  DIRECTOR_UPDATED: "director.updated",
  DIRECTOR_DEACTIVATED: "director.deactivated",
  EMPLOYEE_CREATED: "employee.created",
  EMPLOYEE_UPDATED: "employee.updated",
  EMPLOYEE_DEACTIVATED: "employee.deactivated",
  CLASS_CREATED: "class.created",
  CLASS_UPDATED: "class.updated",
  CLASS_SCHEDULE_UPDATED: "class.schedule.updated",
  STUDENT_CREATED: "student.created",
  STUDENT_UPDATED: "student.updated",
  ENROLLMENT_CHANGED: "enrollment.changed",
  ATTENDANCE_SAVED: "attendance.saved",
  ATTENDANCE_CORRECTED: "attendance.corrected",
  DUTY_SETTINGS_UPDATED: "duty.settings.updated",
  DUTY_GENERATED: "duty.generated",
  DUTY_ASSIGNED: "duty.assigned",
  DUTY_REPLACED: "duty.replaced",
  DUTY_CANCELLED: "duty.cancelled",
  DUTY_STATUS_CHANGED: "duty.status.changed",
  INTEGRATION_CONFIGURED: "integration.configured",
  INTEGRATION_SYNC: "integration.sync",
  INTEGRATION_REVIEW_RESOLVED: "integration.review.resolved",
  REPORT_EXPORTED: "report.exported",
  AI_QUERY: "ai.query",
  AI_ERROR: "ai.error",
  EMAKTAB_CONNECT: "integration.emaktab.connect",
} as const;
