import {
  EnrollmentStatus,
  IntegrationProvider,
  Prisma,
  ReviewStatus,
  SyncStatus,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { ACADEMIC_YEAR_DEFAULT } from "@/lib/constants";
import { dateOnly, formatDateOnly } from "@/lib/date";
import { recordAudit, AUDIT_ACTIONS } from "@/lib/audit";
import type { ImportDataset, SourceClass, SourceStudent } from "@/lib/integration/types";

/**
 * ---------------------------------------------------------------------------
 * Idempotent import engine
 * ---------------------------------------------------------------------------
 * The engine takes a canonical {@link ImportDataset} (produced by any
 * connector) and reconciles it with the database. Invariants:
 *
 *   1. Running the same import twice never creates duplicates. Identity is
 *      established through `ExternalRef` (stable external id -> internal id)
 *      and, as a fallback, through natural keys (class name + academic year,
 *      student name + birth date).
 *   2. Nothing is ever deleted. A student who disappears from a source export
 *      simply keeps their last known state; a report can flag them.
 *   3. Ambiguity is never resolved silently. When a row could match more than
 *      one existing record it is written to `ImportReviewItem` for a human
 *      decision and skipped for this run.
 *   4. `dryRun` performs the identical reconciliation but writes nothing, so an
 *      operator can preview the outcome first.
 * ---------------------------------------------------------------------------
 */

export const REF_ENTITY = {
  CLASS: "CLASS",
  STUDENT: "STUDENT",
} as const;

export type ImportReviewReason =
  | "AMBIGUOUS_STUDENT_NAME"
  | "BIRTHDATE_MISMATCH"
  | "CLASS_NOT_FOUND"
  | "DUPLICATE_IN_SOURCE";

export type ImportCounts = {
  classesCreated: number;
  classesUpdated: number;
  studentsCreated: number;
  studentsUpdated: number;
  enrollmentsCreated: number;
  enrollmentsUpdated: number;
  recordsSkipped: number;
};

export type ImportOutcome = {
  syncLogId: string;
  status: SyncStatus;
  counts: ImportCounts;
  warnings: string[];
  errors: string[];
  reviewItems: number;
  dryRun: boolean;
  summary: string;
};

export type RunImportOptions = {
  schoolId: string;
  provider: IntegrationProvider;
  source: string;
  dataset: ImportDataset;
  integrationConfigId?: string | null;
  triggeredById?: string | null;
  dryRun?: boolean;
};

type Db = typeof prisma;

const EMPTY_COUNTS: ImportCounts = {
  classesCreated: 0,
  classesUpdated: 0,
  studentsCreated: 0,
  studentsUpdated: 0,
  enrollmentsCreated: 0,
  enrollmentsUpdated: 0,
  recordsSkipped: 0,
};

/** Loose class-name key: ignores case, spaces, dots and dashes ("5 A" == "5-A"). */
function classNameKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/['‘’ʻ`]/g, "")
    .replace(/[\s._\-–—/]+/g, "");
}

function parseIsoDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!m) return null;
  return dateOnly(Number(m[1]), Number(m[2]), Number(m[3]));
}

function resolveAcademicYear(...candidates: (string | null | undefined)[]): string {
  for (const candidate of candidates) {
    if (typeof candidate === "string" && /^\d{4}-\d{4}$/.test(candidate.trim())) {
      return candidate.trim();
    }
  }
  return ACADEMIC_YEAR_DEFAULT;
}

/** Namespaced ExternalRef source so two schools importing the same file never collide. */
export function externalRefSource(schoolId: string, source: string): string {
  return `${schoolId}|${source}`;
}

/** Internal alias kept for readability at call sites. */
const refSource = externalRefSource;

/**
 * Keep the external -> internal mapping consistent in both directions:
 *  - a known external id must point at this internal id,
 *  - an internal record must not accumulate several external ids.
 */
async function linkExternalRef(
  db: Db,
  input: {
    schoolId: string;
    source: string;
    entityType: string;
    internalId: string;
    externalId: string | null | undefined;
    checksum?: string | null;
  },
): Promise<void> {
  const externalId = input.externalId?.trim();
  if (!externalId) return;

  const byExternal = await db.externalRef.findUnique({
    where: {
      source_entityType_externalId: {
        source: input.source,
        entityType: input.entityType,
        externalId,
      },
    },
  });
  if (byExternal) {
    await db.externalRef.update({
      where: { id: byExternal.id },
      data: {
        internalId: input.internalId,
        lastSeenAt: new Date(),
        ...(input.checksum ? { checksum: input.checksum } : {}),
      },
    });
    return;
  }

  const byInternal = await db.externalRef.findUnique({
    where: {
      source_entityType_internalId: {
        source: input.source,
        entityType: input.entityType,
        internalId: input.internalId,
      },
    },
  });
  if (byInternal) {
    await db.externalRef.update({
      where: { id: byInternal.id },
      data: { externalId, lastSeenAt: new Date(), ...(input.checksum ? { checksum: input.checksum } : {}) },
    });
    return;
  }

  await db.externalRef.create({
    data: {
      schoolId: input.schoolId,
      source: input.source,
      entityType: input.entityType,
      internalId: input.internalId,
      externalId,
      checksum: input.checksum ?? null,
    },
  });
}

async function ensureClass(
  schoolId: string,
  source: string,
  academicYear: string,
  spec: SourceClass,
  counts: ImportCounts,
  dryRun: boolean,
): Promise<string | null> {
  const name = spec.name.trim();
  if (!name) return null;

  const resolvedYear = resolveAcademicYear(spec.academicYear, academicYear);
  const rf = refSource(schoolId, source);

  // 1. Known external class id.
  if (spec.externalId) {
    const ref = await prisma.externalRef.findUnique({
      where: {
        source_entityType_externalId: { source: rf, entityType: REF_ENTITY.CLASS, externalId: spec.externalId },
      },
      select: { internalId: true },
    });
    if (ref) {
      const existing = await prisma.schoolClass.findUnique({ where: { id: ref.internalId }, select: { id: true } });
      if (existing) {
        if (!dryRun) {
          await prisma.schoolClass.update({
            where: { id: existing.id },
            data: {
              ...(spec.gradeYear ? { gradeYear: spec.gradeYear } : {}),
              ...(spec.letter ? { letter: spec.letter } : {}),
              academicYear: resolvedYear,
            },
          });
          await linkExternalRef(prisma, {
            schoolId,
            source: rf,
            entityType: REF_ENTITY.CLASS,
            internalId: existing.id,
            externalId: spec.externalId,
          });
        }
        counts.classesUpdated += 1;
        return existing.id;
      }
    }
  }

  // 2. Natural key: same school + name + academic year.
  const byNatural = await prisma.schoolClass.findUnique({
    where: { schoolId_name_academicYear: { schoolId, name, academicYear: resolvedYear } },
    select: { id: true },
  });
  if (byNatural) {
    if (!dryRun) {
      await prisma.schoolClass.update({
        where: { id: byNatural.id },
        data: {
          ...(spec.gradeYear ? { gradeYear: spec.gradeYear } : {}),
          ...(spec.letter ? { letter: spec.letter } : {}),
        },
      });
      await linkExternalRef(prisma, {
        schoolId,
        source: rf,
        entityType: REF_ENTITY.CLASS,
        internalId: byNatural.id,
        externalId: spec.externalId,
      });
    }
    counts.classesUpdated += 1;
    return byNatural.id;
  }

  // 3. Create.
  if (dryRun) {
    counts.classesCreated += 1;
    return `dryrun-class:${name}:${resolvedYear}`;
  }
  const created = await prisma.schoolClass.create({
    data: {
      schoolId,
      name,
      gradeYear: spec.gradeYear ?? 1,
      letter: spec.letter ?? null,
      academicYear: resolvedYear,
    },
    select: { id: true },
  });
  await linkExternalRef(prisma, {
    schoolId,
    source: rf,
    entityType: REF_ENTITY.CLASS,
    internalId: created.id,
    externalId: spec.externalId,
  });
  counts.classesCreated += 1;
  return created.id;
}

type StudentResolution =
  | { kind: "resolved"; studentId: string }
  | { kind: "review"; reason: ImportReviewReason; candidates: string[] }
  | { kind: "unresolved" };

async function resolveStudent(
  schoolId: string,
  source: string,
  spec: SourceStudent,
  counts: ImportCounts,
  dryRun: boolean,
): Promise<StudentResolution> {
  const rf = refSource(schoolId, source);
  const birthDate = parseIsoDate(spec.birthDate);

  // 1. Known external student id.
  if (spec.externalId) {
    const ref = await prisma.externalRef.findUnique({
      where: {
        source_entityType_externalId: { source: rf, entityType: REF_ENTITY.STUDENT, externalId: spec.externalId },
      },
      select: { internalId: true },
    });
    if (ref) {
      const existing = await prisma.student.findUnique({ where: { id: ref.internalId }, select: { id: true } });
      if (existing) return { kind: "resolved", studentId: existing.id };
    }

    // 2. Student already carries this externalId (e.g. created manually).
    const byExternalColumn = await prisma.student.findUnique({
      where: { schoolId_externalId: { schoolId, externalId: spec.externalId } },
      select: { id: true },
    });
    if (byExternalColumn) {
      if (!dryRun) {
        await linkExternalRef(prisma, {
          schoolId,
          source: rf,
          entityType: REF_ENTITY.STUDENT,
          internalId: byExternalColumn.id,
          externalId: spec.externalId,
        });
      }
      counts.studentsUpdated += 1;
      return { kind: "resolved", studentId: byExternalColumn.id };
    }
  }

  // 3. Natural match by name (+ birth date). Never link on name alone when the
  //    birth date disagrees — that is exactly how duplicates get created.
  const nameCandidates = await prisma.student.findMany({
    where: {
      schoolId,
      deletedAt: null,
      lastName: { equals: spec.lastName.trim(), mode: "insensitive" },
      firstName: { equals: spec.firstName.trim(), mode: "insensitive" },
    },
    select: { id: true, birthDate: true },
  });

  if (nameCandidates.length > 0) {
    if (birthDate) {
      const exact = nameCandidates.filter(
        (c) => c.birthDate && formatDateOnly(c.birthDate) === formatDateOnly(birthDate),
      );
      if (exact.length === 1) {
        counts.studentsUpdated += 1;
        return { kind: "resolved", studentId: exact[0].id };
      }
      if (exact.length > 1) {
        return { kind: "review", reason: "AMBIGUOUS_STUDENT_NAME", candidates: exact.map((c) => c.id) };
      }
      // Name matches but birth date does not: flag rather than silently create.
      return { kind: "review", reason: "BIRTHDATE_MISMATCH", candidates: nameCandidates.map((c) => c.id) };
    }
    if (nameCandidates.length === 1) {
      counts.studentsUpdated += 1;
      return { kind: "resolved", studentId: nameCandidates[0].id };
    }
    return {
      kind: "review",
      reason: "AMBIGUOUS_STUDENT_NAME",
      candidates: nameCandidates.map((c) => c.id),
    };
  }

  return { kind: "unresolved" };
}

async function createStudent(
  schoolId: string,
  source: string,
  spec: SourceStudent,
  counts: ImportCounts,
  dryRun: boolean,
): Promise<string> {
  if (dryRun) {
    counts.studentsCreated += 1;
    return `dryrun-student:${spec.firstName}:${spec.lastName}`;
  }
  const created = await prisma.student.create({
    data: {
      schoolId,
      firstName: spec.firstName.trim(),
      lastName: spec.lastName.trim(),
      middleName: spec.middleName?.trim() || null,
      externalId: spec.externalId?.trim() || null,
      birthDate: parseIsoDate(spec.birthDate),
      gender: spec.gender ?? null,
      guardianName: spec.guardianName?.trim() || null,
      guardianPhone: spec.guardianPhone?.trim() || null,
    },
    select: { id: true },
  });
  await linkExternalRef(prisma, {
    schoolId,
    source: refSource(schoolId, source),
    entityType: REF_ENTITY.STUDENT,
    internalId: created.id,
    externalId: spec.externalId,
  });
  counts.studentsCreated += 1;
  return created.id;
}

async function ensureEnrollment(
  schoolId: string,
  studentId: string,
  classId: string,
  academicYear: string,
  counts: ImportCounts,
  dryRun: boolean,
): Promise<void> {
  const existing = await prisma.enrollment.findUnique({
    where: { studentId_classId_academicYear: { studentId, classId, academicYear } },
    select: { id: true, isActive: true, status: true },
  });
  if (existing) {
    if (!existing.isActive || existing.status !== EnrollmentStatus.ACTIVE) {
      if (!dryRun) {
        await prisma.enrollment.update({
          where: { id: existing.id },
          data: { isActive: true, status: EnrollmentStatus.ACTIVE, endDate: null },
        });
      }
      counts.enrollmentsUpdated += 1;
    }
    return;
  }
  if (dryRun) {
    counts.enrollmentsCreated += 1;
    return;
  }
  await prisma.enrollment.create({
    data: { schoolId, studentId, classId, academicYear, status: EnrollmentStatus.ACTIVE },
  });
  counts.enrollmentsCreated += 1;
}

async function writeReviewItem(
  input: {
    schoolId: string;
    syncLogId: string;
    entityType: string;
    externalId: string | null;
    reason: ImportReviewReason;
    payload: Prisma.InputJsonValue;
    candidates: string[];
  },
  dryRun: boolean,
): Promise<void> {
  if (dryRun) return;
  await prisma.importReviewItem.create({
    data: {
      schoolId: input.schoolId,
      syncLogId: input.syncLogId,
      entityType: input.entityType,
      externalId: input.externalId ?? null,
      reason: input.reason,
      payload: input.payload,
      candidates: input.candidates,
      status: ReviewStatus.PENDING,
    },
  });
}

export async function runImport(options: RunImportOptions): Promise<ImportOutcome> {
  const dryRun = options.dryRun ?? false;
  const dataset = options.dataset;
  const counts: ImportCounts = { ...EMPTY_COUNTS };
  const errors: string[] = [];
  const warnings = [...dataset.warnings];
  let reviewItems = 0;

  const syncLog = await prisma.syncLog.create({
    data: {
      schoolId: options.schoolId,
      integrationConfigId: options.integrationConfigId ?? null,
      provider: options.provider,
      source: options.source,
      status: SyncStatus.RUNNING,
      dryRun,
      triggeredById: options.triggeredById ?? null,
      summary: dryRun ? "Sinov (dry-run) boshlandi" : "Import boshlandi",
    },
    select: { id: true },
  });

  try {
    // 1. Classes -------------------------------------------------------------
    // Seed the lookup map with classes that already exist so imports reconcile
    // against the database even when the file only lists students.
    const classIdByKey = new Map<string, string>();
    /** Fallback: class name regardless of academic year. */
    const classIdByNameOnly = new Map<string, string>();
    const existingClasses = await prisma.schoolClass.findMany({
      where: { schoolId: options.schoolId, deletedAt: null },
      select: { id: true, name: true, academicYear: true, externalId: true },
    });
    for (const cls of existingClasses) {
      classIdByKey.set(`name:${classNameKey(cls.name)}|${cls.academicYear}`, cls.id);
      if (!classIdByNameOnly.has(classNameKey(cls.name))) {
        classIdByNameOnly.set(classNameKey(cls.name), cls.id);
      }
      if (cls.externalId) classIdByKey.set(`ext:${cls.externalId.toLowerCase()}`, cls.id);
    }

    for (const spec of dataset.classes) {
      const resolvedYear = resolveAcademicYear(spec.academicYear);
      const id = await ensureClass(options.schoolId, options.source, resolvedYear, spec, counts, dryRun);
      if (id) {
        const keys = [
          spec.externalId ? `ext:${spec.externalId.toLowerCase()}` : null,
          `name:${classNameKey(spec.name)}|${resolvedYear}`,
        ].filter(Boolean) as string[];
        for (const key of keys) classIdByKey.set(key, id);
        if (!classIdByNameOnly.has(classNameKey(spec.name))) {
          classIdByNameOnly.set(classNameKey(spec.name), id);
        }
      }
    }

    // 2. Students + enrollment ----------------------------------------------
    for (const spec of dataset.students) {
      const className = (spec.className ?? "").trim();
      const classExternalId = spec.classExternalId?.trim() ?? null;

      // Resolve the target class from the dataset itself first.
      let classId: string | null = null;
      if (spec.classExternalId) {
        classId = classIdByKey.get(`ext:${spec.classExternalId.trim().toLowerCase()}`) ?? null;
      }
      if (!classId && className) {
        const year = resolveAcademicYear(spec.academicYear);
        classId = classIdByKey.get(`name:${classNameKey(className)}|${year}`) ?? null;
      }
      if (!classId && classExternalId) {
        classId = classIdByKey.get(`ext:${classExternalId.toLowerCase()}`) ?? null;
      }

      if (!classId) {
        // Fall back to an existing class row in the database (name only).
        const lookupName = className || classExternalId || "";
        if (lookupName) {
          classId = classIdByNameOnly.get(classNameKey(lookupName)) ?? null;
        }
      }

      if (!classId) {
        counts.recordsSkipped += 1;
        warnings.push(
          `O‘quvchi ${spec.lastName} ${spec.firstName}: sinf aniqlanmadi (${className || classExternalId || "ko‘rsatilmagan"}).`,
        );
        await writeReviewItem(
          {
            schoolId: options.schoolId,
            syncLogId: syncLog.id,
            entityType: REF_ENTITY.STUDENT,
            externalId: spec.externalId ?? null,
            reason: "CLASS_NOT_FOUND",
            payload: spec as unknown as Prisma.InputJsonValue,
            candidates: [],
          },
          dryRun,
        );
        reviewItems += 1;
        continue;
      }

      const resolution = await resolveStudent(options.schoolId, options.source, spec, counts, dryRun);
      if (resolution.kind === "review") {
        counts.recordsSkipped += 1;
        warnings.push(
          `O‘quvchi ${spec.lastName} ${spec.firstName}: bir nechta mos yozuv topildi — qo‘lda tekshirish kerak.`,
        );
        await writeReviewItem(
          {
            schoolId: options.schoolId,
            syncLogId: syncLog.id,
            entityType: REF_ENTITY.STUDENT,
            externalId: spec.externalId ?? null,
            reason: resolution.reason,
            payload: spec as unknown as Prisma.InputJsonValue,
            candidates: resolution.candidates,
          },
          dryRun,
        );
        reviewItems += 1;
        continue;
      }

      const studentId =
        resolution.kind === "resolved"
          ? resolution.studentId
          : await createStudent(options.schoolId, options.source, spec, counts, dryRun);

      // Always (re)link the external ref for known ids.
      if (spec.externalId && !dryRun && resolution.kind === "resolved") {
        await linkExternalRef(prisma, {
          schoolId: options.schoolId,
          source: refSource(options.schoolId, options.source),
          entityType: REF_ENTITY.STUDENT,
          internalId: studentId,
          externalId: spec.externalId,
        });
      }

      const academicYear = resolveAcademicYear(spec.academicYear);
      await ensureEnrollment(options.schoolId, studentId, classId, academicYear, counts, dryRun);
    }

    const status =
      counts.recordsSkipped > 0 || warnings.length > 0 || reviewItems > 0
        ? SyncStatus.PARTIAL
        : SyncStatus.SUCCESS;

    const summary = buildSummary(counts, reviewItems, warnings.length, dryRun);

    if (!dryRun) {
      await prisma.syncLog.update({
        where: { id: syncLog.id },
        data: {
          status,
          finishedAt: new Date(),
          ...counts,
          errors: warnings.length ? (warnings as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
          summary,
        },
      });

      if (options.integrationConfigId) {
        await prisma.integrationConfig
          .update({
            where: { id: options.integrationConfigId },
            data: { lastSyncAt: new Date(), lastSyncStatus: status, lastSyncMessage: summary },
          })
          .catch(() => undefined);
      }

      await recordAudit({
        actorUserId: options.triggeredById ?? null,
        schoolId: options.schoolId,
        action: AUDIT_ACTIONS.INTEGRATION_SYNC,
        entityType: "SyncLog",
        entityId: syncLog.id,
        summary: `Import (${options.provider}): ${summary}`,
        metadata: { ...counts, reviewItems, source: options.source },
      });
    } else {
      await prisma.syncLog.update({
        where: { id: syncLog.id },
        data: {
          status,
          finishedAt: new Date(),
          ...counts,
          errors: warnings.length ? (warnings as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
          summary,
        },
      });
    }

    return { syncLogId: syncLog.id, status, counts, warnings, errors, reviewItems, dryRun, summary };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Noma’lum xatolik";
    await prisma.syncLog
      .update({
        where: { id: syncLog.id },
        data: {
          status: SyncStatus.FAILED,
          finishedAt: new Date(),
          ...counts,
          errors: [message],
          summary: `Import muvaffaqiyatsiz: ${message}`,
        },
      })
      .catch(() => undefined);
    throw error;
  }
}

function buildSummary(
  counts: ImportCounts,
  reviewItems: number,
  warningCount: number,
  dryRun: boolean,
): string {
  const parts = [
    `${counts.classesCreated} sinf qo‘shildi`,
    `${counts.classesUpdated} sinf yangilandi`,
    `${counts.studentsCreated} o‘quvchi qo‘shildi`,
    `${counts.studentsUpdated} o‘quvchi yangilandi`,
    `${counts.enrollmentsCreated} biriktirish qo‘shildi`,
  ];
  if (counts.recordsSkipped > 0) parts.push(`${counts.recordsSkipped} qator o‘tkazib yuborildi`);
  if (reviewItems > 0) parts.push(`${reviewItems} ta holat qo‘lda tekshirishga qo‘yildi`);
  if (warningCount > 0) parts.push(`${warningCount} ta ogohlantirish`);
  const prefix = dryRun ? "Sinov natijasi: " : "";
  return prefix + parts.join(", ") + ".";
}
