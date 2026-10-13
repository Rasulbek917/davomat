import * as React from "react";
import { cn } from "@/lib/utils";

const TONES = {
  default: "text-foreground",
  primary: "text-primary",
  success: "text-success",
  warning: "text-warning dark:text-warning",
  destructive: "text-destructive",
  info: "text-info",
} as const;

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "default",
  trend,
  trendLabel,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  tone?: keyof typeof TONES;
  trend?: number | null;
  trendLabel?: string;
  className?: string;
}) {
  const Icon = icon;
  return (
    <div className={cn("rounded-xl border bg-card p-5 shadow-sm", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold tracking-tight">{value}</p>
        </div>
        {Icon && (
          <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg bg-muted", TONES[tone])}>
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>
      {(trend !== undefined || trendLabel) && (
        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          {trend !== null && trend !== undefined && (
            <span
              className={cn(
                "font-medium",
                trend > 0 && "text-success",
                trend < 0 && "text-destructive",
                trend === 0 && "text-muted-foreground",
              )}
            >
              {trend > 0 ? "+" : ""}
              {trend}%
            </span>
          )}
          {trendLabel && <span>{trendLabel}</span>}
        </div>
      )}
      {hint && <p className="mt-2 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}