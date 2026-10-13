"use client";

import * as React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { WEEKDAYS } from "@/lib/constants";
import { cn } from "@/lib/utils";

/**
 * ISO-weekday multi-select. Used for both a class's individual study days and
 * the school's duty days, because the two settings are deliberately separate.
 */
export function WeekdayPicker({
  value,
  onChange,
  disabled,
  className,
  idPrefix = "weekday",
}: {
  value: number[];
  onChange: (next: number[]) => void;
  disabled?: boolean;
  className?: string;
  idPrefix?: string;
}) {
  const toggle = (day: number, checked: boolean) => {
    const set = new Set(value);
    if (checked) set.add(day);
    else set.delete(day);
    onChange([...set].sort((a, b) => a - b));
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {WEEKDAYS.map((day) => {
          const id = `${idPrefix}-${day.value}`;
          const checked = value.includes(day.value);
          return (
            <label
              key={day.value}
              htmlFor={id}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
                checked ? "border-primary/40 bg-primary/5" : "border-input hover:bg-accent",
                disabled && "cursor-not-allowed opacity-60",
              )}
            >
              <Checkbox
                id={id}
                checked={checked}
                disabled={disabled}
                onCheckedChange={(state) => toggle(day.value, state === true)}
              />
              <span className="truncate">{day.label}</span>
            </label>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        Haftalik o‘qish kunlari: <span className="font-medium text-foreground">{value.length} kun</span>
      </p>
    </div>
  );
}
