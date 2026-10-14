import { Errors } from "@/lib/errors";
import { prisma } from "@/lib/db";
import { classLabel, fullName } from "@/lib/utils";
import { resolveRange, formatDateOnly, type DateRange } from "@/lib/date";
import {
  classStatsForRange,
  studentSummary,
  type AttendanceStats,
  type RankedClass,
} from "@/lib/attendance/queries";
import { classStudentRanking, studentExtremes, todayStatusStudents } from "@/lib/attendance/queries-ext";
import {
  computeStats,
  emptyCounts,
  mergeCounts,
  rankClasses,
  type RankingOutcome,
  type StatusCounts,
} from "@/lib/attendance/percentage";
import { today } from "@/lib/date";
import type { AiContext } from "@/lib/ai/context";
import type { AiToolSpec } from "@/lib/ai/provider";

/**
 * ---------------------------------------------------------------------------
 * Server-side tool layer for the AI assistant
 * ---------------------------------------------------------------------------
 * The model NEVER touches the database directly. It may only call the tools
 * below, and every tool re-derives its scope from {@link AiContext} — which is
 * built from the session, never from client input. Attendance numbers are
 * produced exclusively by the existing attendance services
 * (`classStatsForRange`, `computeStats`, `rankClasses`, …) so the AI can never
 * invent a different formula than the rest of the app.
 * ---------------------------------------------------------------------------
 */

const PERIODS = ["today", "yesterday", "week", "month", "year", "last7", "last30", "custom"] as const;

function str(args: Record<string, unknown>, key: string): string | null {
  const value = args[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function num(args: Record<string, unknown>, key: string, fallback: number): number {
  const value = args[key];
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function rangeFromArgs(args: Record<string, unknown>): DateRange {
  const raw = str(args, "period") ?? "month";
  const period = (PERIODS as readonly string[]).includes(raw) ? raw : "month";
  return resolveRange(period, str(args, "from"), str(args, "to"));
}

function periodLabel(range: DateRange): string {
  return `${formatDateOnly(range.from)} – ${formatDateOnly(range.to)}`;
}

function statsOut(stats: AttendanceStats) {
  return {
    kelgan: stats.present,
    kelmagan: stats.absent,
    kechikkan: stats.late,
    sababli: stats.excused,
    jami_qayd_etilgan: stats.recorded,
    "davomat_foizi": stats.rate,
    qamrov_foizi: stats.coverage,
    ishonchli: stats.reliable,
  };
}

function classOut(cls: RankedClass) {
  return {
    classId: cls.classId,
    sinf: cls.className,
    davomat_foizi: cls.stats.rate,
    kelgan: cls.stats.present,
    kelmagan: cls.stats.absent,
    kechikkan: cls.stats.late,
    sababli: cls.stats.excused,
    qayd_etilgan: cls.stats.recorded,
    ishonchli: cls.stats.reliable,
  };
}

function rankingOut(ranking: RankingOutcome) {
  return {
    eng_yaxshi: ranking.best ? classOut(ranking.best) : null,
    eng_yomon: ranking.worst ? classOut(ranking.worst) : null,
    malumot_yetarli_emas: ranking.excludedForInsufficientData.map(classOut),
    jadval: ranking.ranked.map(classOut),
  };
}

/** Classes the context may read (all classes, or only `allowedClassIds`). */
async function loadScopedClasses(ctx: AiContext) {
  const idFilter = ctx.allowedClassIds;
  return prisma.schoolClass.findMany({
    where: {
      schoolId: ctx.schoolId,
      deletedAt: null,
      ...(idFilter ? { id: { in: idFilter.length > 0 ? idFilter : ["__none__"] } } : {}),
    },
    select: { id: true, name: true, letter: true, gradeYear: true, academicYear: true },
    orderBy: [{ gradeYear: "asc" }, { name: "asc" }],
  });
}

type ScopedAggregate = {
  stats: AttendanceStats;
  perClass: RankedClass[];
  ranking: RankingOutcome;
  classCount: number;
};

async function scopedAggregate(ctx: AiContext, range: DateRange): Promise<ScopedAggregate> {
  const classes = await loadScopedClasses(ctx);
  const perClass = await Promise.all(
    classes.map((c) => classStatsForRange({ schoolId: ctx.schoolId, classId: c.id, range })),
  );
  const totals: StatusCounts = perClass.reduce(
    (acc, c) =>
      mergeCounts(acc, {
        present: c.stats.present,
        absent: c.stats.absent,
        late: c.stats.late,
        excused: c.stats.excused,
      }),
    emptyCounts(),
  );
  const eligible = perClass.reduce((acc, c) => acc + c.stats.eligible, 0);
  return {
    stats: computeStats(totals, eligible),
    perClass,
    ranking: rankClasses(perClass),
    classCount: classes.length,
  };
}

async function resolveClass(
  ctx: AiContext,
  args: Record<string, unknown>,
): Promise<{ id: string; label: string }> {
  const classId = str(args, "classId");
  const className = str(args, "className");

  let found: { id: string; name: string; letter: string | null } | null = null;
  if (classId) {
    if (ctx.allowedClassIds && !ctx.allowedClassIds.includes(classId)) {
      throw Errors.forbidden("Ushbu sinf ma’lumotlariga AI orqali kirish mumkin emas.");
    }
    found = await prisma.schoolClass.findFirst({
      where: { id: classId, schoolId: ctx.schoolId, deletedAt: null },
      select: { id: true, name: true, letter: true },
    });
  } else if (className) {
    const candidates = await prisma.schoolClass.findMany({
      where: {
        schoolId: ctx.schoolId,
        deletedAt: null,
        name: { equals: className, mode: "insensitive" },
        ...(ctx.allowedClassIds ? { id: { in: ctx.allowedClassIds.length > 0 ? ctx.allowedClassIds : ["__none__"] } } : {}),
      },
      select: { id: true, name: true, letter: true },
      take: 2,
    });
    if (candidates.length > 1) {
      throw Errors.validation(`"${className}" nomli bir nechta sinf topildi. classId ni aniqlashtiring.`);
    }
    found = candidates[0] ?? null;
  } else {
    throw Errors.validation("Sinf ko‘rsatilmadi (className yoki classId kerak).");
  }

  if (!found) throw Errors.notFound("Sinf topilmadi yoki sizga biriktirilmagan.");
  return { id: found.id, label: classLabel(found.name, found.letter) };
}

async function findStudent(ctx: AiContext, args: Record<string, unknown>) {
  const studentId = str(args, "studentId");
  const studentName = str(args, "studentName");

  let student: { id: string; firstName: string; lastName: string; middleName: string | null } | null = null;
  if (studentId) {
    student = await prisma.student.findFirst({
      where: { id: studentId, schoolId: ctx.schoolId, deletedAt: null },
      select: { id: true, firstName: true, lastName: true, middleName: true },
    });
  } else if (studentName) {
    const candidates = await prisma.student.findMany({
      where: {
        schoolId: ctx.schoolId,
        deletedAt: null,
        OR: [
          { firstName: { contains: studentName, mode: "insensitive" } },
          { lastName: { contains: studentName, mode: "insensitive" } },
        ],
      },
      select: { id: true, firstName: true, lastName: true, middleName: true },
      take: 6,
    });
    if (candidates.length > 1) {
      throw Errors.validation(
        `"${studentName}" bo‘yicha bir nechta o‘quvchi topildi: ${candidates
          .map((c) => fullName(c))
          .join(", ")}. Aniqlashtiring.`,
      );
    }
    student = candidates[0] ?? null;
  } else {
    throw Errors.validation("O‘quvchi ko‘rsatilmadi (studentName yoki studentId kerak).");
  }

  if (!student) throw Errors.notFound("O‘quvchi topilmadi.");

  if (ctx.allowedClassIds !== null) {
    const inScope = await prisma.enrollment.findFirst({
      where: {
        schoolId: ctx.schoolId,
        studentId: student.id,
        isActive: true,
        classId: { in: ctx.allowedClassIds.length > 0 ? ctx.allowedClassIds : ["__none__"] },
      },
      select: { id: true },
    });
    if (!inScope) throw Errors.forbidden("Bu o‘quvchi sizga biriktirilgan sinflarda emas.");
  }

  return student;
}

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------

export type AiToolDefinition = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  handler: (args: Record<string, unknown>, ctx: AiContext) => Promise<unknown>;
};

const PERIOD_SCHEMA = {
  period: {
    type: "string",
    enum: [...PERIODS],
    description: "Time window. Defaults to 'month'.",
  },
  from: { type: "string", description: "Start date YYYY-MM-DD (only for period='custom')." },
  to: { type: "string", description: "End date YYYY-MM-DD (only for period='custom')." },
};

const TOOLS: AiToolDefinition[] = [
  {
    name: "list_classes",
    description: "List the classes the current user is allowed to see, with student counts and class teacher.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    handler: async (_args, ctx) => {
      const classes = await loadScopedClasses(ctx);
      const counts = await prisma.enrollment.groupBy({
        by: ["classId"],
        where: { schoolId: ctx.schoolId, isActive: true, status: "ACTIVE" },
        _count: { _all: true },
      });
      const countByClass = new Map(counts.map((c) => [c.classId, c._count._all]));
      const teachers = await prisma.schoolClass.findMany({
        where: { id: { in: classes.map((c) => c.id) } },
        select: { id: true, teacher: { select: { firstName: true, lastName: true, middleName: true } } },
      });
      const teacherByClass = new Map(teachers.map((t) => [t.id, t.teacher ? fullName(t.teacher) : null]));
      return {
        jami_sinflar: classes.length,
        sinflar: classes.map((c) => ({
          classId: c.id,
          sinf: classLabel(c.name, c.letter),
          sinf_rahbari: teacherByClass.get(c.id) ?? null,
          oquvchilar_soni: countByClass.get(c.id) ?? 0,
        })),
      };
    },
  },
  {
    name: "get_school_overview",
    description:
      "High-level overview of the whole school (or, for a class teacher, their own classes): student/class counts and attendance for the last 30 days.",
    parameters: { type: "object", properties: { ...PERIOD_SCHEMA }, additionalProperties: false },
    handler: async (args, ctx) => {
      const range = rangeFromArgs({ period: str(args, "period") ?? "last30", from: str(args, "from"), to: str(args, "to") });
      const agg = await scopedAggregate(ctx, range);
      const studentCount = await prisma.enrollment.count({
        where: {
          schoolId: ctx.schoolId,
          isActive: true,
          status: "ACTIVE",
          ...(ctx.allowedClassIds
            ? { classId: { in: ctx.allowedClassIds.length > 0 ? ctx.allowedClassIds : ["__none__"] } }
            : {}),
        },
      });
      return {
        sinflar_soni: agg.classCount,
        oquvchilar_soni: studentCount,
        davr: periodLabel(range),
        davomat: statsOut(agg.stats),
        reyting: rankingOut(agg.ranking),
      };
    },
  },
  {
    name: "get_attendance_summary",
    description:
      "Attendance summary for a period, optionally for a single class. Returns totals, percentage and best/worst class ranking.",
    parameters: {
      type: "object",
      properties: {
        classId: { type: "string", description: "Optional class id to narrow to one class." },
        className: { type: "string", description: "Optional class name (e.g. '7-A') to narrow to one class." },
        ...PERIOD_SCHEMA,
      },
      additionalProperties: false,
    },
    handler: async (args, ctx) => {
      const range = rangeFromArgs(args);
      if (str(args, "classId") || str(args, "className")) {
        const cls = await resolveClass(ctx, args);
        const stats = await classStatsForRange({ schoolId: ctx.schoolId, classId: cls.id, range });
        return { sinf: cls.label, davr: periodLabel(range), davomat: classOut(stats) };
      }
      const agg = await scopedAggregate(ctx, range);
      return {
        davr: periodLabel(range),
        davomat: statsOut(agg.stats),
        sinflar_soni: agg.classCount,
        reyting: rankingOut(agg.ranking),
      };
    },
  },
  {
    name: "get_class_attendance",
    description:
      "Detailed attendance for one class: overall percentage, per-student ranking, best/worst student and today's statuses.",
    parameters: {
      type: "object",
      properties: {
        classId: { type: "string" },
        className: { type: "string", description: "e.g. '7-A'." },
        ...PERIOD_SCHEMA,
      },
      additionalProperties: false,
    },
    handler: async (args, ctx) => {
      const cls = await resolveClass(ctx, args);
      const range = rangeFromArgs(args);
      const [stats, ranking, extremes, todayRows] = await Promise.all([
        classStatsForRange({ schoolId: ctx.schoolId, classId: cls.id, range }),
        classStudentRanking(ctx.schoolId, cls.id, range),
        studentExtremes(ctx.schoolId, cls.id, range),
        todayStatusStudents(ctx.schoolId, cls.id, today()),
      ]);
      return {
        sinf: cls.label,
        davr: periodLabel(range),
        davomat: classOut(stats),
        eng_yaxshi_oquvchi: extremes.best,
        eng_past_oquvchi: extremes.worst,
        bugun: todayRows.map((r) => ({ ism: r.fullName, holat: r.status })),
        oquvchilar: ranking.map((r) => ({
          ism: r.fullName,
          kelgan: r.present,
          kelmagan: r.absent,
          kechikkan: r.late,
          sababli: r.excused,
          davomat_foizi: r.rate,
        })),
      };
    },
  },
  {
    name: "get_student_attendance",
    description: "Attendance history for a single student over a period.",
    parameters: {
      type: "object",
      properties: {
        studentId: { type: "string" },
        studentName: { type: "string", description: "Full or partial name." },
        ...PERIOD_SCHEMA,
      },
      additionalProperties: false,
    },
    handler: async (args, ctx) => {
      const student = await findStudent(ctx, args);
      const range = rangeFromArgs(args);
      const summary = await studentSummary(ctx.schoolId, student.id, range);
      const stats = computeStats(summary.counts, summary.sessions);
      return {
        oquvchi: fullName(student),
        davr: periodLabel(range),
        sinflar: summary.classNames,
        davomat: statsOut(stats),
        kelgan: summary.counts.present,
        kelmagan: summary.counts.absent,
        kechikkan: summary.counts.late,
        sababli: summary.counts.excused,
      };
    },
  },
  {
    name: "get_top_absent_students",
    description: "Students with the most absences in a period (within the user's allowed classes).",
    parameters: {
      type: "object",
      properties: { limit: { type: "integer", description: "Max rows, default 10." }, ...PERIOD_SCHEMA },
      additionalProperties: false,
    },
    handler: async (args, ctx) => {
      const range = rangeFromArgs(args);
      const limit = Math.min(Math.max(num(args, "limit", 10), 1), 50);
      const classes = await loadScopedClasses(ctx);
      const perClass = await Promise.all(classes.map((c) => classStudentRanking(ctx.schoolId, c.id, range)));
      const flat = perClass
        .flat()
        .filter((r) => r.absent > 0)
        .sort((a, b) => b.absent - a.absent)
        .slice(0, limit);
      return {
        davr: periodLabel(range),
        oquvchilar: flat.map((r) => ({
          ism: r.fullName,
          kelmagan_kun: r.absent,
          kechikkan: r.late,
          davomat_foizi: r.rate,
        })),
      };
    },
  },
  {
    name: "get_emaktab_status",
    description: "Current eMaktab integration configuration and the last synchronisation for this school.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    handler: async (_args, ctx) => {
      const config = await prisma.integrationConfig.findFirst({
        where: { schoolId: ctx.schoolId, provider: "EMAKTAB_API" },
        orderBy: { createdAt: "asc" },
        select: {
          name: true,
          isEnabled: true,
          baseUrl: true,
          credentialHint: true,
          lastSyncAt: true,
          lastSyncStatus: true,
          lastSyncMessage: true,
        },
      });
      const lastSync = await prisma.syncLog.findFirst({
        where: { schoolId: ctx.schoolId },
        orderBy: { startedAt: "desc" },
        select: { startedAt: true, status: true, source: true, summary: true },
      });
      return {
        sozlangan: Boolean(config),
        ulanish: config
          ? {
              nomi: config.name,
              yoqilgan: config.isEnabled,
              manzil: config.baseUrl,
              login_hint: config.credentialHint,
              oxirgi_sinxron: config.lastSyncAt,
              holat: config.lastSyncStatus,
            }
          : null,
        oxirgi_import: lastSync
          ? { vaqt: lastSync.startedAt, holat: lastSync.status, manba: lastSync.source, xulosa: lastSync.summary }
          : null,
      };
    },
  },
  {
    name: "get_emaktab_history",
    description: "Recent eMaktab/import synchronisation history for this school.",
    parameters: { type: "object", properties: { limit: { type: "integer", description: "Max rows, default 10." } }, additionalProperties: false },
    handler: async (args, ctx) => {
      const limit = Math.min(Math.max(num(args, "limit", 10), 1), 50);
      const logs = await prisma.syncLog.findMany({
        where: { schoolId: ctx.schoolId },
        orderBy: { startedAt: "desc" },
        take: limit,
        select: {
          startedAt: true,
          finishedAt: true,
          status: true,
          source: true,
          classesCreated: true,
          classesUpdated: true,
          studentsCreated: true,
          studentsUpdated: true,
          recordsSkipped: true,
          summary: true,
        },
      });
      return {
        tarix: logs.map((l) => ({
          vaqt: l.startedAt,
          holat: l.status,
          manba: l.source,
          yangi_sinflar: l.classesCreated,
          yangilangan_sinflar: l.classesUpdated,
          yangi_oquvchilar: l.studentsCreated,
          yangilangan_oquvchilar: l.studentsUpdated,
          otkazib_yuborilgan: l.recordsSkipped,
          xulosa: l.summary,
        })),
      };
    },
  },
  {
    name: "get_import_errors",
    description: "Import problems: items left for manual review and any failed synchronisations.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    handler: async (_args, ctx) => {
      const [pending, failed] = await Promise.all([
        prisma.importReviewItem.findMany({
          where: { schoolId: ctx.schoolId, status: "PENDING" },
          orderBy: { createdAt: "desc" },
          take: 50,
          select: { reason: true, entityType: true, externalId: true, createdAt: true },
        }),
        prisma.syncLog.findMany({
          where: { schoolId: ctx.schoolId, status: "FAILED" },
          orderBy: { startedAt: "desc" },
          take: 10,
          select: { startedAt: true, source: true, summary: true },
        }),
      ]);
      return {
        qolda_tekshirish: pending.length,
        tekshirish_royxati: pending.map((p) => ({
          sabab: p.reason,
          turi: p.entityType,
          external_id: p.externalId,
          vaqt: p.createdAt,
        })),
        muvaffaqiyatsiz: failed.length,
        muvaffaqiyatsiz_royxati: failed.map((f) => ({ vaqt: f.startedAt, manba: f.source, xulosa: f.summary })),
      };
    },
  },
];

const TOOL_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

/** OpenAI-compatible tool specifications. */
export function toolSpecs(): AiToolSpec[] {
  return TOOLS.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

export function toolNames(): string[] {
  return TOOLS.map((t) => t.name);
}

/**
 * Execute a tool. Unknown tools and authorization failures are returned as a
 * structured error object (not thrown) so the model can explain the refusal to
 * the user without leaking anything.
 */
export async function runTool(
  name: string,
  args: Record<string, unknown>,
  ctx: AiContext,
): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  const tool = TOOL_BY_NAME.get(name);
  if (!tool) return { ok: false, error: `Noma’lum vosita: ${name}` };
  try {
    const data = await tool.handler(args, ctx);
    return { ok: true, data };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Vositani bajarishda xatolik.";
    return { ok: false, error: message };
  }
}
