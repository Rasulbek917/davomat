"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type PaginationProps = {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  className?: string;
};

function rangeAround(page: number, last: number): number[] {
  const start = Math.max(1, page - 2);
  const end = Math.min(last, start + 4);
  const out: number[] = [];
  for (let i = start; i <= end; i++) out.push(i);
  return out;
}

export function Pagination({ page, pageSize, total, onPageChange, className }: PaginationProps) {
  const last = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, last);
  const pages = rangeAround(current, last);

  if (total === 0) return null;

  return (
    <nav className={cn("flex items-center justify-between gap-4", className)} aria-label="Sahifalash">
      <p className="text-xs text-muted-foreground">
        Jami <span className="font-medium text-foreground">{total}</span> ta yozuv ·{" "}
        {((current - 1) * pageSize + 1).toLocaleString()}–{Math.min(current * pageSize, total).toLocaleString()}
      </p>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => onPageChange(current - 1)}
          disabled={current <= 1}
          aria-label="Oldingi sahifa"
        >
          <ChevronLeft />
        </Button>
        {pages.map((p) => (
          <Button
            key={p}
            variant={p === current ? "default" : "ghost"}
            size="icon-sm"
            onClick={() => onPageChange(p)}
            aria-current={p === current ? "page" : undefined}
          >
            {p}
          </Button>
        ))}
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => onPageChange(current + 1)}
          disabled={current >= last}
          aria-label="Keyingi sahifa"
        >
          <ChevronRight />
        </Button>
      </div>
    </nav>
  );
}