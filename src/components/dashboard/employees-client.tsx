"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, KeyRound, MoreHorizontal, Pencil, Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAction } from "@/hooks/use-action";
import {
  createEmployeeAction,
  resetEmployeePasswordAction,
  setEmployeeActiveAction,
  updateEmployeeAction,
} from "@/lib/actions/employees";

export type EmployeeRow = {
  id: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  login: string;
  phone: string | null;
  roleKey: "DEPUTY_DIRECTOR" | "TEACHER" | "EMPLOYEE";
  roleName: string;
  position: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
};

export const ROLE_OPTIONS: { value: EmployeeRow["roleKey"]; label: string }[] = [
  { value: "DEPUTY_DIRECTOR", label: "O‘quv ishlari bo‘yicha o‘rinbosar" },
  { value: "TEACHER", label: "Sinf rahbari / o‘qituvchi" },
  { value: "EMPLOYEE", label: "Xodim" },
];

const ROLE_LABEL: Record<EmployeeRow["roleKey"], string> = {
  DEPUTY_DIRECTOR: "O‘rinbosar",
  TEACHER: "O‘qituvchi",
  EMPLOYEE: "Xodim",
};

type FormState = {
  id?: string;
  firstName: string;
  lastName: string;
  middleName: string;
  login: string;
  phone: string;
  roleKey: EmployeeRow["roleKey"];
  position: string;
  password: string;
  isActive: boolean;
};

const EMPTY: FormState = {
  firstName: "",
  lastName: "",
  middleName: "",
  login: "",
  phone: "",
  roleKey: "TEACHER",
  position: "",
  password: "",
  isActive: true,
};

function toForm(row: EmployeeRow): FormState {
  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    middleName: row.middleName ?? "",
    login: row.login,
    phone: row.phone ?? "",
    roleKey: row.roleKey,
    position: row.position ?? "",
    password: "",
    isActive: row.isActive,
  };
}

export function EmployeesClient({ employees }: { employees: EmployeeRow[] }) {
  const router = useRouter();
  const formAction = useAction();
  const rowAction = useAction();
  const resetAction = useAction();

  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState<FormState>(EMPTY);
  const [temporaryPassword, setTemporaryPassword] = React.useState<string | null>(null);

  const [resetTarget, setResetTarget] = React.useState<EmployeeRow | null>(null);
  const [resetPassword, setResetPassword] = React.useState("");

  const openCreate = () => {
    setForm(EMPTY);
    formAction.reset();
    setOpen(true);
  };
  const openEdit = (row: EmployeeRow) => {
    setForm(toForm(row));
    formAction.reset();
    setOpen(true);
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    formAction.run(() => (form.id ? updateEmployeeAction(form) : createEmployeeAction(form)), {
      onSuccess: (data) => {
        setOpen(false);
        const result = data as { temporaryPassword?: string | null } | undefined;
        if (result?.temporaryPassword) setTemporaryPassword(result.temporaryPassword);
        router.refresh();
      },
    });
  };

  const toggleActive = (row: EmployeeRow) => {
    rowAction.run(() => setEmployeeActiveAction({ id: row.id, isActive: !row.isActive }), {
      onSuccess: () => router.refresh(),
    });
  };

  const submitReset = (event: React.FormEvent) => {
    event.preventDefault();
    if (!resetTarget) return;
    resetAction.run(() => resetEmployeePasswordAction({ userId: resetTarget.id, password: resetPassword }), {
      onSuccess: () => {
        setResetTarget(null);
        setResetPassword("");
      },
    });
  };

  const set = (key: keyof FormState, value: string | boolean) => setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openCreate}>
          <Plus /> Xodim qo‘shish
        </Button>
      </div>

      {employees.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Hozircha xodim yo‘q"
          description="Maktabingiz xodimlarini qo‘shing va ularga rol biriktiring."
        />
      ) : (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>F.I.Sh.</TableHead>
                <TableHead>Login</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Lavozim</TableHead>
                <TableHead>Holat</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <div className="font-medium">
                      {row.lastName} {row.firstName}
                    </div>
                    {row.phone && <div className="text-xs text-muted-foreground">{row.phone}</div>}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{row.login}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{ROLE_LABEL[row.roleKey]}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{row.position || "—"}</TableCell>
                  <TableCell>
                    {row.isActive ? <Badge variant="success">Faol</Badge> : <Badge variant="outline">Faol emas</Badge>}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label="Amallar">
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => openEdit(row)}>
                          <Pencil /> Tahrirlash
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => {
                            setResetTarget(row);
                            setResetPassword("");
                            resetAction.reset();
                          }}
                        >
                          <KeyRound /> Parolni tiklash
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => toggleActive(row)}>
                          {row.isActive ? "Faolsizlantirish" : "Faollashtirish"}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {rowAction.error && (
        <Alert variant="destructive">
          <AlertDescription className="text-foreground">{rowAction.error}</AlertDescription>
        </Alert>
      )}

      {/* Create / edit dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{form.id ? "Xodimni tahrirlash" : "Yangi xodim"}</DialogTitle>
            <DialogDescription>
              Xodim maktabingizga biriktiriladi. Tizimga faqat shu maktab ma’lumotlari ko‘rinadi.
            </DialogDescription>
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
              <FormField label="Telefon" htmlFor="phone" error={formAction.fieldErrors["phone"]}>
                <Input id="phone" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+998 ..." />
              </FormField>
              <FormField label="Login" htmlFor="login" required error={formAction.fieldErrors["login"]}>
                <Input id="login" value={form.login} onChange={(e) => set("login", e.target.value)} required />
              </FormField>
              <FormField label="Lavozim" htmlFor="position" error={formAction.fieldErrors["position"]}>
                <Input id="position" value={form.position} onChange={(e) => set("position", e.target.value)} />
              </FormField>
              <FormField label="Rol" htmlFor="roleKey" required error={formAction.fieldErrors["roleKey"]}>
                <Select value={form.roleKey} onValueChange={(value) => set("roleKey", value)}>
                  <SelectTrigger id="roleKey">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
              <FormField
                label={form.id ? "Yangi parol (ixtiyoriy)" : "Parol (ixtiyoriy)"}
                htmlFor="password"
                error={formAction.fieldErrors["password"]}
                hint={form.id ? "Bo‘sh qoldirilsa parol o‘zgarmaydi." : "Bo‘sh qoldirilsa avtomatik parol yaratiladi."}
              >
                <Input
                  id="password"
                  type="text"
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(e) => set("password", e.target.value)}
                />
              </FormField>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label htmlFor="employeeActive">Faol holat</Label>
                <p className="text-xs text-muted-foreground">Faol bo‘lmagan xodim tizimga kira olmaydi.</p>
              </div>
              <Switch
                id="employeeActive"
                checked={form.isActive}
                onCheckedChange={(value) => set("isActive", value)}
              />
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

      {/* Temporary password dialog */}
      <Dialog open={Boolean(temporaryPassword)} onOpenChange={(value) => !value && setTemporaryPassword(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Vaqtinchalik parol</DialogTitle>
            <DialogDescription>
              Bu parolni xodimga xavfsiz usulda yetkazing. U birinchi kirishda almashtirilishi tavsiya etiladi.
            </DialogDescription>
          </DialogHeader>
          <TemporaryPassword value={temporaryPassword ?? ""} />
          <DialogFooter>
            <Button onClick={() => setTemporaryPassword(null)}>Tushunarli</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset password dialog */}
      <Dialog open={Boolean(resetTarget)} onOpenChange={(value) => !value && setResetTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Parolni tiklash</DialogTitle>
            <DialogDescription>
              {resetTarget ? `${resetTarget.lastName} ${resetTarget.firstName} uchun yangi parol o‘rnatiladi.` : ""}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitReset} className="space-y-4">
            {resetAction.error && (
              <Alert variant="destructive">
                <AlertDescription className="text-foreground">{resetAction.error}</AlertDescription>
              </Alert>
            )}
            <FormField label="Yangi parol" htmlFor="resetPassword" required error={resetAction.fieldErrors["password"]}>
              <Input
                id="resetPassword"
                type="text"
                autoComplete="new-password"
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                minLength={8}
                required
              />
            </FormField>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setResetTarget(null)}>
                Bekor qilish
              </Button>
              <Button type="submit" disabled={resetAction.pending}>
                {resetAction.pending ? "Saqlanmoqda..." : "Parolni tiklash"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TemporaryPassword({ value }: { value: string }) {
  const [copied, setCopied] = React.useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };
  return (
    <Alert variant="success">
      <AlertTitle>Parol yaratildi</AlertTitle>
      <AlertDescription>
        <div className="mt-2 flex items-center gap-2">
          <code className="rounded bg-muted px-2 py-1 font-mono text-sm text-foreground">{value}</code>
          <Button type="button" variant="outline" size="sm" onClick={copy}>
            {copied ? <Check /> : <Copy />} {copied ? "Nusxalandi" : "Nusxalash"}
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
