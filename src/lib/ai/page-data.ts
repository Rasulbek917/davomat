import { IntegrationProvider } from "@prisma/client";
import { prisma } from "@/lib/db";
import { PROVIDER_META } from "@/lib/integration/registry";
import { aiBaseUrlHost, aiModel, aiConfigured } from "@/lib/ai/provider";
import { formatUzDateTime } from "@/lib/date";
import { classLabel } from "@/lib/utils";

/**
 * ---------------------------------------------------------------------------
 * Read model for the "AI + eMaktab" pages
 * ---------------------------------------------------------------------------
 * Pure read helpers shared by `/dashboard/ai` (school users) and `/admin/ai`
 * (super admin). They never touch credentials beyond the non-secret hint.
 * ---------------------------------------------------------------------------
 */

export type EmaktabConfigView = {
  id: string;
  name: string;
  isEnabled: boolean;
  baseUrl: string | null;
  credentialHint: string | null;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastSyncMessage: string | null;
};

export type SyncLogView = {
  id: string;
  source: string;
  providerLabel: string;
  status: string;
  dryRun: boolean;
  classesCreated: number;
  classesUpdated: number;
  studentsCreated: number;
  studentsUpdated: number;
  enrollmentsCreated: number;
  recordsSkipped: number;
  summary: string | null;
  triggeredByName: string | null;
  startedAtLabel: string;
  finishedAtLabel: string | null;
};

export type ClassOption = { id: string; label: string };

export type AiSchoolData = {
  aiReady: boolean;
  aiModel: string;
  aiHost: string;
  emaktab: EmaktabConfigView | null;
  syncLogs: SyncLogView[];
  pendingReviews: number;
  classes: ClassOption[];
};

export async function loadSchoolAiData(
  schoolId: string,
  allowedClassIds: string[] | null,
): Promise<AiSchoolData> {
  const classWhere =
    allowedClassIds === null
      ? { schoolId, deletedAt: null }
      : { schoolId, deletedAt: null, id: { in: allowedClassIds.length > 0 ? allowedClassIds : ["__none__"] } };

  const [config, logs, pendingReviews, classes] = await Promise.all([
    prisma.integrationConfig.findFirst({
      where: { schoolId, provider: IntegrationProvider.EMAKTAB_API },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        isEnabled: true,
        baseUrl: true,
        credentialHint: true,
        lastSyncAt: true,
        lastSyncStatus: true,
        lastSyncMessage: true,
      },
    }),
    prisma.syncLog.findMany({
      where: { schoolId },
      orderBy: { startedAt: "desc" },
      take: 12,
      select: {
        id: true,
        source: true,
        provider: true,
        status: true,
        dryRun: true,
        classesCreated: true,
        classesUpdated: true,
        studentsCreated: true,
        studentsUpdated: true,
        enrollmentsCreated: true,
        recordsSkipped: true,
        summary: true,
        startedAt: true,
        finishedAt: true,
        triggeredBy: { select: { firstName: true, lastName: true, middleName: true } },
      },
    }),
    prisma.importReviewItem.count({ where: { schoolId, status: "PENDING" } }),
    prisma.schoolClass.findMany({
      where: classWhere,
      select: { id: true, name: true, letter: true },
      orderBy: [{ gradeYear: "asc" }, { name: "asc" }],
    }),
  ]);

  return {
    aiReady: aiConfigured(),
    aiModel: aiModel(),
    aiHost: aiBaseUrlHost(),
    emaktab: config
      ? {
          id: config.id,
          name: config.name,
          isEnabled: config.isEnabled,
          baseUrl: config.baseUrl,
          credentialHint: config.credentialHint,
          lastSyncAt: config.lastSyncAt ? formatUzDateTime(config.lastSyncAt) : null,
          lastSyncStatus: config.lastSyncStatus,
          lastSyncMessage: config.lastSyncMessage,
        }
      : null,
    syncLogs: logs.map((log) => ({
      id: log.id,
      source: log.source,
      providerLabel: PROVIDER_META[log.provider]?.label ?? log.provider,
      status: log.status,
      dryRun: log.dryRun,
      classesCreated: log.classesCreated,
      classesUpdated: log.classesUpdated,
      studentsCreated: log.studentsCreated,
      studentsUpdated: log.studentsUpdated,
      enrollmentsCreated: log.enrollmentsCreated,
      recordsSkipped: log.recordsSkipped,
      summary: log.summary,
      triggeredByName: log.triggeredBy
        ? [log.triggeredBy.lastName, log.triggeredBy.firstName, log.triggeredBy.middleName]
            .filter(Boolean)
            .join(" ")
        : null,
      startedAtLabel: formatUzDateTime(log.startedAt),
      finishedAtLabel: log.finishedAt ? formatUzDateTime(log.finishedAt) : null,
    })),
    pendingReviews,
    classes: classes.map((c) => ({ id: c.id, label: classLabel(c.name, c.letter) })),
  };
}

export type SchoolChoice = { id: string; name: string };

export async function listSchoolChoices(): Promise<SchoolChoice[]> {
  return prisma.school.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}
