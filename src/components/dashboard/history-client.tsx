"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Eye, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAction } from "@/hooks/use-action";
import { reopenAttendanceSessionAction } from "@/lib/actions/attendance";
import type { SessionListItem } from "@/lib/attendance/queries";
import { SESSION_SLOT_LABEL } from "@/lib/constants";

export type HistoryClassOption = { id: string; label: string };
export type HistorySession = Omit<SessionListItem, "date"> & { dateLabel: string; dateIso: string };

export function HistoryClient({
  sessions,
  classes,
  classId,
  status,
  canCorrect,
}: {
  sessions: HistorySession[];
  classes: HistoryClassOption[];
  classId: string;
  status: string;
  canCorrect: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { pending, error, run } = useAction();

  const push = React.useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "") params.delete(key);
        else params.set(key, value);
      }
      router.push(`${pathname}?${params.toString()}`);
    },
    [pathname, router, searchParams],
  );

  const reopen = (sessionId: string) => {
    run(() => reopenAttendanceSessionAction({ sessionId }), {
      onSuccess: () => router.refresh(),
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={classId || "all"} onValueChange={(value) => push({ classId: value === "all" ? null : value })}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Barcha sinflar" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Barcha sinflar</SelectItem>
            {classes.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status || "all"} onValueChange={(value) => push({ status: value === "all" ? null : value })}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Barcha holatlar" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Barcha holatlar</SelectItem>
            <SelectItem value="SUBMITTED">Tasdiqlangan</SelectItem>
            <SelectItem value="DRAFT">Qoralama</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription className="text-foreground">{error}</AlertDescription>
        </Alert>
      )}

      {sessions.length === 0 ? (
        <EmptyState
          icon={RotateCcw}
          title="Davomat tarixi bo‘sh"
          description="Tanlangan davr va filtrlar bo‘yicha davomat yozuvlari topilmadi."
        />
      ) : (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sinf</TableHead>
                <TableHead>Sana</TableHead>
                <TableHead>Smena</TableHead>
                <TableHead>Holat</TableHead>
                <TableHead className="text-right">Keldi</TableHead>
                <TableHead>Kim belgilagan</TableHead>
                <TableHead className="w-32" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.map((session) => (
                <TableRow key={session.id}>
                  <TableCell className="font-medium">{session.className}</TableCell>
                  <TableCell className="text-muted-foreground">{session.dateLabel}</TableCell>
                  <TableCell className="text-muted-foreground">{SESSION_SLOT_LABEL[session.slot]}</TableCell>
                  <TableCell>
                    {session.status === "SUBMITTED" ? (
                      <Badge variant="success">Tasdiqlangan</Badge>
                    ) : (
                      <Badge variant="warning">Qoralama</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {session.presentCount}/{session.recordCount}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{session.recordedByName ?? "—"}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button asChild variant="ghost" size="icon-sm" aria-label="Ko‘rish">
                        <Link href={`/dashboard/attendance?classId=${session.classId}&date=${session.dateIso}&slot=${session.slot}`}>
                          <Eye />
                        </Link>
                      </Button>
                      {session.status === "SUBMITTED" && canCorrect && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={pending}
                          onClick={() => reopen(session.id)}
                        >
                          <RotateCcw /> Qayta ochish
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
