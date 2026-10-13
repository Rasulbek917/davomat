import { Buffer } from "node:buffer";
import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { formatUzDate, formatUzDateTime, today } from "@/lib/date";

/**
 * Report exporters. CSV, XLSX and PDF are produced from the same plain
 * `columns` + `rows` structure used by the UI tables, so every export looks
 * the same no matter which format the user picks.
 */

export type ExportColumn = { key: string; label: string; width?: number };
export type ExportRow = Record<string, string | number | null | undefined>;

const HEADER_BG = rgb(0.18, 0.25, 0.42);
const STRIPE_BG = rgb(0.95, 0.96, 0.98);
const LINE = rgb(0.82, 0.85, 0.9);

export function escapeCsvValue(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? "" : String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/** RFC-4180 CSV string with \r\n line endings and a BOM for Excel (Uzbek). */
export function buildCsv(columns: ExportColumn[], rows: ExportRow[]): string {
  const header = columns.map((c) => escapeCsvValue(c.label)).join(",");
  const body = rows
    .map((row) => columns.map((c) => escapeCsvValue(row[c.key])).join(","))
    .join("\r\n");
  return `\uFEFF${header}\r\n${body}\r\n`;
}

export async function buildXlsxBuffer(
  columns: ExportColumn[],
  rows: ExportRow[],
  sheetName = "Hisobot",
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Maktab Davomat";
  const sheet = workbook.addWorksheet(sheetName);

  sheet.columns = columns.map((c) => ({ header: c.label, key: c.key, width: c.width ?? 18 }));
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF2A3C6E" },
  };
  sheet.getRow(1).alignment = { vertical: "middle", horizontal: "center" };
  sheet.getRow(1).height = 22;

  for (const row of rows) {
    sheet.addRow(
      columns.reduce<Record<string, unknown>>((acc, c) => {
        acc[c.key] = row[c.key] ?? "";
        return acc;
      }, {}),
    );
  }

  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: rows.length + 1, column: columns.length } };
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.from(buf);
}

export type PdfOptions = {
  sheetName?: string;
  note?: string;
  /** Optional column that should be right-aligned, e.g. percentages. */
  numericKeys?: string[];
};

/** A4 portrait PDF: title, metadata line, striped table with page breaks. */
export async function buildPdfBuffer(
  title: string,
  columns: ExportColumn[],
  rows: ExportRow[],
  options: PdfOptions = {},
): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.setTitle(title);
  doc.setProducer("Maktab Davomat");

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 40;
  const usableWidth = pageWidth - margin * 2;

  const colWidths = columns.map((c) => {
    const ratio = c.width ?? 18;
    const totalRatio = columns.reduce((sum, col) => sum + (col.width ?? 18), 0);
    return usableWidth * (ratio / totalRatio);
  });

  const headerHeight = 26;
  const rowHeight = 20;
  const tableTop = 150;

  let page = doc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - 60;

  const drawHeader = (p: typeof page) => {
    p.drawText(title, { x: margin, y: pageHeight - 60, size: 17, font: bold, color: HEADER_BG });
    const subtitle = `${options.sheetName ?? "Hisobot"}  •  ${formatUzDate(today())}`;
    p.drawText(subtitle, { x: margin, y: pageHeight - 78, size: 9, font, color: LINE });
    if (options.note) {
      p.drawText(options.note, { x: margin, y: pageHeight - 92, size: 8, font, color: LINE });
    }
    p.drawLine({
      start: { x: margin, y: tableTop + headerHeight },
      end: { x: pageWidth - margin, y: tableTop + headerHeight },
      thickness: 0.8,
      color: HEADER_BG,
    });
  };
  const newPage = () => {
    page = doc.addPage([pageWidth, pageHeight]);
    drawHeader(page);
    y = tableTop;
  };

  drawHeader(page);
  y = tableTop;

  const drawTableHeader = () => {
    let x = margin;
    for (let i = 0; i < columns.length; i++) {
      page.drawText(columns[i].label, {
        x: x + 4,
        y: y + 8,
        size: 8.5,
        font: bold,
        color: rgb(1, 1, 1),
      });
      x += colWidths[i];
    }
    y -= headerHeight;
  };

  drawTableHeader();

  const drawRowBackground = (fill: typeof STRIPE_BG) => {
    page.drawRectangle({
      x: margin,
      y: y,
      width: usableWidth,
      height: rowHeight,
      color: fill,
    });
  };

  rows.forEach((row, index) => {
    if (y - rowHeight < 40) newPage();
    drawRowBackground(index % 2 === 0 ? STRIPE_BG : rgb(1, 1, 1));

    let x = margin;
    for (let i = 0; i < columns.length; i++) {
      const value = row[columns[i].key];
      const text = value === null || value === undefined ? "" : String(value);
      if (text.length > 0) {
        page.drawText(text, {
          x: x + 4,
          y: y + 6,
          size: 8,
          font,
          color: rgb(0.15, 0.18, 0.24),
        });
      }
      x += colWidths[i];
    }
    page.drawLine({
      start: { x: margin, y: y },
      end: { x: pageWidth - margin, y: y },
      thickness: 0.3,
      color: LINE,
    });
    y -= rowHeight;
  });

  if (rows.length === 0) {
    page.drawText("Ma’lumot topilmadi", { x: margin, y: y - 6, size: 9, font, color: LINE });
  }

  // Footer with page numbers.
  const pages = doc.getPages();
  for (let i = 0; i < pages.length; i++) {
    pages[i].drawText(`${i + 1} / ${pages.length}`, {
      x: pageWidth - margin - 30,
      y: 24,
      size: 8,
      font,
      color: LINE,
    });
    pages[i].drawText("Maktab Davomat", { x: margin, y: 24, size: 8, font, color: LINE });
  }

  const bytes = await doc.save();
  return Buffer.from(bytes);
}

/** Content-Disposition friendly ASCII-ish filename for exports. */
export function exportFilename(base: string, ext: "csv" | "xlsx" | "pdf"): string {
  const day = formatUzDate(today()).replace(/[^0-9a-z-]/gi, "-");
  return `${base}-${day}.${ext}`;
}

export type ExportFormat = "csv" | "xlsx" | "pdf";

export function contentTypeFor(format: ExportFormat): string {
  switch (format) {
    case "csv":
      return "text/csv; charset=utf-8";
    case "xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case "pdf":
      return "application/pdf";
  }
}

export { formatUzDateTime };