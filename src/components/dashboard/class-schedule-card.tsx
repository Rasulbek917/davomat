"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, History, Save } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { WeekdayPicker } from "@/components/ui/weekday-picker";
import { useAction } from "@/hooks/use-action";
import { saveClassScheduleAction } from "@/lib/actions/classes";
import { WEEKDAY_LABEL } from "@/lib/constants";
import { formatUzDate, today, formatDateOnly } from "@/lib/date";

export type ScheduleVersionRow = {
  id: string;
  effectiveFrom: string;
  weekdays: number[];
  note: string | null;
};

export function ClassScheduleCard({
  classId,
  currentWeekdays,
  versions,
  canManage,
}: {
  classId: string;
  currentWeekdays: number[];
  versions: ScheduleVersionRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const { pending, error, run } = useAction();
  const [weekdays, setWeekdays] = React.useState<number[]>(
    currentWeekdays.length > 0 ? currentWeekdays : [1, 2, 3, 4, 5],
  );
  const [effectiveFrom, setEffectiveFrom] = React.useState(() => formatDateOnly(today()));
  const [note, setNote] = React.useState("");
  const [done, setDone] = React.useState(false);

  const daysLabel = (days: number[]) =>
    days
      .slice()
      .sort((a, b) => a - b)
      .map((d) => WEEKDAY_LABEL[d])
      .join(", ");

  const save = () => {
    setDone(false);
    run(() => saveClassScheduleAction({ classId, weekdays, effectiveFrom, note: note || undefined }), {
      onSuccess: () => {
        setDone(true);
        setNote("");
        router.refresh();
      },
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
        <CalendarDays className="h-4 w-4 text-muted-foreground" />
        <span className="text-muted-foreground">Amaldagi o‘qish kunlari:</span>
        <span className="font-medium">{daysLabel(currentWeekdays).replaceAll(",", ", ")}</span>
        <Badge variant="secondary" className="ml-auto">
          {currentWeekdays.length} kun
        </Badge>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription className="text-foreground">{error}</AlertDescription>
        </Alert>
      )}
      {done && (
        <Alert variant="success">
          <AlertTitle>Jadval saqlandi</AlertTitle>
          <AlertDescription>Yangi o‘qish kunlari jadvali {effectiveFrom} sanasidan amal qiladi.</AlertDescription>
        </Alert>
      )}

      {canManage && (
        <div className="space-y-4 rounded-lg border p-4">
          <div>
            <p className="text-sm font-medium">Yangi jadval versiyasi</p>
            <p className="text-xs text-muted-foreground">
              O‘zgarish belgilangan sanadan kuchga kiradi; oldingi davr hisobotlari o‘zgarmaydi.
            </p>
          </div>
          <WeekdayPicker value={weekdays} onChange={setWeekdays} disabled={pending} idPrefix="class-sched" />
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Amal qilish sanasi" htmlFor="schedFrom" required>
              <Input
                id="schedFrom"
                type="date"
                value={effectiveFrom}
                onChange={(e) => setEffectiveFrom(e.target.value)}
              />
            </FormField>
            <FormField label="Izoh" htmlFor="schedNote">
              <Input
                id="schedNote"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Masalan: qishki jadval"
              />
            </FormField>
          </div>
          <div className="flex justify-end">
            <Button onClick={save} disabled={pending || weekdays.length === 0}>
              <Save /> {pending ? "Saqlanmoqda..." : "Jadvalni saqlash"}
            </Button>
          </div>
        </div>
      )}

      {versions.length > 0 && (
        <div className="rounded-lg border">
          <div className="flex items-center gap-2 border-b px-4 py-2 text-sm font-medium">
            <History className="h-4 w-4 text-muted-foreground" /> Jadval tarixi
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Amal qilish sanasi</TableHead>
                <TableHead>Kunlar</TableHead>
                <TableHead>Izoh</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {versions.map((version) => (
                <TableRow key={version.id}>
                  <TableCell className="whitespace-nowrap font-medium">
                    {formatUzDate(new Date(`${version.effectiveFrom}T00:00:00.000Z`))}
                  </TableCell>
                  <TableCell className="text-sm">{daysLabel(version.weekdays)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{version.note ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
