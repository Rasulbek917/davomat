"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarRange } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PERIOD_PRESETS, type PeriodPreset } from "@/lib/date";

/**
 * URL-driven period selector. Keeps the selected range in the query string so
 * pages stay server-rendered and shareable.
 */
export function PeriodFilter({
  preset,
  from,
  to,
  className,
}: {
  preset: PeriodPreset;
  from: string;
  to: string;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const push = React.useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "") params.delete(key);
        else params.set(key, value);
      }
      params.delete("page");
      router.push(`${pathname}?${params.toString()}`);
    },
    [pathname, router, searchParams],
  );

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={preset}
          onValueChange={(value) => {
            if (value === "custom") {
              push({ period: "custom", from, to });
            } else {
              push({ period: value, from: null, to: null });
            }
          }}
        >
          <SelectTrigger className="w-[190px]">
            <CalendarRange className="mr-1 h-4 w-4 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIOD_PRESETS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {preset === "custom" && (
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="date"
              value={from}
              max={to}
              className="w-[150px]"
              onChange={(event) => push({ period: "custom", from: event.target.value, to })}
            />
            <span className="text-muted-foreground">—</span>
            <Input
              type="date"
              value={to}
              min={from}
              className="w-[150px]"
              onChange={(event) => push({ period: "custom", from, to: event.target.value })}
            />
          </div>
        )}

        <Button variant="ghost" size="sm" onClick={() => router.refresh()}>
          Yangilash
        </Button>
      </div>
    </div>
  );
}
