"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CalendarDays, Plus, Sun, Trash2, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { FormField } from "@/components/ui/form-field";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AppearanceSettings } from "@/components/settings/appearance-settings";
import { useAction } from "@/hooks/use-action";
import { removeCalendarDayAction, setCalendarDayAction } from "@/lib/actions/calendar";

export type CalendarRow = {
  date: string; // ISO YYYY-MM-DD
  dateLabel: string;
  isWorkingDay: boolean;
  note: string | null;
};

type ThemeChoice = "LIGHT" | "DARK" | "SYSTEM";
type Slot = "FULL_DAY" | "MORNING" | "AFTERNOON";

export function SettingsClient({
  initialTheme,
  attendanceSlot,
  rows,
  canManageCalendar,
}: {
  initialTheme: ThemeChoice;
  attendanceSlot: Slot;
  rows: CalendarRow[];
  canManageCalendar: boolean;
}) {
  return (
    <Tabs defaultValue="appearance" className="space-y-6">
      <TabsList>
        <TabsTrigger value="appearance" className="gap-2">
          <Sun className="h-4 w-4" /> Ko‘rinish
        </TabsTrigger>
        <TabsTrigger value="calendar" className="gap-2">
          <CalendarDays className="h-4 w-4" /> O‘quv kalendari
        </TabsTrigger>
        <TabsTrigger value="account" className="gap-2">
          <UserRound className="h-4 w-4" /> Hisob
        </TabsTrigger>
      </TabsList>

      <TabsContent value="appearance" className="space-y-6">
        <AppearanceSettings initialTheme={initialTheme} attendanceSlot={attendanceSlot} />
      </TabsContent>

      <TabsContent value="calendar" className="space-y-6">
        <CalendarSection rows={rows} canManage={canManageCalendar} />
      </TabsContent>

      <TabsContent value="account" className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Hisob sozlamalari</CardTitle>
            <CardDescription>Shaxsiy ma’lumotlar, parol va profil rasmi.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href="/dashboard/profile">
                <UserRound /> Profilga o‘tish
              </Link>
            </Button>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}

// ---------------------------------------------------------------------------
// School calendar
// ---------------------------------------------------------------------------

function CalendarSection({ rows, canManage }: { rows: CalendarRow[]; canManage: boolean }) {
  const router = useRouter();
  const addAction = useAction();
  const [date, setDate] = React.useState("");
  const [isWorkingDay, setIsWorkingDay] = React.useState(false);
  const [note, setNote] = React.useState("");

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    addAction.run(() => setCalendarDayAction({ date, isWorkingDay, note }), {
      onSuccess: () => {
        setDate("");
        setNote("");
        setIsWorkingDay(false);
        router.refresh();
      },
    });
  };

  return (
    <>
      <Alert variant="info">
        <CalendarDays />
        <AlertDescription className="text-foreground">
          Standart holatda dushanba–juma ish kunlari hisoblanadi. Bayram, ta’til yoki qo‘shimcha ish kunlarini shu yerda
          belgilang — haftalik hisobotlar shu taqvimga tayanadi.
        </AlertDescription>
      </Alert>

      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle>Sanani belgilash</CardTitle>
            <CardDescription>Tanlangan sanani ish kuni yoki dam olish kuni sifatida belgilang.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              {addAction.error && (
                <Alert variant="destructive">
                  <AlertDescription className="text-foreground">{addAction.error}</AlertDescription>
                </Alert>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Sana" htmlFor="calDate" required error={addAction.fieldErrors["date"]}>
                  <Input
                    id="calDate"
                    type="date"
                    value={date}
                    max="2100-12-31"
                    onChange={(e) => setDate(e.target.value)}
                    required
                  />
                </FormField>
                <FormField label="Izoh" htmlFor="calNote" error={addAction.fieldErrors["note"]} hint="Masalan: Mustaqillik kuni">
                  <Input id="calNote" value={note} onChange={(e) => setNote(e.target.value)} />
                </FormField>
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <Label htmlFor="calWorking">Ish kuni</Label>
                  <p className="text-xs text-muted-foreground">
                    Yoqilsa — ish kuni, o‘chirilsa — dam olish kuni sifatida belgilanadi.
                  </p>
                </div>
                <Switch id="calWorking" checked={isWorkingDay} onCheckedChange={setIsWorkingDay} />
              </div>
              <div className="flex justify-end">
                <Button type="submit" disabled={addAction.pending || !date}>
                  {addAction.pending ? "Saqlanmoqda..." : (
                    <>
                      <Plus /> Saqlash
                    </>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Belgilangan sanalar</CardTitle>
          <CardDescription>Standart qoidadan farq qiluvchi sanalar ro‘yxati ({rows.length} ta).</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {rows.length === 0 ? (
            <div className="px-6">
              <EmptyState
                icon={CalendarDays}
                title="O‘zgartirish kiritilmagan"
                description="Hozircha bayram yoki qo‘shimcha ish kuni belgilanmagan. Standart dushanba–juma qoidasi amal qiladi."
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sana</TableHead>
                  <TableHead>Holat</TableHead>
                  <TableHead>Izoh</TableHead>
                  {canManage && <TableHead className="w-16" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <CalendarTableRow key={row.date} row={row} canManage={canManage} onChanged={() => router.refresh()} />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function CalendarTableRow({
  row,
  canManage,
  onChanged,
}: {
  row: CalendarRow;
  canManage: boolean;
  onChanged: () => void;
}) {
  const action = useAction();

  const remove = () => {
    if (!window.confirm(`${row.date} sanasidagi o‘zgartirishni olib tashlaysizmi?`)) return;
    action.run(() => removeCalendarDayAction({ date: row.date }), { onSuccess: onChanged });
  };

  return (
    <TableRow>
      <TableCell className="font-medium">{row.dateLabel}</TableCell>
      <TableCell>
        {row.isWorkingDay ? <Badge variant="success">Ish kuni</Badge> : <Badge variant="warning">Dam olish</Badge>}
      </TableCell>
      <TableCell className="text-muted-foreground">{row.note ?? "—"}</TableCell>
      {canManage && (
        <TableCell>
          <div className="flex justify-end">
            <Button variant="ghost" size="icon-sm" aria-label="Olib tashlash" onClick={remove} disabled={action.pending}>
              <Trash2 />
            </Button>
          </div>
        </TableCell>
      )}
    </TableRow>
  );
}
