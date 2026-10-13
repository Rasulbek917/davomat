"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, GraduationCap, MoreHorizontal, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FormField } from "@/components/ui/form-field";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { WeekdayPicker } from "@/components/ui/weekday-picker";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAction } from "@/hooks/use-action";
import { createClassAction, setClassActiveAction, updateClassAction } from "@/lib/actions/classes";
import { ACADEMIC_YEAR_DEFAULT, DEFAULT_WORKING_DAYS, WEEKDAY_LABEL } from "@/lib/constants";
import { classLabel } from "@/lib/utils";

export type ClassRow = {
  id: string;
  name: string;
  letter: string | null;
  gradeYear: number;
  academicYear: string;
  capacity: number | null;
  teacherId: string | null;
  teacherName: string | null;
  isActive: boolean;
  studentCount: number;
  sessionCount: number;
  workingDays: number[];
};

export type TeacherOption = { id: string; name: string };

type FormState = {
  id?: string;
  name: string;
  letter: string;
  gradeYear: string;
  academicYear: string;
  capacity: string;
  teacherId: string;
  isActive: boolean;
  weekdays: number[];
};

const EMPTY: FormState = {
  name: "",
  letter: "",
  gradeYear: "5",
  academicYear: ACADEMIC_YEAR_DEFAULT,
  capacity: "",
  teacherId: "",
  isActive: true,
  weekdays: [...DEFAULT_WORKING_DAYS],
};

const NO_TEACHER = "__none__";

function toForm(row: ClassRow): FormState {
  return {
    id: row.id,
    name: row.name,
    letter: row.letter ?? "",
    gradeYear: String(row.gradeYear),
    academicYear: row.academicYear,
    capacity: row.capacity ? String(row.capacity) : "",
    teacherId: row.teacherId ?? "",
    isActive: row.isActive,
    weekdays: row.workingDays.length > 0 ? [...row.workingDays] : [...DEFAULT_WORKING_DAYS],
  };
}

export function ClassesClient({
  classes,
  teachers,
  canManage,
}: {
  classes: ClassRow[];
  teachers: TeacherOption[];
  canManage: boolean;
}) {
  const router = useRouter();
  const { pending, error, fieldErrors, run, reset } = useAction();
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState<FormState>(EMPTY);

  const openCreate = () => {
    setForm(EMPTY);
    reset();
    setOpen(true);
  };
  const openEdit = (row: ClassRow) => {
    setForm(toForm(row));
    reset();
    setOpen(true);
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    run(() => (form.id ? updateClassAction(form) : createClassAction(form)), {
      onSuccess: () => {
        setOpen(false);
        router.refresh();
      },
    });
  };

  const toggleActive = (row: ClassRow) => {
    run(() => setClassActiveAction({ id: row.id, isActive: !row.isActive }), {
      onSuccess: () => router.refresh(),
    });
  };

  const set = (key: keyof FormState, value: string | boolean | number[]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex justify-end">
          <Button onClick={openCreate}>
            <Plus /> Sinf qo‘shish
          </Button>
        </div>
      )}

      {classes.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title="Hozircha sinf yo‘q"
          description="Maktab sinflarini qo‘shing. Har bir sinfga o‘quvchilar biriktiriladi."
          action={
            canManage ? <Button onClick={openCreate}>Sinf qo‘shish</Button> : undefined
          }
        />
      ) : (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sinf</TableHead>
                <TableHead>O‘quv yili</TableHead>
                <TableHead>Sinf rahbari</TableHead>
                <TableHead className="text-right">O‘quvchi</TableHead>
                <TableHead className="text-right">Sessiya</TableHead>
                <TableHead>O‘qish kunlari</TableHead>
                <TableHead>Holat</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {classes.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Link href={`/dashboard/classes/${row.id}`} className="font-medium hover:underline">
                      {classLabel(row.name, row.letter)}
                    </Link>
                    <div className="text-xs text-muted-foreground">{row.gradeYear}-sinf</div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{row.academicYear}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{row.teacherName ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.studentCount}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.sessionCount}</TableCell>
                  <TableCell>
                    <span className="text-sm tabular-nums">{row.workingDays.length} kun</span>
                    <div className="text-xs text-muted-foreground">
                      {row.workingDays.map((d) => WEEKDAY_LABEL[d]?.slice(0, 2)).join(", ")}
                    </div>
                  </TableCell>
                  <TableCell>
                    {row.isActive ? <Badge variant="success">Faol</Badge> : <Badge variant="outline">Arxiv</Badge>}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label="Amallar">
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/dashboard/classes/${row.id}`} className="cursor-pointer">
                            <Eye /> Batafsil
                          </Link>
                        </DropdownMenuItem>
                        {canManage && (
                          <>
                            <DropdownMenuItem onSelect={() => openEdit(row)}>
                              <Pencil /> Tahrirlash
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => toggleActive(row)}>
                              {row.isActive ? "Arxivlash" : "Faollashtirish"}
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {error && !open && (
        <Alert variant="destructive">
          <AlertDescription className="text-foreground">{error}</AlertDescription>
        </Alert>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{form.id ? "Sinfni tahrirlash" : "Yangi sinf"}</DialogTitle>
            <DialogDescription>Sinf nomi va o‘quv yili birgalikda yagona bo‘lishi kerak.</DialogDescription>
          </DialogHeader>

          <form onSubmit={submit} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription className="text-foreground">{error}</AlertDescription>
              </Alert>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Sinf nomi" htmlFor="name" required error={fieldErrors["name"]} hint="Masalan: 5">
                <Input id="name" value={form.name} onChange={(e) => set("name", e.target.value)} required />
              </FormField>
              <FormField label="Harf" htmlFor="letter" error={fieldErrors["letter"]} hint="Masalan: A">
                <Input id="letter" value={form.letter} onChange={(e) => set("letter", e.target.value)} />
              </FormField>
              <FormField label="Sinf raqami (kurs)" htmlFor="gradeYear" required error={fieldErrors["gradeYear"]}>
                <Input
                  id="gradeYear"
                  type="number"
                  min={1}
                  max={11}
                  value={form.gradeYear}
                  onChange={(e) => set("gradeYear", e.target.value)}
                  required
                />
              </FormField>
              <FormField label="O‘quv yili" htmlFor="academicYear" required error={fieldErrors["academicYear"]} hint="2025-2026">
                <Input
                  id="academicYear"
                  value={form.academicYear}
                  onChange={(e) => set("academicYear", e.target.value)}
                  required
                />
              </FormField>
              <FormField label="Sig‘im" htmlFor="capacity" error={fieldErrors["capacity"]}>
                <Input
                  id="capacity"
                  type="number"
                  min={1}
                  max={60}
                  value={form.capacity}
                  onChange={(e) => set("capacity", e.target.value)}
                />
              </FormField>
              <FormField label="Sinf rahbari" htmlFor="teacherId" error={fieldErrors["teacherId"]}>
                <Select
                  value={form.teacherId || NO_TEACHER}
                  onValueChange={(value) => set("teacherId", value === NO_TEACHER ? "" : value)}
                >
                  <SelectTrigger id="teacherId">
                    <SelectValue placeholder="Tanlanmagan" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_TEACHER}>Tanlanmagan</SelectItem>
                    {teachers.map((teacher) => (
                      <SelectItem key={teacher.id} value={teacher.id}>
                        {teacher.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
            </div>

            <div className="rounded-lg border p-3">
              <div className="mb-2">
                <Label>Haftalik o‘qish kunlari</Label>
                <p className="text-xs text-muted-foreground">
                  Bu sinf haftaning qaysi kunlari o‘qiydi. Davomat faqat shu kunlarda kiritiladi.
                </p>
              </div>
              <WeekdayPicker
                value={form.weekdays}
                onChange={(next) => set("weekdays", next)}
                disabled={pending}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label htmlFor="classActive">Faol holat</Label>
                <p className="text-xs text-muted-foreground">Arxivlangan sinf yangi davomat uchun ko‘rinmaydi.</p>
              </div>
              <Switch id="classActive" checked={form.isActive} onCheckedChange={(value) => set("isActive", value)} />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Bekor qilish
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Saqlanmoqda..." : form.id ? "Saqlash" : "Qo‘shish"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
