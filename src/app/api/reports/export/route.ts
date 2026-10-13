import { NextResponse } from "next/server";
import { AppError, Errors } from "@/lib/errors";
import { can, requireSuperAdmin, requireUser } from "@/lib/auth/guards";
import { PERMISSION, isSuperAdmin } from "@/lib/constants";
import { getClassScope, scopeAllowsClass } from "@/lib/auth/scope";
import { formatDateOnly, formatUzDate, resolveRange } from "@/lib/date";
import {
  buildClassReport,
  buildPlatformReport,
  buildSchoolReport,
  buildStudentReport,
} from "@/lib/reports/aggregate";
import {
  buildCsv,
  buildPdfBuffer,
  buildXlsxBuffer,
  contentTypeFor,
  exportFilename,
  type ExportColumn,
  type ExportFormat,
  type ExportRow,
} from "@/lib/reports/exporters";
import { recordAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { requestMeta } from "@/lib/request-meta";

/**
 * Report export endpoint.
 *
 * Reports are always produced from live database records — never from cached or
 * fabricated numbers. School isolation is enforced here: a school user can only
 * ever export their own school's data (the school id is taken from the session),
 * and the platform-wide report is restricted to the Super Admin.
 */

const FORMATS: ExportFormat[] = ["csv", "xlsx", "pdf"];

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const url = new URL(request.url);
    const scope = url.searchParams.get("scope") ?? "school";
    const format = (url.searchParams.get("format") ?? "xlsx") as ExportFormat;

    if (!FORMATS.includes(format)) return badRequest("Eksport formati noto‘g‘ri.");
    if (!can(user, PERMISSION.REPORTS_EXPORT) && !isSuperAdmin(user.permissions)) {
      throw Errors.forbidden("Hisobot eksporti uchun ruxsatingiz yo‘q.");
    }

    const range = resolveRange(
      url.searchParams.get("period"),
      url.searchParams.get("from"),
      url.searchParams.get("to"),
    );

    const { ip, userAgent } = await requestMeta();
    const rangeLabel = `${formatUzDate(range.from)} — ${formatUzDate(range.to)}`;

    let columns: ExportColumn[];
    let rows: ExportRow[];
    let title: string;
    let sheetName: string;
    let baseName: string;

    if (scope === "platform") {
      await requireSuperAdmin();
      const report = await buildPlatformReport(range);
      title = "Platforma bo‘yicha davomat hisoboti";
      sheetName = "Maktablar";
      baseName = "platforma-hisobot";
      columns = [
        { key: "schoolName", label: "Maktab", width: 26 },
        { key: "studentCount", label: "O‘quvchi", width: 12 },
        { key: "classCount", label: "Sinf", width: 10 },
        { key: "recorded", label: "Belgilangan", width: 14 },
        { key: "rate", label: "Davomat, %", width: 14 },
        { key: "coverage", label: "Qamrov, %", width: 14 },
      ];
      rows = report.rows.map((r) => ({
        schoolName: r.schoolName,
        studentCount: r.studentCount,
        classCount: r.classCount,
        recorded: r.recorded,
        rate: r.rate,
        coverage: r.coverage,
      }));
    } else if (scope === "class") {
      const classId = url.searchParams.get("classId");
      if (!classId) return badRequest("Sinf tanlanmagan.");
      const schoolId = user.schoolId;
      if (!schoolId) return badRequest("Maktab aniqlanmadi.");
      const scopeCtx = await getClassScope(user);
      if (!scopeAllowsClass(scopeCtx, classId)) {
        throw Errors.forbidden("Ushbu sinf hisobotini eksport qilish mumkin emas.");
      }
      const report = await buildClassReport(schoolId, classId, range);
      if (!report) return badRequest("Sinf topilmadi.");
      title = `${report.className} sinfi — davomat hisoboti`;
      sheetName = report.className;
      baseName = `sinf-${report.className}`;
      columns = [
        { key: "fullName", label: "F.I.Sh.", width: 28 },
        { key: "present", label: "Keldi", width: 10 },
        { key: "late", label: "Kechikdi", width: 10 },
        { key: "absent", label: "Kelmadi", width: 10 },
        { key: "excused", label: "Sababli", width: 10 },
        { key: "recorded", label: "Belgilangan", width: 12 },
        { key: "rate", label: "Davomat, %", width: 12 },
      ];
      rows = report.students.map((s) => ({ ...s }));
    } else if (scope === "student") {
      const studentId = url.searchParams.get("studentId");
      if (!studentId) return badRequest("O‘quvchi tanlanmagan.");
      const schoolId = user.schoolId;
      if (!schoolId) return badRequest("Maktab aniqlanmadi.");
      const report = await buildStudentReport(schoolId, studentId, range);
      if (!report) return badRequest("O‘quvchi topilmadi.");
      title = `${report.fullName} — davomat hisoboti`;
      sheetName = "Davomat";
      baseName = "oquvchi-hisobot";
      columns = [
        { key: "date", label: "Sana", width: 16 },
        { key: "className", label: "Sinf", width: 12 },
        { key: "statusLabel", label: "Holat", width: 16 },
        { key: "reason", label: "Sabab", width: 24 },
        { key: "note", label: "Izoh", width: 24 },
      ];
      rows = report.days.map((d) => ({
        date: formatUzDate(d.date),
        className: d.className,
        statusLabel: d.statusLabel,
        reason: d.reason ?? "",
        note: d.note ?? "",
      }));
    } else {
      // School-wide report for the current user's school.
      const schoolId =
        url.searchParams.get("schoolId") ?? user.schoolId;
      if (!schoolId) return badRequest("Maktab aniqlanmadi.");
      if (!isSuperAdmin(user.permissions) && schoolId !== user.schoolId) {
        throw Errors.forbidden("Boshqa maktab hisobotini eksport qilish mumkin emas.");
      }
      const scopeCtx = await getClassScope(user);
      let classFilter: string[] | undefined;
      if (scopeCtx.kind === "CLASSES") {
        classFilter = scopeCtx.classIds;
        if (classFilter.length === 0) {
          throw Errors.forbidden("Hisobot eksporti uchun ruxsatingiz yo‘q.");
        }
      }
      const report = await buildSchoolReport(schoolId, range, classFilter);
      title = `${report.schoolName} — davomat hisoboti`;
      sheetName = "Sinflar";
      baseName = "maktab-hisobot";
      columns = [
        { key: "className", label: "Sinf", width: 14 },
        { key: "present", label: "Keldi", width: 10 },
        { key: "late", label: "Kechikdi", width: 10 },
        { key: "absent", label: "Kelmadi", width: 10 },
        { key: "excused", label: "Sababli", width: 10 },
        { key: "recorded", label: "Belgilangan", width: 12 },
        { key: "rate", label: "Davomat, %", width: 12 },
        { key: "coverage", label: "Qamrov, %", width: 12 },
      ];
      rows = report.classes.map((c) => ({
        className: c.className,
        present: c.present,
        late: c.late,
        absent: c.absent,
        excused: c.excused,
        recorded: c.recorded,
        rate: c.rate,
        coverage: c.coverage,
      }));
    }

    let body: string | Uint8Array;
    if (format === "csv") {
      body = buildCsv(columns, rows);
    } else if (format === "xlsx") {
      body = new Uint8Array(await buildXlsxBuffer(columns, rows, sheetName));
    } else {
      body = new Uint8Array(
        await buildPdfBuffer(title, columns, rows, { sheetName, note: rangeLabel }),
      );
    }

    await recordAudit({
      actorUserId: user.id,
      schoolId: user.schoolId,
      action: AUDIT_ACTIONS.REPORT_EXPORTED,
      entityType: "Report",
      summary: `Hisobot eksport qilindi (${scope}, ${format.toUpperCase()}): ${rangeLabel}.`,
      metadata: { scope, format, from: formatDateOnly(range.from), to: formatDateOnly(range.to) },
      ip,
      userAgent,
    });

    const filename = exportFilename(baseName, format);
    return new NextResponse(body as BodyInit, {
      headers: {
        "Content-Type": contentTypeFor(format),
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[reports/export] failed", error);
    return NextResponse.json({ error: "Hisobotni yaratishda xatolik." }, { status: 500 });
  }
}
