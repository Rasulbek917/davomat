import ExcelJS from "exceljs";
import { IntegrationProvider } from "@prisma/client";
import { parseCsv, resolveDelimiter } from "@/lib/integration/csv";
import {
  ConnectorError,
  type ConnectorContext,
  type ConnectorTestResult,
  type ImportDataset,
  type IntegrationConnector,
  type SourceClass,
  type SourceStudent,
} from "@/lib/integration/types";

/**
 * CSV / Excel import connector.
 *
 * This is the *supported fallback* when no official API integration exists.
 * It reads an export the school administrator is authorised to download from
 * eMaktab (or any other school information system) and normalises it.
 *
 * Column headers are matched case-insensitively against Uzbek, Russian and
 * English aliases so real-world exports do not need to be reshaped by hand.
 */

const HEADER_ALIASES: Record<string, string[]> = {
  externalId: [
    "external_id", "ext_id", "id", "student_id", "oquvchi_id", "o_quvchi_id", "kod", "code",
    "shaxsiy_id", "pinfl", "talaba_id",
  ],
  lastName: ["last_name", "lastname", "familiya", "familia", "sharif", "surname", "фамилия"],
  firstName: ["first_name", "firstname", "ism", "ismi", "name", "given_name", "имя"],
  middleName: ["middle_name", "middlename", "otasining_ismi", "otasining ismi", "otasi_ismi", "patronymic", "отчество"],
  birthDate: ["birth_date", "tugilgan_sana", "tugilgan sanasi", "tug_ilgan_sana", "dob", "date_of_birth", "дата_рождения"],
  gender: ["gender", "jinsi", "sex", "пол"],
  guardianName: ["guardian_name", "ota_ona", "ota_onasi", "parent_name", "ota_ona_ismi"],
  guardianPhone: ["guardian_phone", "ota_ona_telefoni", "parent_phone", "telefon", "phone", "tel"],
  className: ["class", "class_name", "sinf", "sinf_nomi", "sinf nomi", "classname", "класс"],
  gradeYear: ["grade", "grade_year", "sinf_raqami", "sinf raqami", "kurs", "year"],
  letter: ["letter", "harf", "sinf_harfi"],
  academicYear: ["academic_year", "oquv_yili", "o_quv_yili", "учебный_год"],
  classExternalId: ["class_id", "class_external_id", "sinf_id", "sinf kodi"],
};

function normaliseHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/['‘’ʻ`]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "");
}

function buildHeaderMap(headerRow: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  const normalised = headerRow.map(normaliseHeader);
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    const index = normalised.findIndex((h) => aliases.includes(h));
    if (index !== -1) map[field] = index;
  }
  return map;
}

function cell(row: string[], index: number | undefined): string | null {
  if (index === undefined) return null;
  const value = row[index];
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : null;
}

function parseGender(value: string | null): "MALE" | "FEMALE" | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  if (["m", "male", "o‘g‘il", "o'g'il", "ogil", "o“g‘il", "erkak", "муж", "м"].includes(v)) return "MALE";
  if (["f", "female", "qiz", "qiz bola", "qizbola", "ayol", "жен", "ж"].includes(v)) return "FEMALE";
  return null;
}

function parseBirthDate(value: string | null): string | null {
  if (!value) return null;
  // Accept YYYY-MM-DD, DD.MM.YYYY and DD/MM/YYYY.
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
  if (iso) {
    return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  }
  const dotted = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(value);
  if (dotted) {
    return `${dotted[3]}-${dotted[2].padStart(2, "0")}-${dotted[1].padStart(2, "0")}`;
  }
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return null;
}

/** Derive a grade year from a class name like "5-A", "5 A", "10-B". */
export function deriveGradeYear(className: string, explicit?: string | null): number | null {
  if (explicit) {
    const n = Number.parseInt(explicit, 10);
    if (Number.isFinite(n) && n >= 1 && n <= 11) return n;
  }
  const match = /(\d{1,2})/.exec(className);
  if (match) {
    const n = Number.parseInt(match[1], 10);
    if (n >= 1 && n <= 11) return n;
  }
  return null;
}

/** Split "5-A" into name/letter parts. */
function splitClassName(raw: string): { name: string; letter: string | null } {
  const cleaned = raw.replace(/\s+/g, " ").trim();
  const match = /^(\d{1,2})\s*[-–—/ ]?\s*([A-Za-zА-Яа-яЎўҒғҚқҲҳ])?$/.exec(cleaned);
  if (match) {
    return { name: match[1], letter: match[2] ? match[2].toUpperCase() : null };
  }
  const letterMatch = /^(.+?)\s*[-–—/]\s*([A-Za-zА-Яа-яЎўҒғҚқҲҳ])$/.exec(cleaned);
  if (letterMatch) {
    return { name: letterMatch[1].trim(), letter: letterMatch[2].toUpperCase() };
  }
  return { name: cleaned, letter: null };
}

async function readXlsxRows(buffer: Buffer): Promise<string[][]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new ConnectorError("Excel faylida varaq topilmadi.");
  const rows: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values: string[] = [];
    const cellCount = Math.max(row.cellCount, 1);
    for (let c = 1; c <= cellCount; c++) {
      const value = row.getCell(c).value;
      if (value === null || value === undefined) {
        values.push("");
      } else if (value instanceof Date) {
        values.push(value.toISOString().slice(0, 10));
      } else if (typeof value === "object") {
        const rich = value as { text?: string; result?: unknown; richText?: { text: string }[] };
        if (typeof rich.text === "string") values.push(rich.text);
        else if (Array.isArray(rich.richText)) values.push(rich.richText.map((r) => r.text).join(""));
        else if (rich.result !== undefined) values.push(String(rich.result));
        else values.push("");
      } else {
        values.push(String(value));
      }
    }
    rows.push(values);
  });
  return rows;
}

function datasetFromRows(rows: string[][], settings: Record<string, unknown>, source: string): ImportDataset {
  const table = rows.filter((row) => row.some((c) => c && c.trim().length));
  if (table.length === 0) throw new ConnectorError("Fayl bo‘sh yoki o‘qib bo‘lmadi.");

  const hasHeader = settings.hasHeader !== false;
  const headerRow = hasHeader ? table[0] : table[0].map((_, i) => `column_${i}`);
  const dataRows = hasHeader ? table.slice(1) : table;

  const map = buildHeaderMap(headerRow);
  const warnings: string[] = [];

  const required = ["firstName", "lastName"];
  const missing = required.filter((field) => map[field] === undefined);
  if (missing.length) {
    throw new ConnectorError(
      "Faylda majburiy ustunlar topilmadi.",
      [
        "Kerakli ustunlar: ism (first_name/ism) va familiya (last_name/familiya).",
        `Topilgan ustunlar: ${headerRow.join(" | ") || "(yo‘q)"}`,
      ],
    );
  }
  if (map.className === undefined && map.classExternalId === undefined) {
    throw new ConnectorError(
      "Sinf ustuni topilmadi.",
      ["Sinf ustuni kerak: class/sinf yoki class_id/sinf_id."],
    );
  }

  const defaultAcademicYear =
    typeof settings.defaultAcademicYear === "string" && /^\d{4}-\d{4}$/.test(settings.defaultAcademicYear)
      ? settings.defaultAcademicYear
      : undefined;

  const classes = new Map<string, SourceClass>();
  const students: SourceStudent[] = [];

  dataRows.forEach((row, rowIndex) => {
    const lineNo = hasHeader ? rowIndex + 2 : rowIndex + 1;
    const firstName = cell(row, map.firstName);
    const lastName = cell(row, map.lastName);

    if (!firstName || !lastName) {
      warnings.push(`${lineNo}-qator: ism yoki familiya yo‘q — o‘tkazib yuborildi.`);
      return;
    }

    const rawClassName = cell(row, map.className);
    const classExternalId = cell(row, map.classExternalId);
    const className = rawClassName ?? (classExternalId ? classExternalId : null);
    if (!className) {
      warnings.push(`${lineNo}-qator: sinf ko‘rsatilmagan — o‘tkazib yuborildi.`);
      return;
    }

    const academicYear = cell(row, map.academicYear) ?? defaultAcademicYear ?? null;
    const gradeYear = deriveGradeYear(className, cell(row, map.gradeYear));
    const { name, letter } = splitClassName(className);
    const explicitLetter = cell(row, map.letter);

    const classKey = (classExternalId ?? "").toLowerCase() || `${name}|${letter ?? ""}`.toLowerCase();
    if (!classes.has(classKey)) {
      classes.set(classKey, {
        externalId: classExternalId ?? null,
        name: /^\d{1,2}$/.test(name) && letter ? `${name}-${letter}` : name,
        gradeYear,
        letter: (explicitLetter ?? letter)?.toString().toUpperCase() ?? null,
        academicYear,
      });
    }

    students.push({
      externalId: cell(row, map.externalId),
      firstName,
      lastName,
      middleName: cell(row, map.middleName),
      birthDate: parseBirthDate(cell(row, map.birthDate)),
      gender: parseGender(cell(row, map.gender)),
      guardianName: cell(row, map.guardianName),
      guardianPhone: cell(row, map.guardianPhone),
      classExternalId: classExternalId ?? null,
      className: rawClassName ?? name,
      academicYear,
    });
  });

  if (students.length === 0) {
    throw new ConnectorError("Faylda birorta ham o‘quvchi qatori topilmadi.");
  }

  return { source, classes: [...classes.values()], students, warnings };
}

export class CsvExcelConnector implements IntegrationConnector {
  readonly provider = IntegrationProvider.CSV_EXCEL;
  readonly key = "csv-excel";
  readonly label = "CSV / Excel import";
  readonly description =
    "eMaktab yoki boshqa tizimdan rasmiy ruxsat bilan yuklangan CSV/XLS/XLSX faylini import qiladi.";
  readonly requiresFile = true;
  readonly requiresCredentials = false;

  async testConnection(ctx: ConnectorContext): Promise<ConnectorTestResult> {
    if (!ctx.file) {
      return {
        ok: false,
        message: "Sinov uchun CSV yoki Excel fayl tanlang.",
        details: ["Fayl tanlanmaguncha import ishga tushmaydi."],
      };
    }
    try {
      const rows = await this.readRows(ctx);
      const dataset = datasetFromRows(rows, ctx.settings, `csv:${ctx.file.filename}`);
      return {
        ok: true,
        message: `Fayl o‘qildi: ${dataset.students.length} o‘quvchi, ${dataset.classes.length} sinf.`,
        details: dataset.warnings.slice(0, 5),
      };
    } catch (error) {
      if (error instanceof ConnectorError) {
        return { ok: false, message: error.message, details: error.details };
      }
      return { ok: false, message: "Faylni o‘qishda xatolik yuz berdi." };
    }
  }

  async fetchDataset(ctx: ConnectorContext): Promise<ImportDataset> {
    if (!ctx.file) {
      throw new ConnectorError("Import uchun fayl tanlanmagan.", [
        "CSV yoki XLSX fayl tanlab, qaytadan urinib ko‘ring.",
      ]);
    }
    const rows = await this.readRows(ctx);
    return datasetFromRows(rows, ctx.settings, `csv:${ctx.file.filename}`);
  }

  private async readRows(ctx: ConnectorContext): Promise<string[][]> {
    const file = ctx.file!;
    const lower = file.filename.toLowerCase();
    if (lower.endsWith(".xlsx") || lower.endsWith(".xlsm")) {
      return readXlsxRows(file.buffer);
    }
    if (lower.endsWith(".csv") || lower.endsWith(".txt")) {
      const delimiter = resolveDelimiter(ctx.settings.delimiter);
      return parseCsv(file.buffer.toString("utf8"), delimiter);
    }
    if (lower.endsWith(".xls")) {
      // Try to read .xls via exceljs if possible
      try {
        return readXlsxRows(file.buffer);
      } catch {
        throw new ConnectorError("Eski .xls formati qo‘llab-quvvatlanmaydi yoki o‘qib bo‘lmadi.", [
          "Faylni Excel’da .xlsx yoki .csv sifatida saqlab, qaytadan yuklang.",
        ]);
      }
    }
    throw new ConnectorError("Fayl formati qo‘llab-quvvatlanmaydi.", [
      "Qo‘llab-quvvatlanadigan formatlar: .csv, .xlsx, .xls",
    ]);
  }
}
