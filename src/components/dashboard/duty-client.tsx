"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Eye,
  Plus,
  RefreshCw,
  Scale,
  Settings2,
  Sparkles,
  UserMinus,
  Users,
  Wand2,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatCard } from "@/components/ui/stat-card";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { WeekdayPicker } from "@/components/ui/weekday-picker";
import { useAction } from "@/hooks/use-action";
import {
  DUTY_PER_DAY_OPTIONS,
  DUTY_STATUS_LABEL,
  DUTY_STATUS_VARIANT,
  WEEKDAY_LABEL,
  DEFAULT_WORKING_DAYS,
} from "@/lib/constants";
import { addMonths, formatDateOnly, formatUzDate, formatUzMonthYear, today } from "@/lib/date";
import {
  assignDutyAction,
  cancelDutyAction,
  generateDutyScheduleAction,
  previewDutyScheduleAction,
  replaceDutyAction,
  saveDutySettingsAction,
  setDutyStatusAction,
  type DutyGenerateResult,
  type DutyPlanPreview,
} from "@/lib/actions/duty";
import type { DutyAssignmentRow, DutyDashboard } from "@/lib/duty/queries";

export type DutyEligibilityRow = {
  teacherId: string;
  isEligible: boolean;
  unavailableFrom: string | null;
  unavailableTo: string | null;
  note: string | null;
};

const ALL_TEACHERS = "__all__";

function monthCells(year: number, month: number): (string | null)[] {
  const first = new Date(Date.UTC(year, month, 1));
  const offset = (first.getUTCDay() + 6) % 7; // Monday-first
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < offset; i += 1) cells.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) {
    cells.push(`${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function DutyClient({
  canManage,
  currentUserId,
  currentUserName,
  todayIso,
  dashboard,
  assignments,
  allAssignments,
  eligibility,
}: {
  canManage: boolean;
  currentUserId: string;
  currentUserName: string;
  todayIso: string;
  dashboard: DutyDashboard;
  assignments: DutyAssignmentRow[];
  allAssignments: DutyAssignmentRow[];
  eligibility: DutyEligibilityRow[];
}) {
  const router = useRouter();
  const settings = dashboard.settings;
  const scheduleRows = canManage ? allAssignments : assignments;

  const byDate = React.useMemo(() => {
    const map = new Map<string, DutyAssignmentRow[]>();
    for (const row of scheduleRows) {
      const list = map.get(row.date) ?? [];
      list.push(row);
      map.set(row.date, list);
    }
    return map;
  }, [scheduleRows]);

  const teacherLabel = React.useMemo(() => {
    const map = new Map(dashboard.teacherOptions.map((t) => [t.id, t.label]));
    return (id: string) => map.get(id) ?? id;
  }, [dashboard.teacherOptions]);

  const [cursor, setCursor] = React.useState(() => {
    const now = today();
    return { year: now.getUTCFullYear(), month: now.getUTCMonth() };
  });
  const [tab, setTab] = React.useState("overview");

  const monthIso = `${cursor.year}-${String(cursor.month + 1).padStart(2, "0")}`;
  const monthAssignments = scheduleRows.filter((row) => row.date.startsWith(monthIso));

  // ---- Teacher (read-only) view -------------------------------------------
  if (!canManage) {
    const mine = assignments.filter((row) => row.teacherId === currentUserId && row.status !== "CANCELLED");
    const upcoming = mine.filter((row) => row.date >= todayIso);
    const past = mine.filter((row) => row.date < todayIso).reverse();
    const todayRows = mine.filter((row) => row.date === todayIso);

    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard
            label="Bugungi navbatchilik"
            value={todayRows.length > 0 ? "Ha" : "Yo‘q"}
            icon={CalendarDays}
            tone={todayRows.length > 0 ? "success" : "default"}
            hint={todayRows.length > 0 ? "Siz bugun navbatchisiz." : "Bugun navbatchi emassiz."}
          />
          <StatCard label="Kelgusi navbatchiliklar" value={upcoming.length} icon={ClipboardList} tone="info" />
          <StatCard label="O‘tgan navbatchiliklar" value={past.length} icon={CheckCircle2} />
        </div>

        <div className="rounded-xl border bg-card p-5">
          <h3 className="mb-3 text-sm font-semibold">Kelgusi navbatchiliklar ({currentUserName})</h3>
          {upcoming.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title="Kelgusi navbatchilik yo‘q"
              description="Sizga hali navbatchilik tayinlanmagan."
            />
          ) : (
            <ul className="space-y-2">
              {upcoming.map((row) => (
                <li key={row.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                  <span className="font-medium">{formatUzDate(new Date(`${row.date}T00:00:00.000Z`))}</span>
                  <Badge variant={DUTY_STATUS_VARIANT[row.status]}>{DUTY_STATUS_LABEL[row.status]}</Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  // ---- Manager view --------------------------------------------------------
  return (
    <div className="space-y-6">
      {!settings && (
        <Alert variant="info">
          <AlertTitle>Navbatchilik sozlanmagan</AlertTitle>
          <AlertDescription>
            Boshlash uchun “Sozlamalar” bo‘limida navbatchilik davri, kunlari va qatnashadigan o‘qituvchilarni
            belgilang, so‘ng “Avtomatik jadval” orqali jadval tuzing.
          </AlertDescription>
        </Alert>
      )}

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="flex h-auto flex-wrap justify-start gap-1">
          <TabsTrigger value="overview">Umumiy</TabsTrigger>
          <TabsTrigger value="calendar">Kalendar</TabsTrigger>
          <TabsTrigger value="schedule">Ro‘yxat</TabsTrigger>
          <TabsTrigger value="generate">Avtomatik jadval</TabsTrigger>
          <TabsTrigger value="fairness">Adolat</TabsTrigger>
          <TabsTrigger value="settings">Sozlamalar</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <OverviewTab dashboard={dashboard} teacherLabel={teacherLabel} todayIso={todayIso} />
        </TabsContent>

        <TabsContent value="calendar" className="space-y-4">
          <div className="rounded-xl border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <Button
                variant="outline"
                size="icon-sm"
                onClick={() =>
                  setCursor((c) => {
                    const d = addMonths(new Date(Date.UTC(c.year, c.month, 1)), -1);
                    return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
                  })
                }
                aria-label="Oldingi oy"
              >
                <ChevronLeft />
              </Button>
              <p className="text-sm font-semibold">
                {formatUzMonthYear(new Date(Date.UTC(cursor.year, cursor.month, 1)))}
              </p>
              <Button
                variant="outline"
                size="icon-sm"
                onClick={() =>
                  setCursor((c) => {
                    const d = addMonths(new Date(Date.UTC(c.year, c.month, 1)), 1);
                    return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
                  })
                }
                aria-label="Keyingi oy"
              >
                <ChevronRight />
              </Button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
              {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                <div key={d} className="py-1 font-medium">
                  {WEEKDAY_LABEL[d]?.slice(0, 3)}
                </div>
              ))}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {monthCells(cursor.year, cursor.month).map((iso, index) => {
                if (!iso) return <div key={`empty-${index}`} className="min-h-20 rounded-lg" />;
                const rows = (byDate.get(iso) ?? []).filter((r) => r.status !== "CANCELLED");
                const isToday = iso === todayIso;
                return (
                  <div
                    key={iso}
                    className={`min-h-20 rounded-lg border p-1.5 text-left ${
                      isToday ? "border-primary/60 bg-primary/5" : "bg-background"
                    }`}
                  >
                    <div className={`text-xs font-medium ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                      {Number(iso.slice(8, 10))}
                    </div>
                    <div className="mt-1 space-y-1">
                      {rows.map((row) => (
                        <div
                          key={row.id}
                          className="truncate rounded bg-muted px-1 py-0.5 text-[11px] leading-tight"
                          title={row.teacherName}
                        >
                          {row.teacherName}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="schedule" className="space-y-4">
          <ScheduleTab
            rows={monthAssignments}
            byDate={byDate}
            teacherOptions={dashboard.teacherOptions}
            settingsPerDay={settings?.perDay ?? 1}
          />
        </TabsContent>

        <TabsContent value="generate" className="space-y-4">
          <GenerateTab
            hasSettings={Boolean(settings)}
            perDay={settings?.perDay ?? 1}
            onDone={() => router.refresh()}
            onConfigure={() => setTab("settings")}
          />
        </TabsContent>

        <TabsContent value="fairness" className="space-y-4">
          <FairnessTab
            fairness={dashboard.fairness}
            consecutivePairs={dashboard.consecutivePairs}
            teacherOptions={dashboard.teacherOptions}
          />
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <SettingsTab
            dashboard={dashboard}
            eligibility={eligibility}
            onSaved={() => router.refresh()}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

function OverviewTab({
  dashboard,
  teacherLabel,
  todayIso,
}: {
  dashboard: DutyDashboard;
  teacherLabel: (id: string) => string;
  todayIso: string;
}) {
  const settings = dashboard.settings;
  const dutyDaysLabel = (settings?.weekdays ?? DEFAULT_WORKING_DAYS)
    .map((d) => WEEKDAY_LABEL[d]?.slice(0, 2))
    .join(", ");

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Bugungi navbatchi"
          value={dashboard.todayAssignments.length}
          icon={CalendarDays}
          tone="primary"
          hint={dashboard.todayAssignments.map((a) => a.teacherName).join(", ") || "Tayinlanmagan"}
        />
        <StatCard
          label="Keyingi navbatchilik"
          value={dashboard.nextDate ? formatUzDate(new Date(`${dashboard.nextDate}T00:00:00.000Z`)) : "—"}
          icon={ClipboardList}
          tone="info"
          hint={
            dashboard.nextAssignments.length > 0
              ? dashboard.nextAssignments.map((a) => a.teacherName).join(", ")
              : "Rejalashtirilmagan"
          }
        />
        <StatCard label="Shu haftada" value={dashboard.weekCount} icon={Users} hint="Tayinlovlar soni" />
        <StatCard label="Shu oyda" value={dashboard.monthCount} icon={Users} hint="Tayinlovlar soni" />
      </div>

      {settings ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border bg-card p-5">
            <h3 className="mb-3 text-sm font-semibold">Sozlama qisqacha</h3>
            <dl className="space-y-2 text-sm">
              <Row label="Kuniga navbatchi" value={`${settings.perDay} nafar`} />
              <Row label="Navbatchilik kunlari" value={`${settings.weekdays.length} kun (${dutyDaysLabel})`} />
              <Row
                label="Davr"
                value={`${settings.startDate ?? "—"} ${settings.endDate ? `– ${settings.endDate}` : ""}`}
              />
              <Row label="Holat" value={settings.isActive ? "Faol" : "Nofaol"} />
            </dl>
          </div>
          <div className="rounded-xl border bg-card p-5">
            <h3 className="mb-3 text-sm font-semibold">Diqqat talab qiladi</h3>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center justify-between">
                <span className="text-muted-foreground">Jadval tuzilmagan kunlar (60 kun)</span>
                <Badge variant={dashboard.unplannedDates.length > 0 ? "warning" : "success"}>
                  {dashboard.unplannedDates.length}
                </Badge>
              </li>
              <li className="flex items-center justify-between">
                <span className="text-muted-foreground">Ketma-ket navbatchiliklar</span>
                <Badge variant={dashboard.consecutivePairs > 0 ? "warning" : "success"}>
                  {dashboard.consecutivePairs}
                </Badge>
              </li>
              <li className="flex items-center justify-between">
                <span className="text-muted-foreground">Navbatchilikka biriktirilgan</span>
                <Badge variant="secondary">{dashboard.teacherOptions.length} o‘qituvchi</Badge>
              </li>
            </ul>
          </div>
        </div>
      ) : null}

      {dashboard.todayAssignments.length > 0 && (
        <div className="rounded-xl border bg-card p-5">
          <h3 className="mb-3 text-sm font-semibold">
            Bugun navbatchi ({formatUzDate(new Date(`${todayIso}T00:00:00.000Z`))})
          </h3>
          <div className="flex flex-wrap gap-2">
            {dashboard.todayAssignments.map((row) => (
              <Badge key={row.id} variant="secondary" className="px-3 py-1 text-sm">
                {row.teacherName || teacherLabel(row.teacherId)}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Schedule list
// ---------------------------------------------------------------------------

function ScheduleTab({
  rows,
  byDate,
  teacherOptions,
  settingsPerDay,
}: {
  rows: DutyAssignmentRow[];
  byDate: Map<string, DutyAssignmentRow[]>;
  teacherOptions: { id: string; label: string }[];
  settingsPerDay: number;
}) {
  const router = useRouter();
  const { pending, error, run, reset } = useAction();
  const [replaceFor, setReplaceFor] = React.useState<DutyAssignmentRow | null>(null);
  const [cancelFor, setCancelFor] = React.useState<DutyAssignmentRow | null>(null);
  const [assignDate, setAssignDate] = React.useState("");
  const [replaceTeacher, setReplaceTeacher] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [newTeacherIds, setNewTeacherIds] = React.useState<string[]>([]);

  const dates = React.useMemo(() => [...byDate.keys()].sort((a, b) => b.localeCompare(a)), [byDate]);
  const [filterDate, setFilterDate] = React.useState<string>(ALL_TEACHERS);
  const visibleDates = filterDate === ALL_TEACHERS ? dates : dates.filter((d) => d === filterDate);

  const noAssignments = rows.length === 0;

  const doReplace = () => {
    if (!replaceFor) return;
    run(() => replaceDutyAction({ assignmentId: replaceFor.id, teacherId: replaceTeacher, reason }), {
      onSuccess: () => {
        setReplaceFor(null);
        setReplaceTeacher("");
        setReason("");
        router.refresh();
      },
    });
  };

  const doCancel = () => {
    if (!cancelFor) return;
    run(() => cancelDutyAction({ assignmentId: cancelFor.id, reason }), {
      onSuccess: () => {
        setCancelFor(null);
        setReason("");
        router.refresh();
      },
    });
  };

  const doStatus = (row: DutyAssignmentRow, status: "PLANNED" | "COMPLETED") => {
    run(() => setDutyStatusAction({ assignmentId: row.id, status }), { onSuccess: () => router.refresh() });
  };

  const doAssign = () => {
    run(() => assignDutyAction({ date: assignDate, teacherIds: newTeacherIds }), {
      onSuccess: () => {
        setAssignDate("");
        setNewTeacherIds([]);
        reset();
        router.refresh();
      },
    });
  };

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription className="text-foreground">{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Label className="text-sm">Sana bo‘yicha:</Label>
          <Select value={filterDate} onValueChange={setFilterDate}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_TEACHERS}>Barcha sanalar</SelectItem>
              {dates.map((d) => (
                <SelectItem key={d} value={d}>
                  {formatUzDate(new Date(`${d}T00:00:00.000Z`))}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            reset();
            setAssignDate(todayIsoValue());
            setNewTeacherIds([]);
          }}
        >
          <Plus /> Navbatchi qo‘shish
        </Button>
      </div>

      {noAssignments ? (
        <EmptyState
          icon={ClipboardList}
          title="Navbatchilik yo‘q"
          description="“Avtomatik jadval” orqali jadval tuzing yoki qo‘lda navbatchi qo‘shing."
        />
      ) : (
        <div className="space-y-3">
          {visibleDates.map((date) => {
            const list = (byDate.get(date) ?? []).sort((a, b) => a.slotIndex - b.slotIndex);
            return (
              <div key={date} className="rounded-xl border bg-card">
                <div className="flex items-center justify-between border-b px-4 py-2">
                  <p className="text-sm font-semibold">
                    {formatUzDate(new Date(`${date}T00:00:00.000Z`))}
                    {date === todayIsoValue() && <Badge className="ml-2" variant="info">Bugun</Badge>}
                  </p>
                  <span className="text-xs text-muted-foreground">
                    {list.filter((r) => r.status !== "CANCELLED").length} / {settingsPerDay} tayinlangan
                  </span>
                </div>
                <ul className="divide-y">
                  {list.map((row) => (
                    <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{row.teacherName}</span>
                        <Badge variant={DUTY_STATUS_VARIANT[row.status]}>{DUTY_STATUS_LABEL[row.status]}</Badge>
                        {row.originalTeacherName && (
                          <span className="text-xs text-muted-foreground">
                            (avval: {row.originalTeacherName})
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-1">
                        {row.status !== "CANCELLED" && (
                          <>
                            {row.status === "COMPLETED" ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={pending}
                                onClick={() => doStatus(row, "PLANNED")}
                              >
                                <RefreshCw /> Qaytarish
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={pending}
                                onClick={() => doStatus(row, "COMPLETED")}
                              >
                                <CheckCircle2 /> Bajarildi
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                reset();
                                setReplaceFor(row);
                                setReplaceTeacher("");
                                setReason("");
                              }}
                            >
                              <RefreshCw /> Almashtirish
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive"
                              onClick={() => {
                                reset();
                                setCancelFor(row);
                                setReason("");
                              }}
                            >
                              <UserMinus /> Bekor qilish
                            </Button>
                          </>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      {/* Replace dialog */}
      <Dialog open={Boolean(replaceFor)} onOpenChange={(open) => !open && setReplaceFor(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Navbatchini almashtirish</DialogTitle>
            <DialogDescription>{replaceFor?.teacherName} o‘rniga yangi navbatchi tanlang.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <FormField label="Yangi o‘qituvchi" htmlFor="replaceTeacher" required>
              <Select value={replaceTeacher} onValueChange={setReplaceTeacher}>
                <SelectTrigger id="replaceTeacher">
                  <SelectValue placeholder="Tanlang" />
                </SelectTrigger>
                <SelectContent>
                  {teacherOptions
                    .filter((t) => t.id !== replaceFor?.teacherId)
                    .map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.label}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Sabab" htmlFor="replaceReason" required>
              <Textarea id="replaceReason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
            </FormField>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReplaceFor(null)}>
              Bekor qilish
            </Button>
            <Button onClick={doReplace} disabled={pending || !replaceTeacher || reason.trim().length < 2}>
              {pending ? "Saqlanmoqda..." : "Almashtirish"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel dialog */}
      <Dialog open={Boolean(cancelFor)} onOpenChange={(open) => !open && setCancelFor(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Navbatchilikni bekor qilish</DialogTitle>
            <DialogDescription>{cancelFor?.teacherName} navbatchiligini bekor qilasizmi?</DialogDescription>
          </DialogHeader>
          <FormField label="Sabab" htmlFor="cancelReason" required>
            <Textarea id="cancelReason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
          </FormField>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelFor(null)}>
              Yopish
            </Button>
            <Button variant="destructive" onClick={doCancel} disabled={pending || reason.trim().length < 2}>
              {pending ? "Bekor qilinmoqda..." : "Bekor qilish"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign dialog */}
      <Dialog open={Boolean(assignDate)} onOpenChange={(open) => !open && setAssignDate("")}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Navbatchi qo‘shish</DialogTitle>
            <DialogDescription>Sana tanlang va navbatchi o‘qituvchilarni belgilang.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <FormField label="Sana" htmlFor="assignDate" required>
              <Input
                id="assignDate"
                type="date"
                value={assignDate}
                onChange={(e) => setAssignDate(e.target.value)}
              />
            </FormField>
            <div className="space-y-2">
              <Label>O‘qituvchilar</Label>
              <div className="max-h-60 space-y-1 overflow-y-auto rounded-lg border p-2">
                {teacherOptions.map((t) => (
                  <label key={t.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-accent">
                    <Checkbox
                      checked={newTeacherIds.includes(t.id)}
                      onCheckedChange={(state) =>
                        setNewTeacherIds((prev) =>
                          state === true ? [...prev, t.id] : prev.filter((id) => id !== t.id),
                        )
                      }
                    />
                    {t.label}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDate("")}>
              Bekor qilish
            </Button>
            <Button onClick={doAssign} disabled={pending || newTeacherIds.length === 0}>
              {pending ? "Saqlanmoqda..." : "Qo‘shish"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function todayIsoValue(): string {
  return formatDateOnly(today());
}

// ---------------------------------------------------------------------------
// Generate tab
// ---------------------------------------------------------------------------

function GenerateTab({
  hasSettings,
  perDay,
  onDone,
  onConfigure,
}: {
  hasSettings: boolean;
  perDay: number;
  onDone: () => void;
  onConfigure: () => void;
}) {
  const { pending, error, run } = useAction();
  const [from, setFrom] = React.useState(() => formatDateOnly(today()));
  const [to, setTo] = React.useState(() => formatDateOnly(addMonths(today(), 1)));
  const [replaceExisting, setReplaceExisting] = React.useState(false);
  const [preview, setPreview] = React.useState<DutyPlanPreview | null>(null);
  const [result, setResult] = React.useState<DutyGenerateResult | null>(null);

  // Any change to the inputs invalidates a previously approved preview.
  const changeFrom = (value: string) => {
    setFrom(value);
    setPreview(null);
    setResult(null);
  };
  const changeTo = (value: string) => {
    setTo(value);
    setPreview(null);
    setResult(null);
  };
  const changeReplace = (value: boolean) => {
    setReplaceExisting(value);
    setPreview(null);
    setResult(null);
  };

  const runPreview = () => {
    run(() => previewDutyScheduleAction({ from, to, replaceExisting }), {
      onSuccess: (data) => {
        setPreview(data as DutyPlanPreview);
        setResult(null);
      },
    });
  };

  const commit = () => {
    run(() => generateDutyScheduleAction({ from, to, replaceExisting }), {
      onSuccess: (data) => {
        setResult(data as DutyGenerateResult);
        setPreview(null);
        onDone();
      },
    });
  };

  return (
    <div className="space-y-4">
      {!hasSettings && (
        <Alert variant="warning">
          <AlertTitle>Avval sozlamalar</AlertTitle>
          <AlertDescription className="flex items-center justify-between gap-3">
            <span>Jadval tuzishdan oldin navbatchilik sozlamalarini kiriting.</span>
            <Button size="sm" variant="outline" onClick={onConfigure}>
              <Settings2 /> Sozlamalar
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription className="text-foreground">{error}</AlertDescription>
        </Alert>
      )}

      <div className="rounded-xl border bg-card p-5">
        <h3 className="mb-1 text-sm font-semibold">Avtomatik jadval tuzish</h3>
        <p className="mb-4 text-sm text-muted-foreground">
          O‘qituvchilar navbatchiligi adolatli taqsimlanadi. Kuniga {perDay} nafar o‘qituvchi belgilanadi.
          Bayram va dam kunlari o‘tkazib yuboriladi.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Boshlanish sanasi" htmlFor="genFrom" required>
            <Input id="genFrom" type="date" value={from} onChange={(e) => changeFrom(e.target.value)} />
          </FormField>
          <FormField label="Tugash sanasi" htmlFor="genTo" required>
            <Input id="genTo" type="date" value={to} onChange={(e) => changeTo(e.target.value)} />
          </FormField>
        </div>
        <label className="mt-4 flex items-center justify-between rounded-lg border p-3">
          <span className="text-sm">
            Mavjud rejalashtirilgan tayinlovlarni qayta yozish
            <span className="block text-xs text-muted-foreground">
              Bajarilgan, almashtirilgan va bekor qilingan tarix saqlanadi.
            </span>
          </span>
          <Switch checked={replaceExisting} onCheckedChange={changeReplace} />
        </label>
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          {preview && (
            <Button variant="ghost" onClick={() => setPreview(null)} disabled={pending}>
              Bekor qilish
            </Button>
          )}
          <Button variant="outline" onClick={runPreview} disabled={pending || !hasSettings}>
            <Eye /> {pending ? "Hisoblanmoqda..." : "Ko‘rib chiqish"}
          </Button>
          <Button onClick={commit} disabled={pending || !hasSettings || !preview}>
            <Sparkles /> {pending ? "Saqlanmoqda..." : "Tasdiqlash va saqlash"}
          </Button>
        </div>
      </div>

      {preview && !result && (
        <div className="space-y-4">
          <Alert variant="info">
            <AlertTitle>Ko‘rib chiqish uchun jadval</AlertTitle>
            <AlertDescription>
              Bu hali saqlanmagan. Tasdiqlaganingizdan keyin tayinlovlar bazaga yoziladi.
            </AlertDescription>
          </Alert>

          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Tayinlovlar" value={preview.totalAssignments} tone="info" icon={Wand2} />
            <StatCard label="Navbatchilik kunlari" value={preview.dates} tone="default" icon={CalendarDays} />
            <StatCard
              label="Konfliktlar"
              value={preview.conflicts.length}
              tone={preview.conflicts.length > 0 ? "warning" : "default"}
              icon={AlertTriangle}
            />
          </div>

          {preview.conflicts.length > 0 && (
            <Alert variant="warning">
              <AlertTitle>Diqqat: yetarli o‘qituvchi yo‘q</AlertTitle>
              <AlertDescription>
                <ul className="list-inside list-disc space-y-1">
                  {preview.conflicts.map((c) => (
                    <li key={c.date}>
                      {formatUzDate(new Date(`${c.date}T00:00:00.000Z`))}: {c.message}
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border bg-card">
              <div className="border-b px-4 py-2 text-sm font-semibold">Reja (dastlabki 14 kun)</div>
              {preview.days.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                  Tanlangan davrda navbatchilik kuni yo‘q.
                </p>
              ) : (
                <div className="max-h-80 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Sana</TableHead>
                        <TableHead>Navbatchi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.days.slice(0, 14).map((day) => (
                        <TableRow key={day.date}>
                          <TableCell className="whitespace-nowrap">
                            {formatUzDate(new Date(`${day.date}T00:00:00.000Z`))}
                          </TableCell>
                          <TableCell>{day.teachers.map((t) => t.name).join(", ")}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            {preview.distribution.length > 0 && (
              <div className="rounded-xl border bg-card">
                <div className="border-b px-4 py-2 text-sm font-semibold">Taqsimot</div>
                <div className="max-h-80 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>O‘qituvchi</TableHead>
                        <TableHead className="text-right">Bu safar</TableHead>
                        <TableHead className="text-right">Jami</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.distribution.map((d) => (
                        <TableRow key={d.teacherId}>
                          <TableCell>{d.name}</TableCell>
                          <TableCell className="text-right tabular-nums">+{d.added}</TableCell>
                          <TableCell className="text-right tabular-nums">{d.total}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {result && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Yaratildi" value={result.created} tone="success" icon={Wand2} />
            <StatCard label="Jami kunlar" value={result.dates} tone="info" icon={CalendarDays} />
            <StatCard
              label="Konfliktlar"
              value={result.conflicts.length}
              tone={result.conflicts.length > 0 ? "warning" : "default"}
              icon={AlertTriangle}
            />
          </div>

          {result.conflicts.length > 0 && (
            <Alert variant="warning">
              <AlertTitle>Diqqat: yetarli o‘qituvchi yo‘q</AlertTitle>
              <AlertDescription>
                <ul className="list-inside list-disc space-y-1">
                  {result.conflicts.map((c) => (
                    <li key={c.date}>
                      {formatUzDate(new Date(`${c.date}T00:00:00.000Z`))}: {c.message}
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {result.distribution.length > 0 && (
            <div className="rounded-xl border bg-card">
              <div className="border-b px-4 py-2 text-sm font-semibold">Taqsimot</div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>O‘qituvchi</TableHead>
                    <TableHead className="text-right">Bu safar</TableHead>
                    <TableHead className="text-right">Jami</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.distribution.map((d) => (
                    <TableRow key={d.teacherId}>
                      <TableCell>{d.name}</TableCell>
                      <TableCell className="text-right tabular-nums">+{d.added}</TableCell>
                      <TableCell className="text-right tabular-nums">{d.total}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fairness tab
// ---------------------------------------------------------------------------

function FairnessTab({
  fairness,
  consecutivePairs,
  teacherOptions,
}: {
  fairness: DutyDashboard["fairness"];
  consecutivePairs: number;
  teacherOptions: { id: string; label: string }[];
}) {
  const [checked, setChecked] = React.useState(false);
  const totals = fairness.map((f) => f.total);
  const spread = totals.length > 0 ? Math.max(...totals) - Math.min(...totals) : 0;
  const assignedIds = new Set(fairness.map((f) => f.teacherId));
  const unassigned = teacherOptions.filter((t) => !assignedIds.has(t.id));

  const issues: string[] = [];
  if (spread > 1) issues.push(`Taqsimotda farq ${spread} tani tashkil qiladi (maqsad: 0–1).`);
  if (consecutivePairs > 0) issues.push(`${consecutivePairs} ta ketma-ket navbatchilik aniqlandi.`);
  if (unassigned.length > 0) issues.push(`${unassigned.length} o‘qituvchi hali navbatchilikka jalb qilinmagan.`);

  const suggestions = [...fairness]
    .sort((a, b) => b.total - a.total || a.teacherName.localeCompare(b.teacherName, "uz"))
    .slice(0, 3)
    .map((f) => f.teacherName);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Har bir o‘qituvchining navbatchiliklar soni va oxirgi sanasi.
        </p>
        <Button variant="outline" onClick={() => setChecked(true)}>
          <Scale /> Adolatni tekshirish
        </Button>
      </div>

      {checked && (
        <Alert variant={issues.length > 0 ? "warning" : "success"}>
          <AlertTitle>{issues.length > 0 ? "Taqsimotda muammolar bor" : "Taqsimot adolatli"}</AlertTitle>
          <AlertDescription>
            {issues.length > 0 ? (
              <ul className="list-inside list-disc space-y-1">
                {issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            ) : (
              <span>Barcha o‘qituvchilar orasida taqsimot teng.</span>
            )}
            {issues.length > 0 && suggestions.length > 0 && (
              <p className="mt-2">
                Kamroq navbatchilik qilganlarga ustuvorlik berilsin. Eng ko‘p navbatchilik:{" "}
                {suggestions.join(", ")}.
              </p>
            )}
          </AlertDescription>
        </Alert>
      )}

      {fairness.length === 0 ? (
        <EmptyState
          icon={Scale}
          title="Ma’lumot yo‘q"
          description="Hali navbatchilik tayinlanmagan."
        />
      ) : (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>O‘qituvchi</TableHead>
                <TableHead className="text-right">Jami</TableHead>
                <TableHead className="text-right">Rejalashtirilgan</TableHead>
                <TableHead className="text-right">Bajarilgan</TableHead>
                <TableHead className="text-right">Ketma-ket</TableHead>
                <TableHead>Oxirgi sana</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fairness.map((row) => (
                <TableRow key={row.teacherId}>
                  <TableCell className="font-medium">{row.teacherName}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.total}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.planned}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.completed}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.consecutivePairs > 0 ? (
                      <Badge variant="warning">{row.consecutivePairs}</Badge>
                    ) : (
                      "0"
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.lastDate ? formatUzDate(new Date(`${row.lastDate}T00:00:00.000Z`)) : "—"}
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

// ---------------------------------------------------------------------------
// Settings tab
// ---------------------------------------------------------------------------

function SettingsTab({
  dashboard,
  eligibility,
  onSaved,
}: {
  dashboard: DutyDashboard;
  eligibility: DutyEligibilityRow[];
  onSaved: () => void;
}) {
  const settings = dashboard.settings;
  const { pending, error, run, reset } = useAction();

  const [title, setTitle] = React.useState(settings?.title ?? "Navbatchilik");
  const [startDate, setStartDate] = React.useState(settings?.startDate ?? "");
  const [endDate, setEndDate] = React.useState(settings?.endDate ?? "");
  const [perDay, setPerDay] = React.useState(String(settings?.perDay ?? 1));
  const [weekdays, setWeekdays] = React.useState<number[]>(settings?.weekdays ?? [...DEFAULT_WORKING_DAYS]);
  const [avoidConsecutive, setAvoidConsecutive] = React.useState(settings?.avoidConsecutive ?? true);
  const [isActive, setIsActive] = React.useState(settings?.isActive ?? true);
  const [rows, setRows] = React.useState<DutyEligibilityRow[]>(eligibility);

  const eligibilityMap = new Map(rows.map((r) => [r.teacherId, r]));

  const setEligible = (teacherId: string, isEligible: boolean) => {
    setRows((prev) => {
      const existing = prev.find((r) => r.teacherId === teacherId);
      if (existing) return prev.map((r) => (r.teacherId === teacherId ? { ...r, isEligible } : r));
      return [...prev, { teacherId, isEligible, unavailableFrom: null, unavailableTo: null, note: null }];
    });
  };

  const setWindow = (teacherId: string, key: "unavailableFrom" | "unavailableTo", value: string) => {
    setRows((prev) => {
      const existing = prev.find((r) => r.teacherId === teacherId) ?? {
        teacherId,
        isEligible: true,
        unavailableFrom: null,
        unavailableTo: null,
        note: null,
      };
      return [...prev.filter((r) => r.teacherId !== teacherId), { ...existing, [key]: value || null }];
    });
  };

  const submit = () => {
    run(
      () =>
        saveDutySettingsAction({
          title,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          perDay: Number(perDay),
          weekdays,
          avoidConsecutive,
          isActive,
          eligibility: rows.map((r) => ({
            teacherId: r.teacherId,
            isEligible: r.isEligible,
            unavailableFrom: r.unavailableFrom || undefined,
            unavailableTo: r.unavailableTo || undefined,
            note: r.note || undefined,
          })),
        }),
      {
        onSuccess: () => {
          reset();
          onSaved();
        },
      },
    );
  };

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription className="text-foreground">{error}</AlertDescription>
        </Alert>
      )}

      <div className="rounded-xl border bg-card p-5">
        <h3 className="mb-1 text-sm font-semibold">Navbatchilik sozlamalari</h3>
        <p className="mb-4 text-sm text-muted-foreground">
          Navbatchilik kunlari sinflarning o‘qish kunlaridan alohida belgilanadi.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Nomi" htmlFor="dutyTitle" required>
            <Input id="dutyTitle" value={title} onChange={(e) => setTitle(e.target.value)} />
          </FormField>
          <FormField label="Kuniga navbatchi" htmlFor="perDay" required>
            <Select value={perDay} onValueChange={setPerDay}>
              <SelectTrigger id="perDay">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DUTY_PER_DAY_OPTIONS.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n} nafar
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Boshlanish sanasi" htmlFor="startDate">
            <Input id="startDate" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </FormField>
          <FormField label="Tugash sanasi" htmlFor="endDate">
            <Input id="endDate" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </FormField>
        </div>

        <div className="mt-4 space-y-2">
          <Label>Navbatchilik kunlari</Label>
          <WeekdayPicker value={weekdays} onChange={setWeekdays} idPrefix="duty-day" />
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="flex items-center justify-between rounded-lg border p-3">
            <span className="text-sm">
              Ketma-ket navbatchilikdan saqlanish
              <span className="block text-xs text-muted-foreground">Bir o‘qituvchi ketma-ket kunlarda belgilanmasin.</span>
            </span>
            <Switch checked={avoidConsecutive} onCheckedChange={setAvoidConsecutive} />
          </label>
          <label className="flex items-center justify-between rounded-lg border p-3">
            <span className="text-sm">
              Faol
              <span className="block text-xs text-muted-foreground">Nofaol bo‘lsa jadval tuzilmaydi.</span>
            </span>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </label>
        </div>
      </div>

      <div className="rounded-xl border bg-card">
        <div className="border-b px-4 py-2">
          <h3 className="text-sm font-semibold">Qatnashadigan o‘qituvchilar</h3>
          <p className="text-xs text-muted-foreground">
            Navbatchilikka qatnashadiganlarni belgilang va vaqtincha band bo‘lgan davrlarni kiriting.
          </p>
        </div>
        {dashboard.teacherOptions.length === 0 ? (
          <div className="p-4">
            <EmptyState icon={Users} title="O‘qituvchi yo‘q" description="Avval maktabga o‘qituvchilar qo‘shing." />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>O‘qituvchi</TableHead>
                <TableHead className="text-center">Qatnashadi</TableHead>
                <TableHead>Mavjud emas (dan)</TableHead>
                <TableHead>Mavjud emas (gacha)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dashboard.teacherOptions.map((t) => {
                const row = eligibilityMap.get(t.id);
                const eligible = row?.isEligible ?? false;
                return (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.label}</TableCell>
                    <TableCell className="text-center">
                      <Checkbox checked={eligible} onCheckedChange={(s) => setEligible(t.id, s === true)} />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="date"
                        value={row?.unavailableFrom ?? ""}
                        onChange={(e) => setWindow(t.id, "unavailableFrom", e.target.value)}
                        disabled={!eligible}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="date"
                        value={row?.unavailableTo ?? ""}
                        onChange={(e) => setWindow(t.id, "unavailableTo", e.target.value)}
                        disabled={!eligible}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <div className="flex justify-end">
        <Button onClick={submit} disabled={pending || weekdays.length === 0}>
          {pending ? "Saqlanmoqda..." : "Sozlamalarni saqlash"}
        </Button>
      </div>
    </div>
  );
}
