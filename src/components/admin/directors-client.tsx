"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { KeyRound, MoreHorizontal, Pencil, Plus, UserCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { FormField } from "@/components/ui/form-field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { useAction } from "@/hooks/use-action";
import {
  createDirectorAction,
  resetPasswordAction,
  setDirectorActiveAction,
  updateDirectorAction,
} from "@/lib/actions/schools";

export type DirectorRow = {
  id: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  login: string;
  phone: string | null;
  schoolId: string;
  schoolName: string;
  isActive: boolean;
  mustChangePassword: boolean;
};

export type SchoolOption = { id: string; name: string; isActive: boolean };

type FormState = {
  id?: string;
  firstName: string;
  lastName: string;
  middleName: string;
  login: string;
  phone: string;
  schoolId: string;
  password: string;
  isActive: boolean;
};

const emptyForm = (schoolId: string): FormState => ({
  firstName: "",
  lastName: "",
  middleName: "",
  login: "",
  phone: "",
  schoolId,
  password: "",
  isActive: true,
});

export function DirectorsClient({
  directors,
  schools,
}: {
  directors: DirectorRow[];
  schools: SchoolOption[];
}) {
  const router = useRouter();
  const { pending, error, fieldErrors, run, reset, setError } = useAction();
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState<FormState>(emptyForm(schools[0]?.id ?? ""));
  const [tempPassword, setTempPassword] = React.useState<{ login: string; password: string } | null>(null);

  const [resetTarget, setResetTarget] = React.useState<DirectorRow | null>(null);
  const [resetPassword, setResetPasswordValue] = React.useState("");
  const [resetDone, setResetDone] = React.useState(false);

  const set = (key: keyof FormState, value: string | boolean) => setForm((prev) => ({ ...prev, [key]: value }));

  const openCreate = () => {
    setForm(emptyForm(schools[0]?.id ?? ""));
    reset();
    setOpen(true);
  };
  const openEdit = (row: DirectorRow) => {
    setForm({
      id: row.id,
      firstName: row.firstName,
      lastName: row.lastName,
      middleName: row.middleName ?? "",
      login: row.login,
      phone: row.phone ?? "",
      schoolId: row.schoolId,
      password: "",
      isActive: row.isActive,
    });
    reset();
    setOpen(true);
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    run(() => (form.id ? updateDirectorAction(form) : createDirectorAction(form)), {
      onSuccess: (data) => {
        setOpen(false);
        router.refresh();
        const payload = data as { temporaryPassword: string | null } | undefined;
        if (payload?.temporaryPassword) {
          setTempPassword({ login: form.login, password: payload.temporaryPassword });
        }
      },
    });
  };

  const toggleActive = (row: DirectorRow) => {
    run(() => setDirectorActiveAction({ id: row.id, isActive: !row.isActive }), {
      onSuccess: () => router.refresh(),
    });
  };

  const submitReset = (event: React.FormEvent) => {
    event.preventDefault();
    if (!resetTarget) return;
    run(() => resetPasswordAction({ userId: resetTarget.id, password: resetPassword }), {
      onSuccess: () => {
        setResetDone(true);
        setResetPasswordValue("");
      },
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openCreate} disabled={schools.length === 0}>
          <Plus /> Direktor qo‘shish
        </Button>
      </div>

      {directors.length === 0 ? (
        <EmptyState
          icon={UserCog}
          title="Direktorlar yo‘q"
          description="Maktabga direktor biriktirish uchun yangi direktor qo‘shing."
        />
      ) : (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>F.I.Sh.</TableHead>
                <TableHead>Login</TableHead>
                <TableHead>Maktab</TableHead>
                <TableHead>Holat</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {directors.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">
                    {[row.lastName, row.firstName, row.middleName].filter(Boolean).join(" ")}
                  </TableCell>
                  <TableCell className="font-mono text-sm">{row.login}</TableCell>
                  <TableCell>{row.schoolName}</TableCell>
                  <TableCell>
                    {row.isActive ? <Badge variant="success">Faol</Badge> : <Badge variant="outline">Faol emas</Badge>}
                    {row.mustChangePassword && <Badge variant="warning" className="ml-2">Parol almashtirilmagan</Badge>}
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
                            setResetDone(false);
                            setResetPasswordValue("");
                            setError(null);
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

      {/* Create / edit */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{form.id ? "Direktorni tahrirlash" : "Yangi direktor"}</DialogTitle>
            <DialogDescription>
              Direktor o‘z maktabi doirasida xodimlar, sinflar va davomatni boshqaradi.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription className="text-foreground">{error}</AlertDescription>
              </Alert>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Familiya" htmlFor="lastName" required error={fieldErrors["lastName"]}>
                <Input id="lastName" value={form.lastName} onChange={(e) => set("lastName", e.target.value)} required />
              </FormField>
              <FormField label="Ism" htmlFor="firstName" required error={fieldErrors["firstName"]}>
                <Input id="firstName" value={form.firstName} onChange={(e) => set("firstName", e.target.value)} required />
              </FormField>
              <FormField label="Otasining ismi" htmlFor="middleName" error={fieldErrors["middleName"]}>
                <Input id="middleName" value={form.middleName} onChange={(e) => set("middleName", e.target.value)} />
              </FormField>
              <FormField label="Telefon" htmlFor="phone" error={fieldErrors["phone"]}>
                <Input id="phone" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
              </FormField>
              <FormField label="Login" htmlFor="login" required error={fieldErrors["login"]}>
                <Input id="login" value={form.login} onChange={(e) => set("login", e.target.value)} required autoComplete="off" />
              </FormField>
              <FormField label="Maktab" required error={fieldErrors["schoolId"]}>
                <Select value={form.schoolId} onValueChange={(v) => set("schoolId", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Maktabni tanlang" />
                  </SelectTrigger>
                  <SelectContent>
                    {schools.map((school) => (
                      <SelectItem key={school.id} value={school.id}>
                        {school.name}
                        {!school.isActive ? " (faol emas)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
              <FormField
                label={form.id ? "Yangi parol (ixtiyoriy)" : "Boshlang‘ich parol (ixtiyoriy)"}
                htmlFor="password"
                error={fieldErrors["password"]}
                hint="Bo‘sh qoldirilsa, xavfsiz vaqtinchalik parol yaratiladi."
                className="sm:col-span-2"
              >
                <Input
                  id="password"
                  type="text"
                  value={form.password}
                  onChange={(e) => set("password", e.target.value)}
                  autoComplete="new-password"
                  placeholder="Kamida 8 belgi"
                />
              </FormField>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label htmlFor="dirActive">Faol holat</Label>
                <p className="text-xs text-muted-foreground">Faolsizlantirilsa, direktor tizimga kira olmaydi.</p>
              </div>
              <Switch id="dirActive" checked={form.isActive} onCheckedChange={(v) => set("isActive", v)} />
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

      {/* Temporary password */}
      <Dialog open={Boolean(tempPassword)} onOpenChange={(v) => !v && setTempPassword(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Vaqtinchalik parol</DialogTitle>
            <DialogDescription>
              Ushbu parolni direktorga xavfsiz usulda yetkazing. U birinchi kirishda o‘zgartirilishi kerak.
            </DialogDescription>
          </DialogHeader>
          {tempPassword && (
            <Alert variant="warning">
              <AlertTitle>Login: {tempPassword.login}</AlertTitle>
              <AlertDescription>
                <span className="select-all font-mono text-base text-foreground">{tempPassword.password}</span>
              </AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button onClick={() => setTempPassword(null)}>Tushundim</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset password */}
      <Dialog
        open={Boolean(resetTarget)}
        onOpenChange={(v) => {
          if (!v) setResetTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Parolni tiklash</DialogTitle>
            <DialogDescription>
              {resetTarget ? `${resetTarget.lastName} ${resetTarget.firstName}` : ""} uchun yangi parol o‘rnating.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitReset} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription className="text-foreground">{error}</AlertDescription>
              </Alert>
            )}
            {resetDone && (
              <Alert variant="success">
                <AlertDescription className="text-foreground">Parol yangilandi. Foydalanuvchi qayta kirishi kerak.</AlertDescription>
              </Alert>
            )}
            <FormField label="Yangi parol" htmlFor="resetPassword" required error={fieldErrors["password"]}>
              <Input
                id="resetPassword"
                type="text"
                value={resetPassword}
                onChange={(e) => setResetPasswordValue(e.target.value)}
                minLength={8}
                required
              />
            </FormField>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setResetTarget(null)}>
                Yopish
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Saqlanmoqda..." : "Parolni o‘rnatish"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
