"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Link2,
  Loader2,
  Plug,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { FormField } from "@/components/ui/form-field";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAction } from "@/hooks/use-action";
import {
  deleteIntegrationAction,
  resolveReviewItemAction,
  runApiSyncAction,
  runFileImportAction,
  saveApiIntegrationAction,
  saveCsvIntegrationAction,
  setIntegrationEnabledAction,
  testIntegrationAction,
} from "@/lib/actions/integration";
import { ACADEMIC_YEAR_DEFAULT } from "@/lib/constants";

// ---------------------------------------------------------------------------
// Shared display types (kept client-safe: no server-only imports)
// ---------------------------------------------------------------------------

export type ProviderKey = "CSV_EXCEL" | "EMAKTAB_API";

export type IntegrationSummary = {
  id: string;
  provider: ProviderKey;
  name: string;
  isEnabled: boolean;
  baseUrl: string | null;
  credentialHint: string | null;
  endpointPath: string | null;
  delimiter: string;
  hasHeader: boolean;
  defaultAcademicYear: string;
  hasCredentials: boolean;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastSyncMessage: string | null;
};

export type SyncLogRow = {
  id: string;
  source: string;
  providerLabel: string;
  status: string;
  dryRun: boolean;
  startedAtLabel: string;
  finishedAtLabel: string | null;
  classesCreated: number;
  classesUpdated: number;
  studentsCreated: number;
  studentsUpdated: number;
  enrollmentsCreated: number;
  enrollmentsUpdated: number;
  recordsSkipped: number;
  summary: string | null;
  triggeredByName: string | null;
  errors: string[];
};

export type ReviewRow = {
  id: string;
  entityType: string;
  externalId: string | null;
  reason: string;
  reasonLabel: string;
  payload: {
    firstName?: string | null;
    lastName?: string | null;
    middleName?: string | null;
    className?: string | null;
    birthDate?: string | null;
  };
  candidateNames: string[];
  createdAtLabel: string;
};

export type StudentOption = { id: string; label: string };

type ImportOutcomeView = {
  status: string;
  dryRun: boolean;
  summary: string;
  counts: {
    classesCreated: number;
    classesUpdated: number;
    studentsCreated: number;
    studentsUpdated: number;
    enrollmentsCreated: number;
    enrollmentsUpdated: number;
    recordsSkipped: number;
  };
  warnings: string[];
  reviewItems: number;
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Kutilmoqda",
  RUNNING: "Davom etmoqda",
  SUCCESS: "Muvaffaqiyatli",
  PARTIAL: "Qisman",
  FAILED: "Xato",
};

const STATUS_VARIANT: Record<string, "success" | "warning" | "destructive" | "info" | "outline"> = {
  SUCCESS: "success",
  PARTIAL: "warning",
  FAILED: "destructive",
  RUNNING: "info",
  PENDING: "outline",
};

export function IntegrationClient({
  configs,
  syncLogs,
  reviews,
  students,
  canManage,
}: {
  configs: IntegrationSummary[];
  syncLogs: SyncLogRow[];
  reviews: ReviewRow[];
  students: StudentOption[];
  canManage: boolean;
}) {
  const csvConfigs = configs.filter((c) => c.provider === "CSV_EXCEL");
  const apiConfigs = configs.filter((c) => c.provider === "EMAKTAB_API");

  return (
    <Tabs defaultValue="configs" className="space-y-6">
      <TabsList>
        <TabsTrigger value="configs" className="gap-2">
          <Link2 className="h-4 w-4" /> Sozlamalar
        </TabsTrigger>
        <TabsTrigger value="history" className="gap-2">
          <RefreshCw className="h-4 w-4" /> Sinxronizatsiya tarixi
        </TabsTrigger>
        <TabsTrigger value="review" className="gap-2">
          <AlertTriangle className="h-4 w-4" /> Tekshirish
          {reviews.length > 0 && <Badge variant="warning">{reviews.length}</Badge>}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="configs" className="space-y-6">
        {configs.length === 0 && (
          <Alert variant="info">
            <Link2 />
            <AlertTitle>Integratsiya hali sozlanmagan</AlertTitle>
            <AlertDescription className="text-foreground">
              Rasmiy eMaktab API mavjud bo‘lmasa, CSV/Excel import usulidan foydalaning. Tizim eMaktab veb-interfeysini
              avtomatik yuklab olmaydi va himoya (CAPTCHA/MFA) chetlab o‘tilmaydi.
            </AlertDescription>
          </Alert>
        )}

        <CsvSection configs={csvConfigs} canManage={canManage} />
        <ApiSection configs={apiConfigs} canManage={canManage} />
      </TabsContent>

      <TabsContent value="history">
        <SyncHistory logs={syncLogs} />
      </TabsContent>

      <TabsContent value="review">
        <ReviewSection reviews={reviews} students={students} canManage={canManage} />
      </TabsContent>
    </Tabs>
  );
}

// ---------------------------------------------------------------------------
// CSV / Excel
// ---------------------------------------------------------------------------

type CsvFormState = {
  id?: string;
  name: string;
  delimiter: string;
  hasHeader: boolean;
  defaultAcademicYear: string;
  isEnabled: boolean;
};

const EMPTY_CSV: CsvFormState = {
  name: "",
  delimiter: ",",
  hasHeader: true,
  defaultAcademicYear: ACADEMIC_YEAR_DEFAULT,
  isEnabled: true,
};

function CsvSection({ configs, canManage }: { configs: IntegrationSummary[]; canManage: boolean }) {
  const router = useRouter();
  const saveAction = useAction();
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState<CsvFormState>(EMPTY_CSV);

  const openCreate = () => {
    setForm(EMPTY_CSV);
    saveAction.reset();
    setOpen(true);
  };

  const openEdit = (config: IntegrationSummary) => {
    setForm({
      id: config.id,
      name: config.name,
      delimiter: config.delimiter,
      hasHeader: config.hasHeader,
      defaultAcademicYear: config.defaultAcademicYear,
      isEnabled: config.isEnabled,
    });
    saveAction.reset();
    setOpen(true);
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    saveAction.run(() => saveCsvIntegrationAction(form), {
      onSuccess: () => {
        setOpen(false);
        router.refresh();
      },
    });
  };

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0 gap-4">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" /> CSV / Excel import
          </CardTitle>
          <CardDescription>
            eMaktab yoki boshqa tizimdan rasmiy ruxsat bilan yuklangan CSV/XLSX faylini import qiladi. Takroriy import
            dublikat yaratmaydi.
          </CardDescription>
        </div>
        {canManage && (
          <Button onClick={openCreate}>
            <Plus /> Sozlama qo‘shish
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {configs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Hozircha CSV/Excel integratsiyasi sozlanmagan.</p>
        ) : (
          configs.map((config) => <ConfigCard key={config.id} config={config} canManage={canManage} onEdit={() => openEdit(config)} />)
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? "CSV/Excel sozlamasini tahrirlash" : "Yangi CSV/Excel integratsiyasi"}</DialogTitle>
            <DialogDescription>Ustun nomlari avtomatik aniqlanadi (o‘zbek, rus va ingliz nomlari qo‘llab-quvvatlanadi).</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            {saveAction.error && (
              <Alert variant="destructive">
                <AlertDescription className="text-foreground">{saveAction.error}</AlertDescription>
              </Alert>
            )}
            <FormField label="Nomi" htmlFor="csvName" required error={saveAction.fieldErrors["name"]}>
              <Input
                id="csvName"
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Masalan: eMaktab o‘quvchilar eksporti"
                required
              />
            </FormField>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Ajratuvchi" htmlFor="csvDelimiter" error={saveAction.fieldErrors["settings.delimiter"]}>
                <Select value={form.delimiter} onValueChange={(value) => setForm((prev) => ({ ...prev, delimiter: value }))}>
                  <SelectTrigger id="csvDelimiter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value=",">Vergul (,)</SelectItem>
                    <SelectItem value=";">Nuqtali vergul (;)</SelectItem>
                    <SelectItem value={"\t"}>Tab</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label="Standart o‘quv yili" htmlFor="csvYear" error={saveAction.fieldErrors["settings.defaultAcademicYear"]} hint="2025-2026">
                <Input
                  id="csvYear"
                  value={form.defaultAcademicYear}
                  onChange={(e) => setForm((prev) => ({ ...prev, defaultAcademicYear: e.target.value }))}
                />
              </FormField>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label htmlFor="csvHeader">Birinchi qator — sarlavha</Label>
                <p className="text-xs text-muted-foreground">Faylning birinchi qatori ustun nomlaridan iborat bo‘lsa, yoqing.</p>
              </div>
              <Switch id="csvHeader" checked={form.hasHeader} onCheckedChange={(value) => setForm((prev) => ({ ...prev, hasHeader: value }))} />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label htmlFor="csvEnabled">Yoqilgan</Label>
                <p className="text-xs text-muted-foreground">O‘chirilgan sozlamadan import ishga tushmaydi.</p>
              </div>
              <Switch id="csvEnabled" checked={form.isEnabled} onCheckedChange={(value) => setForm((prev) => ({ ...prev, isEnabled: value }))} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Bekor qilish
              </Button>
              <Button type="submit" disabled={saveAction.pending}>
                {saveAction.pending ? "Saqlanmoqda..." : form.id ? "Saqlash" : "Qo‘shish"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// eMaktab API
// ---------------------------------------------------------------------------

type ApiFormState = {
  id?: string;
  name: string;
  baseUrl: string;
  endpointPath: string;
  login: string;
  secret: string;
  isEnabled: boolean;
};

const EMPTY_API: ApiFormState = {
  name: "eMaktab API",
  baseUrl: "",
  endpointPath: "",
  login: "",
  secret: "",
  isEnabled: false,
};

function ApiSection({ configs, canManage }: { configs: IntegrationSummary[]; canManage: boolean }) {
  const router = useRouter();
  const saveAction = useAction();
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState<ApiFormState>(EMPTY_API);

  const openCreate = () => {
    setForm(EMPTY_API);
    saveAction.reset();
    setOpen(true);
  };

  const openEdit = (config: IntegrationSummary) => {
    setForm({
      id: config.id,
      name: config.name,
      baseUrl: config.baseUrl ?? "",
      endpointPath: config.endpointPath ?? "",
      login: config.credentialHint ?? "",
      secret: "",
      isEnabled: config.isEnabled,
    });
    saveAction.reset();
    setOpen(true);
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    saveAction.run(() => saveApiIntegrationAction(form), {
      onSuccess: () => {
        setOpen(false);
        router.refresh();
      },
    });
  };

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0 gap-4">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            <Plug className="h-5 w-5 text-primary" /> eMaktab rasmiy API
          </CardTitle>
          <CardDescription>
            Faqat rasmiy va hujjatlashtirilgan API mavjud bo‘lganda ishlaydi. Maxfiy kalit AES-256-GCM bilan shifrlanadi
            va hech qachon ochiq saqlanmaydi.
          </CardDescription>
        </div>
        {canManage && (
          <Button onClick={openCreate}>
            <Plus /> Sozlama qo‘shish
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {configs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Hozircha eMaktab API integratsiyasi sozlanmagan.</p>
        ) : (
          configs.map((config) => <ConfigCard key={config.id} config={config} canManage={canManage} onEdit={() => openEdit(config)} />)
        )}

        <Alert variant="info">
          <ShieldCheck />
          <AlertDescription className="text-foreground">
            Tizim eMaktab veb-saytini avtomatik yuklab olmaydi, autentifikatsiya/CAPTCHA/MFA himoyasini chetlab o‘tmaydi
            va uchinchi tomon parolini ochiq saqlamaydi.
          </AlertDescription>
        </Alert>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? "API sozlamasini tahrirlash" : "Yangi eMaktab API integratsiyasi"}</DialogTitle>
            <DialogDescription>Hujjatlashtirilgan manzil va ruxsat ma’lumotlarini kiriting.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            {saveAction.error && (
              <Alert variant="destructive">
                <AlertDescription className="text-foreground">{saveAction.error}</AlertDescription>
              </Alert>
            )}
            <FormField label="Nomi" htmlFor="apiName" required error={saveAction.fieldErrors["name"]}>
              <Input id="apiName" value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} required />
            </FormField>
            <FormField label="API manzili (baseUrl)" htmlFor="apiBase" required error={saveAction.fieldErrors["baseUrl"]} hint="Masalan: https://api.emaktab.uz">
              <Input id="apiBase" value={form.baseUrl} onChange={(e) => setForm((prev) => ({ ...prev, baseUrl: e.target.value }))} required />
            </FormField>
            <FormField label="Resurs yo‘li (endpoint)" htmlFor="apiEndpoint" error={saveAction.fieldErrors["endpointPath"]} hint="Masalan: /v1/school/classes">
              <Input id="apiEndpoint" value={form.endpointPath} onChange={(e) => setForm((prev) => ({ ...prev, endpointPath: e.target.value }))} />
            </FormField>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Login / token nomi" htmlFor="apiLogin" required error={saveAction.fieldErrors["login"]}>
                <Input id="apiLogin" value={form.login} onChange={(e) => setForm((prev) => ({ ...prev, login: e.target.value }))} required />
              </FormField>
              <FormField
                label={form.id ? "Maxfiy kalit (ixtiyoriy)" : "Maxfiy kalit / token"}
                htmlFor="apiSecret"
                error={saveAction.fieldErrors["secret"]}
                hint={form.id ? "Bo‘sh qoldirilsa avvalgi kalit saqlanadi." : undefined}
              >
                <Input
                  id="apiSecret"
                  type="password"
                  autoComplete="new-password"
                  value={form.secret}
                  onChange={(e) => setForm((prev) => ({ ...prev, secret: e.target.value }))}
                />
              </FormField>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label htmlFor="apiEnabled">Yoqilgan</Label>
                <p className="text-xs text-muted-foreground">O‘chirilgan sozlamadan sinxronizatsiya ishga tushmaydi.</p>
              </div>
              <Switch id="apiEnabled" checked={form.isEnabled} onCheckedChange={(value) => setForm((prev) => ({ ...prev, isEnabled: value }))} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Bekor qilish
              </Button>
              <Button type="submit" disabled={saveAction.pending}>
                {saveAction.pending ? "Saqlanmoqda..." : form.id ? "Saqlash" : "Qo‘shish"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Config card (shared by both providers)
// ---------------------------------------------------------------------------

function ConfigCard({
  config,
  canManage,
  onEdit,
}: {
  config: IntegrationSummary;
  canManage: boolean;
  onEdit: () => void;
}) {
  const router = useRouter();
  const toggleAction = useAction();
  const deleteAction = useAction();
  const testAction = useAction();
  const importAction = useAction();

  const fileRef = React.useRef<HTMLInputElement>(null);
  const [testResult, setTestResult] = React.useState<{ ok: boolean; message: string; details?: string[] } | null>(null);
  const [outcome, setOutcome] = React.useState<ImportOutcomeView | null>(null);

  const isFile = config.provider === "CSV_EXCEL";

  const toggle = () => {
    toggleAction.run(() => setIntegrationEnabledAction({ id: config.id, isEnabled: !config.isEnabled }), {
      onSuccess: () => router.refresh(),
    });
  };

  const remove = () => {
    if (!window.confirm(`"${config.name}" sozlamasini o‘chirishni tasdiqlaysizmi?`)) return;
    deleteAction.run(() => deleteIntegrationAction({ id: config.id }), { onSuccess: () => router.refresh() });
  };

  const runImport = (dryRun: boolean) => {
    setOutcome(null);
    if (isFile) {
      const file = fileRef.current?.files?.[0];
      if (!file) {
        testAction.setError("Import uchun CSV yoki Excel fayl tanlang.");
        return;
      }
      const fd = new FormData();
      fd.append("configId", config.id);
      fd.append("dryRun", dryRun ? "true" : "false");
      fd.append("file", file);
      runFormImport(fd);
    } else {
      importAction.run(() => runApiSyncAction({ id: config.id, dryRun }), {
        onSuccess: (data) => {
          setOutcome((data as ImportOutcomeView) ?? null);
          router.refresh();
        },
      });
    }
  };

  const runFormImport = (fd: FormData) => {
    importAction.run(() => runFileImportAction(fd), {
      onSuccess: (data) => {
        setOutcome((data as ImportOutcomeView) ?? null);
        router.refresh();
      },
    });
  };

  const test = () => {
    setTestResult(null);
    if (isFile) {
      const file = fileRef.current?.files?.[0];
      if (!file) {
        testAction.setError("Sinov uchun CSV yoki Excel fayl tanlang.");
        return;
      }
      const fd = new FormData();
      fd.append("configId", config.id);
      fd.append("file", file);
      testAction.run(() => testIntegrationAction(fd), {
        onSuccess: (data) => setTestResult((data as { ok: boolean; message: string; details?: string[] }) ?? null),
      });
    } else {
      const fd = new FormData();
      fd.append("configId", config.id);
      testAction.run(() => testIntegrationAction(fd), {
        onSuccess: (data) => setTestResult((data as { ok: boolean; message: string; details?: string[] }) ?? null),
      });
    }
  };

  const busy = toggleAction.pending || deleteAction.pending || testAction.pending || importAction.pending;

  return (
    <div className="rounded-xl border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b p-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{config.name}</span>
            {config.isEnabled ? <Badge variant="success">Yoqilgan</Badge> : <Badge variant="outline">O‘chirilgan</Badge>}
            {config.lastSyncStatus && (
              <Badge variant={STATUS_VARIANT[config.lastSyncStatus] ?? "outline"}>
                {STATUS_LABEL[config.lastSyncStatus] ?? config.lastSyncStatus}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {config.baseUrl ? `${config.baseUrl}${config.endpointPath ?? ""}` : "Manba: yuklangan fayl"}
            {config.lastSyncAt ? ` · oxirgi sinxronizatsiya: ${config.lastSyncAt}` : ""}
          </p>
          {config.credentialHint && <p className="text-xs text-muted-foreground">Ruxsat: {config.credentialHint}</p>}
        </div>
        {canManage && (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={toggle} disabled={busy}>
              {config.isEnabled ? "O‘chirish" : "Yoqish"}
            </Button>
            <Button variant="outline" size="sm" onClick={onEdit} disabled={busy}>
              Tahrirlash
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="O‘chirish" onClick={remove} disabled={busy}>
              <Trash2 />
            </Button>
          </div>
        )}
      </div>

      {canManage && (
        <div className="space-y-4 p-4">
          {isFile && (
            <div className="space-y-1.5">
              <Label htmlFor={`file-${config.id}`}>Fayl (.csv, .xlsx)</Label>
              <Input id={`file-${config.id}`} ref={fileRef} type="file" accept=".csv,.xlsx,.txt" disabled={busy} />
              <p className="text-xs text-muted-foreground">
                Ustunlar mos kelmasa,{" "}
                <a
                  className="font-medium text-primary hover:underline"
                  href="/namunalar/emaktab-oquvchilar.csv"
                  download
                >
                  namuna faylni yuklab oling
                </a>
                .
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={test} disabled={busy}>
              {testAction.pending ? <Loader2 className="animate-spin" /> : <Plug />} Ulanishni sinash
            </Button>
            <Button variant="outline" size="sm" onClick={() => runImport(true)} disabled={busy}>
              <RefreshCw /> Sinov import (dry-run)
            </Button>
            <Button size="sm" onClick={() => runImport(false)} disabled={busy}>
              {importAction.pending ? <Loader2 className="animate-spin" /> : <Upload />} Import qilish
            </Button>
          </div>

          {(testAction.error || importAction.error || toggleAction.error || deleteAction.error) && (
            <Alert variant="destructive">
              <AlertDescription className="text-foreground">
                {testAction.error ?? importAction.error ?? toggleAction.error ?? deleteAction.error}
              </AlertDescription>
            </Alert>
          )}

          {testResult && (
            <Alert variant={testResult.ok ? "success" : "warning"}>
              {testResult.ok ? <CheckCircle2 /> : <XCircle />}
              <AlertTitle>{testResult.message}</AlertTitle>
              {testResult.details && testResult.details.length > 0 && (
                <AlertDescription className="text-foreground">
                  <ul className="list-disc space-y-0.5 pl-5">
                    {testResult.details.map((detail, index) => (
                      <li key={index}>{detail}</li>
                    ))}
                  </ul>
                </AlertDescription>
              )}
            </Alert>
          )}

          {outcome && <OutcomeAlert outcome={outcome} />}
        </div>
      )}

      {!canManage && config.lastSyncMessage && (
        <p className="border-t px-4 py-3 text-xs text-muted-foreground">{config.lastSyncMessage}</p>
      )}
    </div>
  );
}

function OutcomeAlert({ outcome }: { outcome: ImportOutcomeView }) {
  const counts = outcome.counts;
  return (
    <Alert variant={outcome.status === "FAILED" ? "destructive" : outcome.status === "PARTIAL" ? "warning" : "success"}>
      <CheckCircle2 />
      <AlertTitle>{outcome.dryRun ? "Sinov natijasi" : STATUS_LABEL[outcome.status] ?? outcome.status}</AlertTitle>
      <AlertDescription className="text-foreground">
        <p>{outcome.summary}</p>
        <p className="mt-1 text-xs">
          {counts.classesCreated} sinf qo‘shildi · {counts.classesUpdated} sinf yangilandi · {counts.studentsCreated} o‘quvchi
          qo‘shildi · {counts.studentsUpdated} o‘quvchi yangilandi · {counts.enrollmentsCreated} biriktirish
          {outcome.reviewItems > 0 ? ` · ${outcome.reviewItems} ta holat tekshirishga qo‘yildi` : ""}
        </p>
        {outcome.warnings.length > 0 && (
          <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs">
            {outcome.warnings.slice(0, 8).map((warning, index) => (
              <li key={index}>{warning}</li>
            ))}
          </ul>
        )}
      </AlertDescription>
    </Alert>
  );
}

// ---------------------------------------------------------------------------
// Sync history
// ---------------------------------------------------------------------------

function SyncHistory({ logs }: { logs: SyncLogRow[] }) {
  if (logs.length === 0) {
    return (
      <EmptyState
        icon={RefreshCw}
        title="Sinxronizatsiya tarixi bo‘sh"
        description="Hozircha birorta import yoki sinxronizatsiya amalga oshirilmagan."
      />
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sinxronizatsiya tarixi</CardTitle>
        <CardDescription>So‘nggi {logs.length} ta import natijasi. Har bir natija haqiqiy ma’lumotlardan olingan.</CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Manba</TableHead>
              <TableHead>Holat</TableHead>
              <TableHead className="text-right">Sinf</TableHead>
              <TableHead className="text-right">O‘quvchi</TableHead>
              <TableHead className="text-right">O‘tkazildi</TableHead>
              <TableHead>Kim</TableHead>
              <TableHead>Vaqt</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.map((log) => (
              <TableRow key={log.id}>
                <TableCell>
                  <div className="font-medium">{log.source}</div>
                  <div className="text-xs text-muted-foreground">{log.providerLabel}</div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-1">
                    <Badge variant={STATUS_VARIANT[log.status] ?? "outline"}>{STATUS_LABEL[log.status] ?? log.status}</Badge>
                    {log.dryRun && <Badge variant="outline">Sinov</Badge>}
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  +{log.classesCreated} / ~{log.classesUpdated}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  +{log.studentsCreated} / ~{log.studentsUpdated}
                </TableCell>
                <TableCell className="text-right tabular-nums">{log.recordsSkipped}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{log.triggeredByName ?? "Tizim"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{log.startedAtLabel}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Review resolution
// ---------------------------------------------------------------------------

function ReviewSection({
  reviews,
  students,
  canManage,
}: {
  reviews: ReviewRow[];
  students: StudentOption[];
  canManage: boolean;
}) {
  if (reviews.length === 0) {
    return (
      <EmptyState
        icon={ShieldCheck}
        title="Tekshirish uchun holat yo‘q"
        description="Import paytida noaniq yozuvlar topilsa, ular shu yerda qo‘lda hal qilinadi."
      />
    );
  }

  return (
    <div className="space-y-4">
      <Alert variant="info">
        <AlertTriangle />
        <AlertDescription className="text-foreground">
          Quyidagi yozuvlar avtomatik aniqlanmadi (bir xil ism, tug‘ilgan sana mos emasligi yoki sinf topilmagani sababli).
          Har biri uchun qaror qabul qiling.
        </AlertDescription>
      </Alert>

      {reviews.map((review) => (
        <ReviewCard key={review.id} review={review} students={students} canManage={canManage} />
      ))}
    </div>
  );
}

function ReviewCard({ review, students, canManage }: { review: ReviewRow; students: StudentOption[]; canManage: boolean }) {
  const router = useRouter();
  const action = useAction();
  const [studentId, setStudentId] = React.useState("");

  const resolve = (kind: "CREATE_NEW" | "LINK_EXISTING" | "IGNORE") => {
    action.run(
      () => resolveReviewItemAction({ reviewId: review.id, action: kind, studentId: kind === "LINK_EXISTING" ? studentId : undefined }),
      { onSuccess: () => router.refresh() },
    );
  };

  const name = [review.payload.lastName, review.payload.firstName, review.payload.middleName].filter(Boolean).join(" ") || "Noma’lum";

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="text-base">{name}</CardTitle>
        <CardDescription className="flex flex-wrap items-center gap-2">
          <Badge variant="warning">{review.reasonLabel}</Badge>
          {review.payload.className && <span>Sinf: {review.payload.className}</span>}
          {review.payload.birthDate && <span>Tug‘ilgan: {review.payload.birthDate}</span>}
          {review.externalId && <span>Tashqi ID: {review.externalId}</span>}
          <span className="text-xs">{review.createdAtLabel}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {review.candidateNames.length > 0 && (
          <p className="text-sm text-muted-foreground">Mos keluvchi yozuvlar: {review.candidateNames.join(", ")}</p>
        )}

        {action.error && (
          <Alert variant="destructive">
            <AlertDescription className="text-foreground">{action.error}</AlertDescription>
          </Alert>
        )}

        {canManage && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Label className="mb-1.5 block text-xs">Mavjud o‘quvchiga bog‘lash</Label>
              <Select value={studentId || "__none__"} onValueChange={(value) => setStudentId(value === "__none__" ? "" : value)}>
                <SelectTrigger>
                  <SelectValue placeholder="O‘quvchini tanlang" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Tanlanmagan —</SelectItem>
                  {students.map((student) => (
                    <SelectItem key={student.id} value={student.id}>
                      {student.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => resolve("CREATE_NEW")} disabled={action.pending}>
                <Plus /> Yangi o‘quvchi
              </Button>
              <Button variant="outline" size="sm" onClick={() => resolve("LINK_EXISTING")} disabled={action.pending || !studentId}>
                <Link2 /> Bog‘lash
              </Button>
              <Button variant="ghost" size="sm" onClick={() => resolve("IGNORE")} disabled={action.pending}>
                O‘tkazib yuborish
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
