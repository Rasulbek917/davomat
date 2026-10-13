"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Building2, MoreHorizontal, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FormField } from "@/components/ui/form-field";
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
import { createSchoolAction, setSchoolActiveAction, updateSchoolAction } from "@/lib/actions/schools";

export type SchoolRow = {
  id: string;
  code: string;
  name: string;
  region: string | null;
  district: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  isActive: boolean;
  directorCount: number;
  studentCount: number;
  classCount: number;
};

type FormState = {
  id?: string;
  code: string;
  name: string;
  region: string;
  district: string;
  address: string;
  phone: string;
  email: string;
  isActive: boolean;
};

const EMPTY: FormState = {
  code: "",
  name: "",
  region: "",
  district: "",
  address: "",
  phone: "",
  email: "",
  isActive: true,
};

function toForm(row: SchoolRow): FormState {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    region: row.region ?? "",
    district: row.district ?? "",
    address: row.address ?? "",
    phone: row.phone ?? "",
    email: row.email ?? "",
    isActive: row.isActive,
  };
}

export function SchoolsClient({ schools }: { schools: SchoolRow[] }) {
  const router = useRouter();
  const { pending, error, fieldErrors, run, reset } = useAction();
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState<FormState>(EMPTY);

  const openCreate = () => {
    setForm(EMPTY);
    reset();
    setOpen(true);
  };
  const openEdit = (row: SchoolRow) => {
    setForm(toForm(row));
    reset();
    setOpen(true);
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    run(() => (form.id ? updateSchoolAction(form) : createSchoolAction(form)), {
      onSuccess: () => {
        setOpen(false);
        router.refresh();
      },
    });
  };

  const toggleActive = (row: SchoolRow) => {
    run(() => setSchoolActiveAction({ id: row.id, isActive: !row.isActive }), {
      onSuccess: () => router.refresh(),
    });
  };

  const set = (key: keyof FormState, value: string | boolean) => setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openCreate}>
          <Plus /> Maktab qo‘shish
        </Button>
      </div>

      {schools.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="Hozircha maktab yo‘q"
          description="Birinchi maktabni qo‘shish uchun yuqoridagi tugmani bosing."
        />
      ) : (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Maktab</TableHead>
                <TableHead>Hudud</TableHead>
                <TableHead className="text-right">Direktor</TableHead>
                <TableHead className="text-right">Sinf</TableHead>
                <TableHead className="text-right">O‘quvchi</TableHead>
                <TableHead>Holat</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {schools.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <div className="font-medium">{row.name}</div>
                    <div className="text-xs text-muted-foreground">{row.code}</div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {[row.region, row.district].filter(Boolean).join(", ") || "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{row.directorCount}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.classCount}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.studentCount}</TableCell>
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{form.id ? "Maktabni tahrirlash" : "Yangi maktab"}</DialogTitle>
            <DialogDescription>Maktab ma’lumotlarini to‘ldiring. Kod tizimda yagona bo‘lishi kerak.</DialogDescription>
          </DialogHeader>

          <form onSubmit={submit} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription className="text-foreground">{error}</AlertDescription>
              </Alert>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Maktab kodi" htmlFor="code" required error={fieldErrors["code"]}>
                <Input id="code" value={form.code} onChange={(e) => set("code", e.target.value)} placeholder="m-101" required />
              </FormField>
              <FormField label="Maktab nomi" htmlFor="name" required error={fieldErrors["name"]}>
                <Input id="name" value={form.name} onChange={(e) => set("name", e.target.value)} required />
              </FormField>
              <FormField label="Viloyat" htmlFor="region" error={fieldErrors["region"]}>
                <Input id="region" value={form.region} onChange={(e) => set("region", e.target.value)} />
              </FormField>
              <FormField label="Tuman / shahar" htmlFor="district" error={fieldErrors["district"]}>
                <Input id="district" value={form.district} onChange={(e) => set("district", e.target.value)} />
              </FormField>
              <FormField label="Telefon" htmlFor="phone" error={fieldErrors["phone"]}>
                <Input id="phone" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+998 ..." />
              </FormField>
              <FormField label="Email" htmlFor="email" error={fieldErrors["email"]}>
                <Input id="email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
              </FormField>
              <FormField label="Manzil" htmlFor="address" error={fieldErrors["address"]} className="sm:col-span-2">
                <Input id="address" value={form.address} onChange={(e) => set("address", e.target.value)} />
              </FormField>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label htmlFor="isActive">Faol holat</Label>
                <p className="text-xs text-muted-foreground">Faol bo‘lmagan maktab foydalanuvchilari tizimga kira olmaydi.</p>
              </div>
              <Switch id="isActive" checked={form.isActive} onCheckedChange={(v) => set("isActive", v)} />
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
