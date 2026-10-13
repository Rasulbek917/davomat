import * as React from "react";
import type { AttendanceStatus } from "@prisma/client";
import { ATTENDANCE_CHIP_CLASS, ATTENDANCE_SHORT_LABEL } from "@/lib/constants";
import { cn } from "@/lib/utils";

/** Coloured chip for an attendance status; used across tables and registers. */
export function AttendanceChip({
  status,
  className,
}: {
  status: AttendanceStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        ATTENDANCE_CHIP_CLASS[status],
        className,
      )}
    >
      {ATTENDANCE_SHORT_LABEL[status]}
    </span>
  );
}