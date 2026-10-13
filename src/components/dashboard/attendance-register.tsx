"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, CheckCheck, ClipboardCheck, Eraser, Lock, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useAction } from "@/hooks/use-action";
import { saveAttendanceAction } from "@/lib/actions/attendance";
import {
  ATTENDANCE_CHIP_CLASS,
  ATTENDANCE_LABEL,
  ATTENDANCE_STATUSES,
  SESSION_SLOT_LABEL,
} from "@/lib/constants";
import type { RegisterData } from "@/lib/attendance/queries";
import type { AttendanceStatus } from "@prisma/client";

export type RegisterClass = { id: string; label: string };
type Slot = "FULL_DAY" | "MORNING" | "AFTERNOON";

type Mark = { status: AttendanceStatus | null; reason: string; note: string };

function initialMarks(data: RegisterData): Record<string, Mark> {
  const marks: Record<string, Mark> = {};
  for (const student of data.students) {
    marks[student.studentId] = {
      status: student.status,
      reason: student.reason ?? "",
      note: student.note ?? "",
    };
  }
  return marks;
}

export function AttendanceRegister({
  data,
  classes,
  classId,
  date,
  slot,
  canCorrect,
  studyDay,
}: {
  data: RegisterData;
  classes: RegisterClass[];
  classId: string;
  date: string;
  slot: Slot;
  canCorrect: boolean;
  studyDay: boolean;
}) {
  const router = useRouter();
  const { pending, error, run } = useAction();

  const [marks, setMarks] = React.useState<Record<string, Mark>>(() => initialMarks(data));
  const [savedNotice, setSavedNotice] = React.useState(false);
  const [syncedData, setSyncedData] = React.useState(data);

  const submitted = data.session?.status === "SUBMITTED";
  const locked = submitted && !canCorrect;

  // Reset marks whenever the server hands us a different register. Adjusting
  // state during render (instead of in an effect) avoids a cascading re-render.
  if (syncedData !== data) {
    setSyncedData(data);
    setMarks(initialMarks(data));
    setSavedNotice(false);
  }

  const baseline = React.useMemo(() => initialMarks(data), [data]);

  const dirty = React.useMemo(() => {
    const ids = new Set([...Object.keys(marks), ...Object.keys(baseline)]);
    for (const id of ids) {
      const a = marks[id];
      const b = baseline[id];
      if (!a || !b) return true;
      if (a.status !== b.status) return true;
      if ((a.reason ?? "") !== (b.reason ?? "")) return true;
    }
    return false;
  }, [marks, baseline]);

  // Warn before leaving with unsaved changes.
  React.useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const counts = React.useMemo(() => {
    const result = { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0, UNSET: 0 };
    for (const mark of Object.values(marks)) {
      if (mark.status) result[mark.status] += 1;
      else result.UNSET += 1;
    }
    return result;
  }, [marks]);

  const navigate = React.useCallback(
    (updates: Record<string, string>) => {
      if (dirty && !window.confirm("Saqlanmagan o‘zgarishlar bor. Ularni tashlab, davom etilsinmi?")) return;
      const params = new URLSearchParams();
      params.set("classId", updates.classId ?? classId);
      params.set("date", updates.date ?? date);
      params.set("slot", updates.slot ?? slot);
      router.push(`/dashboard/attendance?${params.toString()}`);
    },
    [dirty, classId, date, slot, router],
  );

  const setStatus = (studentId: string, status: AttendanceStatus) => {
    if (locked) return;
    setSavedNotice(false);
    setMarks((prev) => {
      const current = prev[studentId] ?? { status: null, reason: "", note: "" };
      // Tapping the active status clears it (unrecorded).
      const nextStatus = current.status === status ? null : status;
      return { ...prev, [studentId]: { ...current, status: nextStatus } };
    });
  };

  const setReason = (studentId: string, reason: string) => {
    setMarks((prev) => ({ ...prev, [studentId]: { ...prev[studentId], reason } }));
  };

  const bulkSet = (status: AttendanceStatus) => {
    if (locked) return;
    setSavedNotice(false);
    setMarks((prev) => {
      const next: Record<string, Mark> = {};
      for (const [id, mark] of Object.entries(prev)) next[id] = { ...mark, status };
      return next;
    });
  };

  const clearAll = () => {
    if (locked) return;
    setSavedNotice(false);
    setMarks((prev) => {
      const next: Record<string, Mark> = {};
      for (const [id, mark] of Object.entries(prev)) next[id] = { ...mark, status: null };
      return next;
    });
  };

  const save = (submit: boolean) => {
    setSavedNotice(false);
    const entries = data.students
      .filter((student) => marks[student.studentId]?.status)
      .map((student) => ({
        studentId: student.studentId,
        enrollmentId: student.enrollmentId,
        status: marks[student.studentId].status as AttendanceStatus,
        reason: marks[student.studentId].reason || undefined,
        note: marks[student.studentId].note || undefined,
      }));

    if (entries.length === 0) return;

    run(
      () =>
        saveAttendanceAction({
          classId,
          date,
          slot,
          entries,
          submit,
        }),
      {
        onSuccess: () => {
          setSavedNotice(true);
          router.refresh();
        },
      },
    );
  };

  const missingExcused = data.students.some(
    (student) => marks[student.studentId]?.status === "EXCUSED" && !marks[student.studentId]?.reason?.trim(),
  );

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid flex-1 gap-3 sm:grid-cols-3">
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Sinf</span>
            <Select value={classId} onValueChange={(value) => navigate({ classId: value })}>
              <SelectTrigger>
                <SelectValue placeholder="Sinfni tanlang" />
              </SelectTrigger>
              <SelectContent>
                {classes.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Sana</span>
            <Input type="date" value={date} onChange={(event) => navigate({ date: event.target.value })} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Smena</span>
            <Select value={slot} onValueChange={(value) => navigate({ slot: value })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(SESSION_SLOT_LABEL) as Slot[]).map((value) => (
                  <SelectItem key={value} value={value}>
                    {SESSION_SLOT_LABEL[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => bulkSet("PRESENT")} disabled={locked}>
            <CheckCheck /> Barchasi keldi
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={clearAll} disabled={locked}>
            <Eraser /> Tozalash
          </Button>
        </div>
      </div>

      {/* Non-study-day notice: never auto-mark absent on a rest day. */}
      {!studyDay && (
        <Alert variant="warning">
          <AlertTriangle />
          <AlertTitle>Bu kun sinf uchun o‘qish kuni emas</AlertTitle>
          <AlertDescription>
            Tanlangan sanada bu sinf jadval bo‘yicha o‘qimaydi. Tizim hech kimni avtomatik “kelmadi” deb
            belgilamaydi. Agar bu kun qo‘shimcha dars kuni bo‘lsa, davomatni qo‘lda belgilashingiz mumkin.
          </AlertDescription>
        </Alert>
      )}

      {/* Session status */}
      {data.session && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {submitted ? (
            <Badge variant="success">Tasdiqlangan</Badge>
          ) : (
            <Badge variant="warning">Qoralama</Badge>
          )}
          {data.session.recordedByName && <span>Kim belgilagan: {data.session.recordedByName}</span>}
          {submitted && <span>· O‘zgartirish uchun qayta oching (tarix bo‘limi).</span>}
        </div>
      )}

      {locked && (
        <Alert variant="warning">
          <Lock />
          <AlertTitle>Tasdiqlangan davomat</AlertTitle>
          <AlertDescription className="text-foreground">
            Bu davomat tasdiqlangan. O‘zgartirish uchun davomat tarixidan qayta oching yoki o‘quv bo‘limiga
            murojaat qiling.
          </AlertDescription>
        </Alert>
      )}

      {dirty && (
        <Alert variant="info">
          <AlertTriangle />
          <AlertDescription className="text-foreground">
            Saqlanmagan o‘zgarishlar mavjud. Sahifadan chiqishdan oldin saqlang.
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription className="text-foreground">{error}</AlertDescription>
        </Alert>
      )}

      {missingExcused && (
        <Alert variant="warning">
          <AlertDescription className="text-foreground">
            Sababli kelmagan o‘quvchilar uchun sababni ko‘rsating.
          </AlertDescription>
        </Alert>
      )}

      {savedNotice && (
        <Alert variant="success">
          <AlertDescription className="text-foreground">Davomat saqlandi.</AlertDescription>
        </Alert>
      )}

      {/* Summary */}
      {data.class && data.students.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="success">Keldi: {counts.PRESENT}</Badge>
          <Badge variant="warning">Kechikdi: {counts.LATE}</Badge>
          <Badge variant="destructive">Kelmadi: {counts.ABSENT}</Badge>
          <Badge variant="info">Sababli: {counts.EXCUSED}</Badge>
          <Badge variant="outline">Belgilanmagan: {counts.UNSET}</Badge>
        </div>
      )}

      {/* Register */}
      {!data.class ? (
        <EmptyState
          icon={ClipboardCheck}
          title="Ma’lumot topilmadi"
          description="Tanlangan sana uchun bu sinfda biriktirilgan o‘quvchilar yo‘q."
        />
      ) : data.students.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="O‘quvchi biriktirilmagan"
          description="Bu sinfga o‘quvchilar biriktirilmagan."
          action={
            <Button asChild>
              <Link href="/dashboard/students">O‘quvchilarni boshqarish</Link>
            </Button>
          }
        />
      ) : (
        <ul className="space-y-2">
          {data.students.map((student, index) => {
            const mark = marks[student.studentId] ?? { status: null, reason: "", note: "" };
            return (
              <li key={student.studentId} className="rounded-xl border bg-card p-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-medium text-muted-foreground">
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {student.lastName} {student.firstName} {student.middleName ?? ""}
                      </p>
                      {!mark.status && <p className="text-xs text-muted-foreground">Belgilanmagan</p>}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {ATTENDANCE_STATUSES.map((status) => {
                      const active = mark.status === status;
                      return (
                        <button
                          key={status}
                          type="button"
                          disabled={locked}
                          onClick={() => setStatus(student.studentId, status)}
                          className={cn(
                            "rounded-full px-3 py-1 text-xs font-medium transition",
                            active
                              ? ATTENDANCE_CHIP_CLASS[status]
                              : "bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                            locked && "cursor-not-allowed opacity-60",
                          )}
                          aria-pressed={active}
                        >
                          {ATTENDANCE_LABEL[status]}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {mark.status === "EXCUSED" && (
                  <div className="mt-3">
                    <Input
                      value={mark.reason}
                      disabled={locked}
                      onChange={(event) => setReason(student.studentId, event.target.value)}
                      placeholder="Sababni kiriting (masalan: kasallik)"
                      maxLength={160}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {data.class && data.students.length > 0 && (
        <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-end gap-2 rounded-xl border bg-card/95 p-3 shadow-sm backdrop-blur">
          <Button
            type="button"
            variant="outline"
            disabled={pending || locked || !dirty}
            onClick={() => save(false)}
          >
            <Save /> Qoralama saqlash
          </Button>
          <Button type="button" disabled={pending || locked || !dirty || missingExcused} onClick={() => save(true)}>
            <CheckCheck /> {pending ? "Saqlanmoqda..." : "Saqlash va tasdiqlash"}
          </Button>
        </div>
      )}
    </div>
  );
}
