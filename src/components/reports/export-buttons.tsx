"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { FileSpreadsheet, FileText, Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Download buttons for the report export endpoint. The current period selection
 * is carried over from the URL so an export always matches what is on screen.
 */
export function ReportExportButtons({
  scope,
  classId,
  studentId,
  schoolId,
  disabled,
}: {
  scope: "school" | "class" | "student" | "platform";
  classId?: string;
  studentId?: string;
  schoolId?: string;
  disabled?: boolean;
}) {
  const searchParams = useSearchParams();

  const url = React.useCallback(
    (format: "csv" | "xlsx" | "pdf") => {
      const params = new URLSearchParams();
      params.set("scope", scope);
      params.set("format", format);
      const period = searchParams.get("period");
      if (period) params.set("period", period);
      const from = searchParams.get("from");
      if (from) params.set("from", from);
      const to = searchParams.get("to");
      if (to) params.set("to", to);
      if (classId) params.set("classId", classId);
      if (studentId) params.set("studentId", studentId);
      if (schoolId) params.set("schoolId", schoolId);
      return `/api/reports/export?${params.toString()}`;
    },
    [scope, classId, studentId, schoolId, searchParams],
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button asChild variant="outline" size="sm" disabled={disabled}>
        <a href={url("xlsx")} download>
          <FileSpreadsheet /> Excel
        </a>
      </Button>
      <Button asChild variant="outline" size="sm" disabled={disabled}>
        <a href={url("csv")} download>
          <Table2 /> CSV
        </a>
      </Button>
      <Button asChild variant="outline" size="sm" disabled={disabled}>
        <a href={url("pdf")} download>
          <FileText /> PDF
        </a>
      </Button>
    </div>
  );
}
