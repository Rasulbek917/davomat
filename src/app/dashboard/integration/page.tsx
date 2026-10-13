import { redirect } from "next/navigation";
import { ReviewStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { can, requirePageUser } from "@/lib/auth/guards";
import { ACADEMIC_YEAR_DEFAULT, PERMISSION } from "@/lib/constants";
import { PageHeader } from "@/components/ui/page-header";
import {
  IntegrationClient,
  type IntegrationSummary,
  type ProviderKey,
  type ReviewRow,
  type StudentOption,
  type SyncLogRow,
} from "@/components/dashboard/integration-client";
import { PROVIDER_META } from "@/lib/integration/registry";
import { formatUzDateTime } from "@/lib/date";
import { fullName } from "@/lib/utils";

export const metadata = { title: "Integratsiya" };

const REASON_LABEL: Record<string, string> = {
  AMBIGUOUS_STUDENT_NAME: "Bir nechta mos o‘quvchi",
  BIRTHDATE_MISMATCH: "Tug‘ilgan sana mos emas",
  CLASS_NOT_FOUND: "Sinf aniqlanmadi",
  DUPLICATE_IN_SOURCE: "Manbada takrorlangan",
};

function readSettings(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asBool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asErrorList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (typeof value === "string" && value.length > 0) return [value];
  return [];
}

export default async function DashboardIntegrationPage() {
  const user = await requirePageUser();
  if (!user.schoolId) redirect("/dashboard");
  if (!can(user, PERMISSION.INTEGRATION_READ)) redirect("/dashboard");

  const schoolId = user.schoolId;

  const [configs, logs, reviews, students] = await Promise.all([
    prisma.integrationConfig.findMany({
      where: { schoolId },
      orderBy: [{ provider: "asc" }, { createdAt: "asc" }],
    }),
    prisma.syncLog.findMany({
      where: { schoolId },
      orderBy: { startedAt: "desc" },
      take: 25,
      include: { triggeredBy: { select: { firstName: true, lastName: true, middleName: true } } },
    }),
    prisma.importReviewItem.findMany({
      where: { schoolId, status: ReviewStatus.PENDING },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.student.findMany({
      where: { schoolId, deletedAt: null },
      select: { id: true, firstName: true, lastName: true, middleName: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: 1000,
    }),
  ]);

  // Resolve candidate student ids (stored on review items) into readable names.
  const candidateIds = new Set<string>();
  for (const review of reviews) {
    if (Array.isArray(review.candidates)) {
      for (const id of review.candidates) if (typeof id === "string") candidateIds.add(id);
    }
  }
  const candidateStudents =
    candidateIds.size > 0
      ? await prisma.student.findMany({
          where: { id: { in: [...candidateIds] } },
          select: { id: true, firstName: true, lastName: true, middleName: true },
        })
      : [];
  const candidateNameById = new Map(candidateStudents.map((s) => [s.id, fullName(s) || "Noma’lum"]));

  const configRows: IntegrationSummary[] = configs.map((config) => {
    const settings = readSettings(config.settings);
    return {
      id: config.id,
      provider: config.provider as ProviderKey,
      name: config.name,
      isEnabled: config.isEnabled,
      baseUrl: config.baseUrl,
      credentialHint: config.credentialHint,
      endpointPath: asString(settings.endpointPath),
      delimiter: asString(settings.delimiter) ?? ",",
      hasHeader: asBool(settings.hasHeader, true),
      defaultAcademicYear: asString(settings.defaultAcademicYear) ?? ACADEMIC_YEAR_DEFAULT,
      hasCredentials: Boolean(config.credentialsEncrypted),
      lastSyncAt: formatUzDateTime(config.lastSyncAt),
      lastSyncStatus: config.lastSyncStatus,
      lastSyncMessage: config.lastSyncMessage,
    };
  });

  const syncLogRows: SyncLogRow[] = logs.map((log) => ({
    id: log.id,
    source: log.source,
    providerLabel: PROVIDER_META[log.provider]?.label ?? log.provider,
    status: log.status,
    dryRun: log.dryRun,
    startedAtLabel: formatUzDateTime(log.startedAt),
    finishedAtLabel: log.finishedAt ? formatUzDateTime(log.finishedAt) : null,
    classesCreated: log.classesCreated,
    classesUpdated: log.classesUpdated,
    studentsCreated: log.studentsCreated,
    studentsUpdated: log.studentsUpdated,
    enrollmentsCreated: log.enrollmentsCreated,
    enrollmentsUpdated: log.enrollmentsUpdated,
    recordsSkipped: log.recordsSkipped,
    summary: log.summary,
    triggeredByName: log.triggeredBy ? fullName(log.triggeredBy) || null : null,
    errors: asErrorList(log.errors),
  }));

  const reviewRows: ReviewRow[] = reviews.map((review) => {
    const payload = readSettings(review.payload);
    const candidates = Array.isArray(review.candidates)
      ? review.candidates
          .map((id) => (typeof id === "string" ? candidateNameById.get(id) : undefined))
          .filter((name): name is string => Boolean(name))
      : [];
    return {
      id: review.id,
      entityType: review.entityType,
      externalId: review.externalId,
      reason: review.reason,
      reasonLabel: REASON_LABEL[review.reason] ?? review.reason,
      payload: {
        firstName: asString(payload.firstName),
        lastName: asString(payload.lastName),
        middleName: asString(payload.middleName),
        className: asString(payload.className),
        birthDate: asString(payload.birthDate),
      },
      candidateNames: candidates,
      createdAtLabel: formatUzDateTime(review.createdAt),
    };
  });

  const studentOptions: StudentOption[] = students.map((student) => ({
    id: student.id,
    label: fullName(student) || "Noma’lum",
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Integratsiya"
        description="eMaktab ma’lumotlarini import qilish. Takroriy import dublikat yaratmaydi va hech qachon mavjud ma’lumotni o‘chirmaydi."
      />

      <IntegrationClient
        configs={configRows}
        syncLogs={syncLogRows}
        reviews={reviewRows}
        students={studentOptions}
        canManage={can(user, PERMISSION.INTEGRATION_MANAGE)}
      />
    </div>
  );
}
