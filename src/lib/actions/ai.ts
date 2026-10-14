"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { IntegrationProvider } from "@prisma/client";
import { prisma } from "@/lib/db";
import { buildAiContext } from "@/lib/ai/context";
import {
  importAnalysis,
  runAssistant,
  summarizeImport,
  type ChatTurn,
  type ImportAnalysis,
} from "@/lib/ai/agent";
import { AiNotConfiguredError, AiRequestError } from "@/lib/ai/provider";
import { assertAiRateLimit } from "@/lib/ai/rate-limit";
import { requireSchoolPermission } from "@/lib/auth/guards";
import { ACADEMIC_YEAR_DEFAULT, PERMISSION } from "@/lib/constants";
import { requireConnector } from "@/lib/integration/registry";
import { runImport, type ImportOutcome } from "@/lib/integration/engine";
import { ConnectorError, type ConnectorContext, type ConnectorTestResult } from "@/lib/integration/types";
import { runApiSyncAction, saveApiIntegrationAction, testIntegrationAction } from "@/lib/actions/integration";
import { recordAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { fail, ok, type ActionResult } from "@/lib/errors";
import { requestMeta } from "@/lib/request-meta";
import { getCurrentUser } from "@/lib/auth/session";

/**
 * ---------------------------------------------------------------------------
 * AI + eMaktab server actions
 * ---------------------------------------------------------------------------
 * Security invariants:
 *   * scope (schoolId / allowedClassIds) is resolved from the session in
 *     `buildAiContext` and never trusted from the client;
 *   * the AI can only read — there is no AI action that mutates data;
 *   * eMaktab credentials continue to go through `saveApiIntegrationAction`
 *     (AES-256-GCM at rest); this module never reads or returns them;
 *   * AI requests are rate limited and audited without logging secrets.
 * ---------------------------------------------------------------------------
 */

export type AiAnswer = {
  answer: string;
  toolsUsed: string[];
  model: string;
};

export type SyncResult = {
  outcome: ImportOutcome;
  analysis: ImportAnalysis;
  aiSummary: string;
};

/** Record an AI failure without ever logging secrets or breaking the response. */
async function safeLogAiError(error: unknown): Promise<void> {
  try {
    const user = await getCurrentUser();
    if (!user) return;
    const { ip, userAgent } = await requestMeta();
    const metadata =
      error instanceof AiRequestError
        ? {
            message: error.message,
            code: error.code,
            status: error.status,
            upstream: error.details.slice(0, 400),
          }
        : { message: error instanceof Error ? error.message : "Noma’lum xatolik" };
    await recordAudit({
      actorUserId: user.id,
      schoolId: user.schoolId,
      action: AUDIT_ACTIONS.AI_ERROR,
      entityType: "AiRequest",
      summary: "AI so‘rovida xatolik yuz berdi.",
      metadata,
      ip,
      userAgent,
    });
  } catch {
    // Never let error logging mask the real failure.
  }
}

// ---------------------------------------------------------------------------
// AI assistant
// ---------------------------------------------------------------------------

const chatTurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(4000),
});

const askSchema = z.object({
  question: z.string().trim().min(2, "Savolni kiriting").max(1000, "Savol juda uzun"),
  history: z.array(chatTurnSchema).max(12).optional(),
  schoolId: z.string().trim().max(60).optional(),
});

export async function aiAskAction(input: unknown): Promise<ActionResult<AiAnswer>> {
  try {
    const parsed = askSchema.parse(input);
    const ctx = await buildAiContext({ schoolId: parsed.schoolId });
    await assertAiRateLimit(ctx.userId);

    const result = await runAssistant({
      ctx,
      question: parsed.question,
      history: (parsed.history ?? []) as ChatTurn[],
    });

    const { ip, userAgent } = await requestMeta();
    await recordAudit({
      actorUserId: ctx.userId,
      schoolId: ctx.schoolId,
      action: AUDIT_ACTIONS.AI_QUERY,
      entityType: "AiRequest",
      summary: `AI so‘rovi bajarildi (${result.toolsUsed.length} ta vosita).`,
      metadata: {
        question: parsed.question.slice(0, 300),
        tools: result.toolsUsed,
        tokens: result.totalTokens,
        model: result.model,
      },
      ip,
      userAgent,
    });

    return ok({ answer: result.answer, toolsUsed: result.toolsUsed, model: result.model });
  } catch (error) {
    if (error instanceof AiNotConfiguredError) {
      return { ok: false, error: error.message, code: "AI_NOT_CONFIGURED" };
    }
    if (error instanceof AiRequestError) {
      await safeLogAiError(error);
      return { ok: false, error: error.message, code: error.code };
    }
    await safeLogAiError(error);
    return fail(error);
  }
}

const analyzeSchema = z.object({
  kind: z.enum(["today", "attendance", "import", "report"]),
  period: z.string().trim().max(20).optional(),
  from: z.string().trim().max(20).optional(),
  to: z.string().trim().max(20).optional(),
  classId: z.string().trim().max(60).optional(),
  className: z.string().trim().max(30).optional(),
  schoolId: z.string().trim().max(60).optional(),
});

const ANALYSIS_PROMPT: Record<z.infer<typeof analyzeSchema>["kind"], string> = {
  today:
    "Bugungi davomat holatini tahlil qil. Jami o‘quvchilar, kelganlar, kelmaganlar, kechikkanlar va sababli kelmaganlar sonini hamda davomat foizini ko‘rsat. Eng past davomatli sinflarni ayt.",
  attendance:
    "Tanlangan davr uchun davomatni tahlil qil: umumiy davomat foizi, eng past davomatli sinflar va takroriy dars qoldirgan o‘quvchilar. O‘tgan davr bilan solishtirib, qayerda pasayganini ayt.",
  import: "Oxirgi eMaktab importi/qolda tekshirish holatini tahlil qil va xatolik yoki tekshirish kerak bo‘lgan holatlar bor-yo‘qligini ayt.",
  report: "Maktab davomati bo‘yicha qisqa hisobot tayyorla: umumiy ko‘rsatkichlar, eng yaxshi va eng past sinflar, e’tibor talab qiladigan o‘quvchilar.",
};

export async function aiAnalyzeAction(input: unknown): Promise<ActionResult<AiAnswer>> {
  try {
    const parsed = analyzeSchema.parse(input);
    const ctx = await buildAiContext({ schoolId: parsed.schoolId });
    await assertAiRateLimit(ctx.userId);

    const parts: string[] = [ANALYSIS_PROMPT[parsed.kind]];
    if (parsed.period) parts.push(`Davr parametri: ${parsed.period}.`);
    if (parsed.from) parts.push(`Boshlanish: ${parsed.from}.`);
    if (parsed.to) parts.push(`Tugash: ${parsed.to}.`);
    if (parsed.className) parts.push(`Sinf: ${parsed.className}.`);
    else if (parsed.classId) parts.push(`Sinf identifikatori: ${parsed.classId}.`);

    const result = await runAssistant({ ctx, question: parts.join(" ") });

    const { ip, userAgent } = await requestMeta();
    await recordAudit({
      actorUserId: ctx.userId,
      schoolId: ctx.schoolId,
      action: AUDIT_ACTIONS.AI_QUERY,
      entityType: "AiRequest",
      summary: `AI tahlili bajarildi (${parsed.kind}).`,
      metadata: { kind: parsed.kind, tools: result.toolsUsed, tokens: result.totalTokens },
      ip,
      userAgent,
    });

    return ok({ answer: result.answer, toolsUsed: result.toolsUsed, model: result.model });
  } catch (error) {
    if (error instanceof AiNotConfiguredError) {
      return { ok: false, error: error.message, code: "AI_NOT_CONFIGURED" };
    }
    if (error instanceof AiRequestError) {
      await safeLogAiError(error);
      return { ok: false, error: error.message, code: error.code };
    }
    await safeLogAiError(error);
    return fail(error);
  }
}

// ---------------------------------------------------------------------------
// eMaktab connection (director)
// ---------------------------------------------------------------------------

async function findEmaktabConfig(schoolId: string) {
  return prisma.integrationConfig.findFirst({
    where: { schoolId, provider: IntegrationProvider.EMAKTAB_API },
    orderBy: { createdAt: "asc" },
  });
}

/** Create or update the single eMaktab API connection for the school. */
export async function emaktabSaveConnectionAction(
  raw: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requireSchoolPermission(PERMISSION.INTEGRATION_MANAGE);
    const existing = await findEmaktabConfig(actor.schoolId);
    const body = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    return saveApiIntegrationAction({
      name: "eMaktab rasmiy API",
      isEnabled: true,
      ...body,
      id: existing?.id,
    });
  } catch (error) {
    return fail(error);
  }
}

export async function emaktabTestConnectionAction(): Promise<ActionResult<ConnectorTestResult>> {
  try {
    const actor = await requireSchoolPermission(PERMISSION.INTEGRATION_MANAGE);
    const config = await findEmaktabConfig(actor.schoolId);
    if (!config) {
      return { ok: false, error: "Avval eMaktab ulanish ma’lumotlarini saqlang.", code: "NO_CONFIG" };
    }
    const formData = new FormData();
    formData.set("configId", config.id);
    return testIntegrationAction(formData);
  } catch (error) {
    return fail(error);
  }
}

/**
 * Run the eMaktab sync. `dryRun` = "eMaktabdan ma’lumotlarni olish" (preview),
 * otherwise a real import. Returns the real outcome plus an AI summary.
 */
export async function emaktabSyncAction(input: {
  dryRun?: boolean;
}): Promise<ActionResult<SyncResult>> {
  try {
    const actor = await requireSchoolPermission(PERMISSION.INTEGRATION_MANAGE);
    const config = await findEmaktabConfig(actor.schoolId);
    if (!config) {
      return { ok: false, error: "Avval eMaktab ulanish ma’lumotlarini saqlang va yoqing.", code: "NO_CONFIG" };
    }

    const result = await runApiSyncAction({ id: config.id, dryRun: input?.dryRun ?? false });
    if (!result.ok) return result;

    revalidatePath("/dashboard/ai");
    revalidatePath("/admin/ai");

    const aiSummary = await summarizeImport(await safeContext(actor.schoolId), result.data);
    return ok({ outcome: result.data, analysis: importAnalysis(result.data), aiSummary });
  } catch (error) {
    if (error instanceof ConnectorError) {
      return { ok: false, error: error.message, code: "CONNECTOR" };
    }
    return fail(error);
  }
}

/** Build a minimal context for summarisation; never throws on permission scope. */
async function safeContext(schoolId: string) {
  try {
    return await buildAiContext({ schoolId });
  } catch {
    // Fall back to a context that only carries the school name for the prompt.
    const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { name: true } });
    return {
      userId: "",
      fullName: "",
      roleKey: "",
      permissions: [],
      schoolId,
      schoolName: school?.name ?? "Maktab",
      allowedClassIds: null,
      isClassScoped: false,
    };
  }
}

// ---------------------------------------------------------------------------
// Official export file import (fallback channel)
// ---------------------------------------------------------------------------

async function ensureCsvConfig(schoolId: string, actorId: string): Promise<string> {
  const existing = await prisma.integrationConfig.findFirst({
    where: { schoolId, provider: IntegrationProvider.CSV_EXCEL, name: "eMaktab eksport fayli" },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await prisma.integrationConfig.create({
    data: {
      schoolId,
      provider: IntegrationProvider.CSV_EXCEL,
      name: "eMaktab eksport fayli",
      isEnabled: true,
      settings: { delimiter: ",", hasHeader: true, defaultAcademicYear: ACADEMIC_YEAR_DEFAULT },
      createdById: actorId,
    },
    select: { id: true },
  });
  return created.id;
}

export async function emaktabFileImportAction(formData: FormData): Promise<ActionResult<SyncResult>> {
  try {
    const actor = await requireSchoolPermission(PERMISSION.INTEGRATION_MANAGE);
    const dryRun = String(formData.get("dryRun") ?? "false") === "true";
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, error: "CSV yoki Excel faylni tanlang.", code: "NO_FILE" };
    }

    const connector = requireConnector(IntegrationProvider.CSV_EXCEL);
    const context: ConnectorContext = {
      schoolId: actor.schoolId,
      settings: { delimiter: ",", hasHeader: true, defaultAcademicYear: ACADEMIC_YEAR_DEFAULT },
      credentials: null,
      file: { buffer: Buffer.from(await file.arrayBuffer()), filename: file.name },
    };

    const dataset = await connector.fetchDataset(context);
    const configId = await ensureCsvConfig(actor.schoolId, actor.id);

    const outcome = await runImport({
      schoolId: actor.schoolId,
      provider: IntegrationProvider.CSV_EXCEL,
      source: dataset.source,
      dataset,
      integrationConfigId: configId,
      triggeredById: actor.id,
      dryRun,
    });

    revalidatePath("/dashboard/ai");
    revalidatePath("/admin/ai");
    revalidatePath("/dashboard/integration");
    revalidatePath("/dashboard/students");
    revalidatePath("/dashboard/classes");
    revalidatePath("/dashboard");

    const aiSummary = await summarizeImport(await safeContext(actor.schoolId), outcome);
    return ok({ outcome, analysis: importAnalysis(outcome), aiSummary });
  } catch (error) {
    if (error instanceof ConnectorError) {
      return { ok: false, error: error.message, code: "CONNECTOR" };
    }
    return fail(error);
  }
}
