"use server";

import { revalidatePath } from "next/cache";
import { IntegrationProvider, Prisma, ReviewStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { apiIntegrationSchema, csvIntegrationSchema, reviewResolveSchema } from "@/lib/validation/schemas";
import { requireSchoolPermission } from "@/lib/auth/guards";
import { decryptSecret, encryptSecret, maskHint } from "@/lib/crypto";
import { getConnector, requireConnector } from "@/lib/integration/registry";
import { externalRefSource, REF_ENTITY, runImport, type ImportOutcome } from "@/lib/integration/engine";
import { ConnectorError, type ConnectorContext, type ConnectorTestResult, type SourceStudent } from "@/lib/integration/types";
import { recordAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { fail, ok, Errors, type ActionResult } from "@/lib/errors";
import { requestMeta } from "@/lib/request-meta";
import { parseDateOnly } from "@/lib/date";
import { PERMISSION } from "@/lib/constants";

/**
 * ---------------------------------------------------------------------------
 * Integration server actions
 * ---------------------------------------------------------------------------
 * What this module deliberately does NOT do:
 *   * it never stores a third-party password in plaintext — credentials go
 *     through AES-256-GCM (`encryptSecret`) and only a masked hint is kept for
 *     display;
 *   * it never scrapes the eMaktab web UI, bypasses authentication/CAPTCHA/MFA
 *     or fabricates a successful sync. A sync either really ran (and a
 *     `SyncLog` with real counts was written) or it failed with an error.
 * ---------------------------------------------------------------------------
 */

type CredentialPayload = { login: string; secret: string };

function configSettings(value: Prisma.JsonValue | null): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

async function loadConfig(schoolId: string, id: string) {
  const config = await prisma.integrationConfig.findFirst({ where: { id, schoolId } });
  if (!config) throw Errors.notFound("Integratsiya sozlamasi topilmadi.");
  return config;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export async function saveCsvIntegrationAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requireSchoolPermission(PERMISSION.INTEGRATION_MANAGE);
    const input = csvIntegrationSchema.parse(raw);
    const { ip, userAgent } = await requestMeta();

    const data = {
      schoolId: actor.schoolId,
      provider: IntegrationProvider.CSV_EXCEL,
      name: input.name,
      isEnabled: input.isEnabled,
      settings: input.settings as unknown as Prisma.InputJsonValue,
    };

    let id: string;
    if (input.id) {
      const existing = await loadConfig(actor.schoolId, input.id);
      const updated = await prisma.integrationConfig.update({
        where: { id: existing.id },
        data,
        select: { id: true },
      });
      id = updated.id;
    } else {
      const created = await prisma.integrationConfig.create({ data, select: { id: true } });
      id = created.id;
    }

    await recordAudit({
      actorUserId: actor.id,
      schoolId: actor.schoolId,
      action: AUDIT_ACTIONS.INTEGRATION_CONFIGURED,
      entityType: "IntegrationConfig",
      entityId: id,
      summary: `CSV/Excel integratsiyasi sozlandi: ${input.name}.`,
      ip,
      userAgent,
    });
    revalidatePath("/dashboard/integration");
    return ok({ id });
  } catch (error) {
    return fail(error);
  }
}

export async function saveApiIntegrationAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requireSchoolPermission(PERMISSION.INTEGRATION_MANAGE);
    const input = apiIntegrationSchema.parse(raw);
    const { ip, userAgent } = await requestMeta();

    // A secret is required the first time; on update an empty value keeps the
    // previously stored one.
    if (!input.id && !input.secret) {
      return fail(new Error("Maxfiy kalit yoki tokenni kiriting."));
    }

    let credentialsEncrypted: string | undefined;
    if (input.secret) {
      credentialsEncrypted = encryptSecret({ login: input.login, secret: input.secret } satisfies CredentialPayload);
    } else if (input.id) {
      const existing = await loadConfig(actor.schoolId, input.id);
      const prior = decryptSecret<CredentialPayload>(existing.credentialsEncrypted);
      credentialsEncrypted = prior ? encryptSecret({ login: input.login, secret: prior.secret }) : undefined;
    }

    const settings = {
      baseUrl: input.baseUrl,
      ...(input.endpointPath ? { endpointPath: input.endpointPath } : {}),
    } as unknown as Prisma.InputJsonValue;

    const baseData = {
      schoolId: actor.schoolId,
      provider: IntegrationProvider.EMAKTAB_API,
      name: input.name,
      isEnabled: input.isEnabled,
      baseUrl: input.baseUrl,
      credentialHint: maskHint(input.login),
      settings,
      ...(credentialsEncrypted ? { credentialsEncrypted } : {}),
    };

    let id: string;
    if (input.id) {
      const existing = await loadConfig(actor.schoolId, input.id);
      const updated = await prisma.integrationConfig.update({
        where: { id: existing.id },
        data: baseData,
        select: { id: true },
      });
      id = updated.id;
    } else {
      const created = await prisma.integrationConfig.create({ data: baseData, select: { id: true } });
      id = created.id;
    }

    await recordAudit({
      actorUserId: actor.id,
      schoolId: actor.schoolId,
      action: AUDIT_ACTIONS.INTEGRATION_CONFIGURED,
      entityType: "IntegrationConfig",
      entityId: id,
      summary: `eMaktab API integratsiyasi sozlandi: ${input.name}.`,
      ip,
      userAgent,
    });
    revalidatePath("/dashboard/integration");
    return ok({ id });
  } catch (error) {
    return fail(error);
  }
}

export async function setIntegrationEnabledAction(input: {
  id: string;
  isEnabled: boolean;
}): Promise<ActionResult> {
  try {
    const actor = await requireSchoolPermission(PERMISSION.INTEGRATION_MANAGE);
    const existing = await loadConfig(actor.schoolId, input.id);
    await prisma.integrationConfig.update({
      where: { id: existing.id },
      data: { isEnabled: input.isEnabled },
    });
    revalidatePath("/dashboard/integration");
    return ok();
  } catch (error) {
    return fail(error);
  }
}

export async function deleteIntegrationAction(input: { id: string }): Promise<ActionResult> {
  try {
    const actor = await requireSchoolPermission(PERMISSION.INTEGRATION_MANAGE);
    const existing = await loadConfig(actor.schoolId, input.id);
    await prisma.integrationConfig.delete({ where: { id: existing.id } });
    await recordAudit({
      actorUserId: actor.id,
      schoolId: actor.schoolId,
      action: AUDIT_ACTIONS.INTEGRATION_CONFIGURED,
      entityType: "IntegrationConfig",
      entityId: existing.id,
      summary: `Integratsiya sozlamasi o‘chirildi: ${existing.name}.`,
    });
    revalidatePath("/dashboard/integration");
    return ok();
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------------------
// Connection test
// ---------------------------------------------------------------------------

export async function testIntegrationAction(formData: FormData): Promise<ActionResult<ConnectorTestResult>> {
  try {
    const actor = await requireSchoolPermission(PERMISSION.INTEGRATION_MANAGE);
    const configId = String(formData.get("configId") ?? "");
    if (!configId) return fail(new Error("Integratsiya tanlanmagan."));
    const config = await loadConfig(actor.schoolId, configId);

    const connector = getConnector(config.provider);
    if (!connector) return fail(new Error("Konnektsiya topilmadi."));

    const ctx = await buildContext(config, formData.get("file"));
    const result = await connector.testConnection(ctx);
    return ok(result);
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------------------
// Import runs
// ---------------------------------------------------------------------------

export async function runFileImportAction(formData: FormData): Promise<ActionResult<ImportOutcome>> {
  try {
    const actor = await requireSchoolPermission(PERMISSION.INTEGRATION_MANAGE);
    const configId = String(formData.get("configId") ?? "");
    const dryRun = String(formData.get("dryRun") ?? "false") === "true";
    if (!configId) return fail(new Error("Integratsiya tanlanmagan."));
    const config = await loadConfig(actor.schoolId, configId);

    const connector = requireConnector(config.provider);
    if (!connector.requiresFile) {
      return fail(new Error("Bu integratsiya fayl talab qilmaydi."));
    }

    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return fail(new Error("CSV yoki Excel faylni tanlang."));
    }

    const ctx = await buildContext(config, file);
    const dataset = await connector.fetchDataset(ctx);

    const outcome = await runImport({
      schoolId: actor.schoolId,
      provider: config.provider,
      source: dataset.source,
      dataset,
      integrationConfigId: config.id,
      triggeredById: actor.id,
      dryRun,
    });

    revalidatePath("/dashboard/integration");
    revalidatePath("/dashboard/students");
    theRevalidate();
    return ok(outcome);
  } catch (error) {
    if (error instanceof ConnectorError) {
      return { ok: false, error: error.message, code: "CONNECTOR", fields: { _details: error.details.join("\n") } };
    }
    return fail(error);
  }
}

export async function runApiSyncAction(input: { id: string; dryRun?: boolean }): Promise<ActionResult<ImportOutcome>> {
  try {
    const actor = await requireSchoolPermission(PERMISSION.INTEGRATION_MANAGE);
    const config = await loadConfig(actor.schoolId, input.id);
    const connector = requireConnector(config.provider);
    if (connector.requiresFile) {
      return fail(new Error("Bu integratsiya fayl orqali ishlaydi."));
    }

    const ctx = await buildContext(config, null);
    const dataset = await connector.fetchDataset(ctx);

    const outcome = await runImport({
      schoolId: actor.schoolId,
      provider: config.provider,
      source: dataset.source,
      dataset,
      integrationConfigId: config.id,
      triggeredById: actor.id,
      dryRun: input.dryRun ?? false,
    });

    revalidatePath("/dashboard/integration");
    revalidatePath("/dashboard/students");
    theRevalidate();
    return ok(outcome);
  } catch (error) {
    if (error instanceof ConnectorError) {
      return { ok: false, error: error.message, code: "CONNECTOR", fields: { _details: error.details.join("\n") } };
    }
    return fail(error);
  }
}

function theRevalidate() {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/classes");
}

async function buildContext(
  config: {
    settings: Prisma.JsonValue | null;
    credentialsEncrypted: string | null;
    baseUrl: string | null;
  },
  file: FormDataEntryValue | null,
): Promise<ConnectorContext> {
  const settings = configSettings(config.settings);
  if (config.baseUrl && !settings.baseUrl) settings.baseUrl = config.baseUrl;

  let credentials: Record<string, string> | null = null;
  const decrypted = decryptSecret<CredentialPayload>(config.credentialsEncrypted);
  if (decrypted) credentials = { login: decrypted.login, secret: decrypted.secret };

  const ctx: ConnectorContext = {
    schoolId: "", // not needed by the current connectors; kept for the interface
    settings,
    credentials,
  };

  if (file instanceof File && file.size > 0) {
    ctx.file = { buffer: Buffer.from(await file.arrayBuffer()), filename: file.name };
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// Review resolution
// ---------------------------------------------------------------------------

export async function resolveReviewItemAction(raw: unknown): Promise<ActionResult> {
  try {
    const actor = await requireSchoolPermission(PERMISSION.INTEGRATION_MANAGE);
    const input = reviewResolveSchema.parse(raw);
    const { ip, userAgent } = await requestMeta();

    const item = await prisma.importReviewItem.findFirst({
      where: { id: input.reviewId, schoolId: actor.schoolId, status: ReviewStatus.PENDING },
      include: { syncLog: { select: { source: true } } },
    });
    if (!item) return fail(new Error("Tekshirish yozuvi topilmadi yoki allaqachon hal qilingan."));

    const payload = item.payload as unknown as SourceStudent;
    const source = item.syncLog?.source ?? "manual";

    if (input.action === "IGNORE") {
      await prisma.importReviewItem.update({
        where: { id: item.id },
        data: { status: ReviewStatus.IGNORED, resolvedById: actor.id, resolvedAt: new Date() },
      });
    } else if (input.action === "LINK_EXISTING") {
      if (!input.studentId) return fail(new Error("Bog‘lash uchun o‘quvchini tanlang."));
      const student = await prisma.student.findFirst({
        where: { id: input.studentId, schoolId: actor.schoolId },
        select: { id: true },
      });
      if (!student) return fail(new Error("Tanlangan o‘quvchi topilmadi."));

      if (item.externalId) {
        await linkRef(actor.schoolId, source, student.id, item.externalId);
      }
      await prisma.importReviewItem.update({
        where: { id: item.id },
        data: { status: ReviewStatus.RESOLVED_LINKED, resolvedById: actor.id, resolvedAt: new Date() },
      });
    } else {
      // CREATE_NEW
      const created = await prisma.student.create({
        data: {
          schoolId: actor.schoolId,
          firstName: payload.firstName?.trim() || "Noma’lum",
          lastName: payload.lastName?.trim() || "Noma’lum",
          middleName: payload.middleName?.trim() || null,
          externalId: payload.externalId?.trim() || null,
          birthDate: parseDateOnly(payload.birthDate) ?? null,
          gender: payload.gender ?? null,
          guardianName: payload.guardianName?.trim() || null,
          guardianPhone: payload.guardianPhone?.trim() || null,
        },
        select: { id: true },
      });

      // Try to enrol into the class if it can be resolved now.
      const className = payload.className?.trim();
      if (className) {
        const schoolClass = await prisma.schoolClass.findFirst({
          where: { schoolId: actor.schoolId, name: className, deletedAt: null },
          select: { id: true, academicYear: true },
        });
        if (schoolClass) {
          await prisma.enrollment.upsert({
            where: {
              studentId_classId_academicYear: {
                studentId: created.id,
                classId: schoolClass.id,
                academicYear: schoolClass.academicYear,
              },
            },
            update: { isActive: true, status: "ACTIVE", endDate: null },
            create: {
              schoolId: actor.schoolId,
              studentId: created.id,
              classId: schoolClass.id,
              academicYear: schoolClass.academicYear,
              status: "ACTIVE",
              isActive: true,
            },
          });
        }
      }

      if (payload.externalId) await linkRef(actor.schoolId, source, created.id, payload.externalId);

      await prisma.importReviewItem.update({
        where: { id: item.id },
        data: { status: ReviewStatus.RESOLVED_CREATED, resolvedById: actor.id, resolvedAt: new Date() },
      });
    }

    await recordAudit({
      actorUserId: actor.id,
      schoolId: actor.schoolId,
      action: AUDIT_ACTIONS.INTEGRATION_REVIEW_RESOLVED,
      entityType: "ImportReviewItem",
      entityId: item.id,
      summary: `Import tekshiruv yozuvi hal qilindi: ${input.action}.`,
      ip,
      userAgent,
    });

    revalidatePath("/dashboard/integration");
    revalidatePath("/dashboard/students");
    return ok();
  } catch (error) {
    return fail(error);
  }
}

async function linkRef(schoolId: string, source: string, internalId: string, externalId: string): Promise<void> {
  const namespaced = externalRefSource(schoolId, source);
  const existing = await prisma.externalRef.findUnique({
    where: {
      source_entityType_externalId: {
        source: namespaced,
        entityType: REF_ENTITY.STUDENT,
        externalId,
      },
    },
  });
  if (existing) {
    await prisma.externalRef.update({
      where: { id: existing.id },
      data: { internalId, lastSeenAt: new Date() },
    });
    return;
  }
  await prisma.externalRef.create({
    data: {
      schoolId,
      source: namespaced,
      entityType: REF_ENTITY.STUDENT,
      internalId,
      externalId,
    },
  });
}
