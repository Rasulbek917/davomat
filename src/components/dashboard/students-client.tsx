"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Eye, MoreHorizontal, Pencil, Plus, Search, UserPlus, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FormField } from "@/components/ui/form-field";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAction } from "@/hooks/use-action";
import {
  createStudentAction,
  enrollStudentAction,
  setStudentStatusAction,
  unenrollStudentAction,
  updateStudentAction,
} from "@/lib/actions/students";

export type StudentRow = {
  id: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  externalId: string | null;
  birthDate: string | null;
  gender: "MALE" | "FEMALE" | null;
  status: "ACTIVE" | "TRANSFERRED" | "GRADUATED" | "INACTIVE";
  isActive: boolean;
  guardianName: string | null;
  guardianPhone: string | null;
  note: string | null;
  classId: string | null;
  className: string | null;
  enrollmentId: string | null;
};

export type ClassOption = { id: string; label: string; academicYear: string };

const STATUS_LABEL: Record<StudentRow["status"], string> = {
  ACTIVE: "Faol",
  TRANSFERRED: "Ko‘chirilgan",
  GRADUATED: "Bitirgan",
  INACTIVE: "Nofaol",
};

const NO_CLASS = "__none__";

type FormState = {
  id?: string;
  firstName: string;
  lastName: string;
  middleName: string;
  externalId: string;
  birthDate: string;
  gender: "" | "MALE" | "FEMALE";
  status: StudentRow["status"];
  guardianName: string;
  guardianPhone: string;
  note: string;
  classId: string;
  isActive: boolean;
};

const EMPTY: FormState = {
  firstName: "",
  lastName: "",
  middleName: "",
  externalId: "",
  birthDate: "",
  gender: "",
  status: "ACTIVE",
  guardianName: "",
  guardianPhone: "",
  note: "",
  classId: "",
  isActive: true,
};

function toForm(row: StudentRow): FormState {
  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    middleName: row.middleName ?? "",
    externalId: row.externalId ?? "",
    birthDate: row.birthDate ?? "",
    gender: row.gender ?? "",
    status: row.status,
    guardianName: row.guardianName ?? "",
    guardianPhone: row.guardianPhone ?? "",
    note: row.note ?? "",
    classId: row.classId ?? "",
    isActive: row.isActive,
  };
}

export function StudentsClient({
  students,
  classes,
  total,
  page,
  pageSize,
  query,
  classId,
  canManage,
}: {
  students: StudentRow[];
  classes: ClassOption[];
  total: number;
  page: number;
  pageSize: number;
  query: string;
  classId: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const formAction = useAction();
  const rowAction = useAction();
  const enrollAction = useAction();

  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState<FormState>(EMPTY);
  const [enrollTarget, setEnrollTarget] = React.useState<StudentRow | null>(null);
  const [enrollClassId, setEnrollClassId] = React.useState("");
  const [search, setSearch] = React.useState(query);

  const push = React.useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "") params.delete(key);
        else params.set(key, value);
      }
      if (!("page" in updates)) params.delete("page");
      router.push(`${pathname}?${params.toString()}`);
    },
    [pathname, router, searchParams],
  );

  const openCreate = () => {
    setForm(EMPTY);
    formAction.reset();
    setOpen(true);
  };
  const openEdit = (row: StudentRow) => {
    setForm(toForm(row));
    formAction.reset();
    setOpen(true);
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    formAction.run(() => (form.id ? updateStudentAction(form) : createStudentAction(form)), {
      onSuccess: () => {
        setOpen(false);
        router.refresh();
      },
    });
  };

  const setStatus = (row: StudentRow, status: StudentRow["status"]) => {
    rowAction.run(() => setStudentStatusAction({ id: row.id, status }), {
      onSuccess: () => router.refresh(),
    });
  };

  const submitEnroll = (event: React.FormEvent) => {
    event.preventDefault();
    if (!enrollTarget || !enrollClassId) return;
    enrollAction.run(
      () =>
        enrollStudentAction({
          studentId: enrollTarget.id,
          classId: enrollClassId,
          academicYear: classes.find((c) => c.id === enrollClassId)?.academicYear ?? "",
          startDate: new Date().toISOString().slice(0, 10),
        }),
      {
        onSuccess: () => {
          setEnrollTarget(null);
          setEnrollClassId("");
          router.refresh();
        },
      },
    );
  };

  const unenroll = (row: StudentRow) => {
    if (!row.enrollmentId) return;
    rowAction.run(() => unenrollStudentAction({ enrollmentId: row.enrollmentId! }), {
      onSuccess: () => router.refresh(),
    });
  };

  const set = (key: keyof FormState, value: string | boolean) => setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            push({ q: search });
          }}
          className="flex flex-1 flex-wrap items-center gap-2"
        >
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="F.I.Sh. yoki tashqi ID bo‘yicha qidirish"
              className="pl-9"
            />
          </div>
          <Select
            value={classId || "all"}
            onValueChange={(value) => push({ classId: value === "all" ? null : value })}
          >
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
          {(query || classId) && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch("");
                push({ q: null, classId: null });
              }}
            >
              <X /> Tozalash
            </Button>
          )}
        </form>

        {canManage && (
          <Button onClick={openCreate}>
            <Plus /> O‘quvchi qo‘shish
          </Button>
        )}
      </div>

      {rowAction.error && (
        <Alert variant="destructive">
          <AlertDescription className="text-foreground">{rowAction.error}</AlertDescription>
        </Alert>
      )}

      {students.length === 0 ? (
        <EmptyState
          icon={Users}
          title="O‘quvchilar topilmadi"
          description={query || classId ? "Filtrlarni o‘zgartirib qayta urinib ko‘ring." : "Birinchi o‘quvchini qo‘shing."}
          action={canManage && !query && !classId ? <Button onClick={openCreate}>O‘quvchi qo‘shish</Button> : undefined}
        />
      ) : (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>F.I.Sh.</TableHead>
                <TableHead>Sinf</TableHead>
                <TableHead>Tug‘ilgan sana</TableHead>
                <TableHead>Holat</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {students.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <div className="font-medium">
                      {row.lastName} {row.firstName} {row.middleName ?? ""}
                    </div>
                    {row.externalId && <div className="text-xs text-muted-foreground">ID: {row.externalId}</div>}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{row.className ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{row.birthDate ?? "—"}</TableCell>
                  <TableCell>
                    {row.status === "ACTIVE" && row.isActive ? (
                      <Badge variant="success">{STATUS_LABEL.ACTIVE}</Badge>
                    ) : row.status === "ACTIVE" ? (
                      <Badge variant="warning">Faol emas</Badge>
                    ) : (
                      <Badge variant="outline">{STATUS_LABEL[row.status]}</Badge>
                    )}
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
                          <Link href={`/dashboard/students/${row.id}`}>
                            <Eye /> Batafsil
                          </Link>
                        </DropdownMenuItem>
                        {canManage && (
                          <>
                            <DropdownMenuItem onSelect={() => openEdit(row)}>
                              <Pencil /> Tahrirlash
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() => {
                                setEnrollTarget(row);
                                setEnrollClassId(row.classId ?? "");
                                enrollAction.reset();
                              }}
                            >
                              <UserPlus /> Sinfga biriktirish
                            </DropdownMenuItem>
                            {row.enrollmentId && (
                              <DropdownMenuItem onSelect={() => unenroll(row)}>Sinfdan chiqarish</DropdownMenuItem>
                            )}
                            <DropdownMenuItem onSelect={() => setStatus(row, "TRANSFERRED")}>
                              Ko‘chirilgan deb belgilash
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => setStatus(row, "GRADUATED")}>
                              Bitirgan deb belgilash
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => setStatus(row, "ACTIVE")}>Faollashtirish</DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="border-t px-4 py-3">
            <Pagination
              page={page}
              pageSize={pageSize}
              total={total}
              onPageChange={(next) => push({ page: String(next) })}
            />
          </div>
        </div>
      )}

      {/* Create / edit */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{form.id ? "O‘quvchini tahrirlash" : "Yangi o‘quvchi"}</DialogTitle>
            <DialogDescription>O‘quvchi ma’lumotlarini to‘ldiring va sinfga biriktiring.</DialogDescription>
          </DialogHeader>

          <form onSubmit={submit} className="space-y-4">
            {formAction.error && (
              <Alert variant="destructive">
                <AlertDescription className="text-foreground">{formAction.error}</AlertDescription>
              </Alert>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Familiya" htmlFor="lastName" required error={formAction.fieldErrors["lastName"]}>
                <Input id="lastName" value={form.lastName} onChange={(e) => set("lastName", e.target.value)} required />
              </FormField>
              <FormField label="Ism" htmlFor="firstName" required error={formAction.fieldErrors["firstName"]}>
                <Input id="firstName" value={form.firstName} onChange={(e) => set("firstName", e.target.value)} required />
              </FormField>
              <FormField label="Otasining ismi" htmlFor="middleName" error={formAction.fieldErrors["middleName"]}>
                <Input id="middleName" value={form.middleName} onChange={(e) => set("middleName", e.target.value)} />
              </FormField>
              <FormField label="Tashqi ID" htmlFor="externalId" error={formAction.fieldErrors["externalId"]} hint="eMaktab yoki boshqa tizim IDsi">
                <Input id="externalId" value={form.externalId} onChange={(e) => set("externalId", e.target.value)} />
              </FormField>
              <FormField label="Tug‘ilgan sana" htmlFor="birthDate" error={formAction.fieldErrors["birthDate"]}>
                <Input id="birthDate" type="date" value={form.birthDate} onChange={(e) => set("birthDate", e.target.value)} />
              </FormField>
              <FormField label="Jinsi" htmlFor="gender" error={formAction.fieldErrors["gender"]}>
                <Select value={form.gender || NO_CLASS} onValueChange={(value) => set("gender", value === NO_CLASS ? "" : value)}>
                  <SelectTrigger id="gender">
                    <SelectValue placeholder="Tanlanmagan" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_CLASS}>Tanlanmagan</SelectItem>
                    <SelectItem value="MALE">O‘g‘il</SelectItem>
                    <SelectItem value="FEMALE">Qiz</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label="Sinf" htmlFor="classId" error={formAction.fieldErrors["classId"]}>
                <Select value={form.classId || NO_CLASS} onValueChange={(value) => set("classId", value === NO_CLASS ? "" : value)}>
                  <SelectTrigger id="classId">
                    <SelectValue placeholder="Tanlanmagan" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_CLASS}>Tanlanmagan</SelectItem>
                    {classes.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label="Holat" htmlFor="status" error={formAction.fieldErrors["status"]}>
                <Select value={form.status} onValueChange={(value) => set("status", value)}>
                  <SelectTrigger id="status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">Faol</SelectItem>
                    <SelectItem value="TRANSFERRED">Ko‘chirilgan</SelectItem>
                    <SelectItem value="GRADUATED">Bitirgan</SelectItem>
                    <SelectItem value="INACTIVE">Nofaol</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label="Vasiy" htmlFor="guardianName" error={formAction.fieldErrors["guardianName"]}>
                <Input id="guardianName" value={form.guardianName} onChange={(e) => set("guardianName", e.target.value)} />
              </FormField>
              <FormField label="Vasiy telefoni" htmlFor="guardianPhone" error={formAction.fieldErrors["guardianPhone"]}>
                <Input
                  id="guardianPhone"
                  value={form.guardianPhone}
                  onChange={(e) => set("guardianPhone", e.target.value)}
                  placeholder="+998 ..."
                />
              </FormField>
              <FormField label="Izoh" htmlFor="note" error={formAction.fieldErrors["note"]} className="sm:col-span-2">
                <Textarea id="note" value={form.note} onChange={(e) => set("note", e.target.value)} rows={2} />
              </FormField>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label htmlFor="studentActive">Faol holat</Label>
                <p className="text-xs text-muted-foreground">Nofaol o‘quvchi davomat ro‘yxatida ko‘rinmaydi.</p>
              </div>
              <Switch id="studentActive" checked={form.isActive} onCheckedChange={(value) => set("isActive", value)} />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Bekor qilish
              </Button>
              <Button type="submit" disabled={formAction.pending}>
                {formAction.pending ? "Saqlanmoqda..." : form.id ? "Saqlash" : "Qo‘shish"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Enroll dialog */}
      <Dialog open={Boolean(enrollTarget)} onOpenChange={(value) => !value && setEnrollTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sinfga biriktirish</DialogTitle>
            <DialogDescription>
              {enrollTarget ? `${enrollTarget.lastName} ${enrollTarget.firstName} uchun sinf tanlang.` : ""}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitEnroll} className="space-y-4">
            {enrollAction.error && (
              <Alert variant="destructive">
                <AlertDescription className="text-foreground">{enrollAction.error}</AlertDescription>
              </Alert>
            )}
            <FormField label="Sinf" htmlFor="enrollClass" required>
              <Select value={enrollClassId} onValueChange={setEnrollClassId}>
                <SelectTrigger id="enrollClass">
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
            </FormField>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEnrollTarget(null)}>
                Bekor qilish
              </Button>
              <Button type="submit" disabled={enrollAction.pending || !enrollClassId}>
                {enrollAction.pending ? "Saqlanmoqda..." : "Biriktirish"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
