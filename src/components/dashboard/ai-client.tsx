"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  History,
  Loader2,
  MessageSquare,
  Plug,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatCard } from "@/components/ui/stat-card";
import { useAction } from "@/hooks/use-action";
import {
  aiAnalyzeAction,
  aiAskAction,
  emaktabFileImportAction,
  emaktabSaveConnectionAction,
  emaktabSyncAction,
  emaktabTestConnectionAction,
  type SyncResult,
} from "@/lib/actions/ai";
import type { AiSchoolData, ClassOption, SchoolChoice, SyncLogView } from "@/lib/ai/page-data";
import type { ConnectorTestResult } from "@/lib/integration/types";

type ChatMessage = { role: "user" | "assistant"; content: string; toolsUsed?: string[] };

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Kutilmoqda",
  RUNNING: "Bajarilmoqda",
  SUCCESS: "Muvaffaqiyatli",
  PARTIAL: "Qisman",
  FAILED: "Xatolik",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "success" | "warning" | "destructive" | "outline"> = {
  PENDING: "outline",
  RUNNING: "secondary",
  SUCCESS: "success",
  PARTIAL: "warning",
  FAILED: "destructive",
};

const PERIOD_OPTIONS = [
  { value: "today", label: "Bugun" },
  { value: "week", label: "Shu hafta" },
  { value: "month", label: "Shu oy" },
  { value: "year", label: "Shu yil" },
  { value: "last30", label: "Oxirgi 30 kun" },
];

export function AiClient({
  data,
  canManage,
  schoolName,
  schools,
  selectedSchoolId,
  scopeClassId,
}: {
  data: AiSchoolData;
  canManage: boolean;
  schoolName: string;
  schools?: SchoolChoice[];
  selectedSchoolId: string | null;
  scopeClassId?: string | null;
}) {
  const showConnection = canManage;

  return (
    <div className="space-y-6">
      {!data.aiReady && (
        <Alert variant="warning">
          <AlertTriangle />
          <AlertTitle>AI hali sozlanmagan</AlertTitle>
          <AlertDescription className="text-foreground">
            AI javob berishi uchun serverda <code className="rounded bg-muted px-1">AI_API_KEY</code> muhit
            o‘zgaruvchisini kiriting (ixtiyoriy: <code className="rounded bg-muted px-1">AI_BASE_URL</code>,{" "}
            <code className="rounded bg-muted px-1">AI_MODEL</code>). Kalit faqat serverda saqlanadi va foydalanuvchiga
            ko‘rsatilmaydi. Ungacha statistika va sinxronlash ishlayveradi — faqat chat javob bera olmaydi.
          </AlertDescription>
        </Alert>
      )}

      {schools && schools.length > 0 && <SchoolPicker schools={schools} selected={selectedSchoolId} />}

      <Tabs defaultValue={showConnection ? "connection" : "assistant"} className="space-y-4">
        <TabsList className="flex-wrap">
          {showConnection && (
            <TabsTrigger value="connection">
              <Plug className="h-4 w-4" /> eMaktab ulanishi
            </TabsTrigger>
          )}
          {showConnection && (
            <TabsTrigger value="history">
              <History className="h-4 w-4" /> Sinxronlash tarixi
            </TabsTrigger>
          )}
          <TabsTrigger value="assistant">
            <Sparkles className="h-4 w-4" /> AI yordamchi
          </TabsTrigger>
        </TabsList>

        {showConnection && (
          <TabsContent value="connection" className="space-y-6">
            <ConnectionSection data={data} />
            <FileImportSection />
            <SyncHistory logs={data.syncLogs} schoolId={selectedSchoolId} />
          </TabsContent>
        )}

        {showConnection && (
          <TabsContent value="history" className="space-y-6">
            <SyncHistory logs={data.syncLogs} schoolId={selectedSchoolId} />
          </TabsContent>
        )}

        <TabsContent value="assistant" className="space-y-6">
          <AssistantSection
            schoolId={selectedSchoolId}
            schoolName={schoolName}
            aiReady={data.aiReady}
            aiModel={data.aiModel}
            classes={data.classes}
            scopeClassId={scopeClassId ?? null}
            pendingReviews={data.pendingReviews}
            canManage={showConnection}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Super-admin school picker
// ---------------------------------------------------------------------------

function SchoolPicker({ schools, selected }: { schools: SchoolChoice[]; selected: string | null }) {
  const router = useRouter();
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="w-full sm:max-w-sm">
          <Label htmlFor="ai-school">Maktabni tanlang</Label>
          <Select
            value={selected ?? undefined}
            onValueChange={(value) => router.push(`/admin/ai?schoolId=${encodeURIComponent(value)}`)}
          >
            <SelectTrigger id="ai-school" className="mt-1.5">
              <SelectValue placeholder="Maktab tanlanmagan" />
            </SelectTrigger>
            <SelectContent>
              {schools.map((school) => (
                <SelectItem key={school.id} value={school.id}>
                  {school.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs text-muted-foreground">
          Super admin sifatida AI so‘rovlari tanlangan maktab doirasida bajariladi.
        </p>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// eMaktab connection
// ---------------------------------------------------------------------------

function ConnectionSection({ data }: { data: AiSchoolData }) {
  const router = useRouter();
  const [login, setLogin] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [baseUrl, setBaseUrl] = React.useState(data.emaktab?.baseUrl ?? "");
  const [endpointPath, setEndpointPath] = React.useState("");
  const [testResult, setTestResult] = React.useState<ConnectorTestResult | null>(null);
  const [syncResult, setSyncResult] = React.useState<SyncResult | null>(null);

  const save = useAction();
  const test = useAction();
  const sync = useAction();

  const runTest = () => {
    setTestResult(null);
    test.run(() => emaktabTestConnectionAction(), {
      onSuccess: (value) => setTestResult(value as ConnectorTestResult),
    });
  };

  const runSave = () => {
    save.run(
      () =>
        emaktabSaveConnectionAction({
          login,
          secret: password,
          baseUrl,
          endpointPath,
        }),
      {
        onSuccess: () => {
          setPassword("");
          router.refresh();
          runTest();
        },
      },
    );
  };

  const runSync = (dryRun: boolean) => {
    setSyncResult(null);
    sync.run(() => emaktabSyncAction({ dryRun }), {
      onSuccess: (value) => {
        setSyncResult(value as SyncResult);
        router.refresh();
      },
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plug className="h-4 w-4 text-primary" /> eMaktab ulanishi
        </CardTitle>
        <CardDescription>
          Rasmiy va ruxsat etilgan eMaktab API mavjud bo‘lganda login/parolni kiriting. Parol shifrlab (AES-256-GCM)
          saqlanadi va hech qachon qaytarilmaydi. Skraping yoki himoyani chetlab o‘tish qo‘llanmaydi.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {data.emaktab ? (
          <Alert variant={data.emaktab.isEnabled ? "info" : "warning"}>
            <ShieldCheck />
            <AlertDescription className="text-foreground">
              <span className="font-medium">{data.emaktab.name}</span>
              {data.emaktab.credentialHint ? ` · login: ${data.emaktab.credentialHint}` : ""}
              {data.emaktab.baseUrl ? ` · ${data.emaktab.baseUrl}` : ""}
              {data.emaktab.lastSyncAt
                ? ` · oxirgi sinxron: ${data.emaktab.lastSyncAt} (${STATUS_LABEL[data.emaktab.lastSyncStatus ?? ""] ?? data.emaktab.lastSyncStatus ?? "—"})`
                : " · hali sinxronlanmagan"}
              {data.emaktab.lastSyncMessage ? <span className="block text-xs">{data.emaktab.lastSyncMessage}</span> : null}
            </AlertDescription>
          </Alert>
        ) : (
          <Alert variant="info">
            <AlertTriangle />
            <AlertDescription className="text-foreground">
              Hozircha eMaktab ulanishi sozlanmagan. Login/parol va rasmiy API manzilini kiriting.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="emaktab-login">eMaktab login</Label>
            <Input
              id="emaktab-login"
              value={login}
              onChange={(event) => setLogin(event.target.value)}
              autoComplete="off"
              placeholder="maktab-login"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="emaktab-password">eMaktab parol</Label>
            <Input
              id="emaktab-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              placeholder="••••••••"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="emaktab-base">Rasmiy API manzili (base URL)</Label>
            <Input
              id="emaktab-base"
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              placeholder="https://api.emaktab.uz"
              inputMode="url"
            />
            <p className="text-xs text-muted-foreground">
              Rasmiy API manzili bo‘lmasa, quyidagi “Rasmiy fayl orqali import” bo‘limidan foydalaning.
            </p>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="emaktab-endpoint">Endpoint (ixtiyoriy)</Label>
            <Input
              id="emaktab-endpoint"
              value={endpointPath}
              onChange={(event) => setEndpointPath(event.target.value)}
              placeholder="/api/v1/school/export"
            />
          </div>
        </div>

        {save.error && (
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertDescription className="text-foreground">{save.error}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap gap-2">
          <Button onClick={runSave} disabled={save.pending || !login || !password || !baseUrl}>
            {save.pending && <Loader2 className="h-4 w-4 animate-spin" />} Ulanishni saqlash
          </Button>
          <Button variant="outline" onClick={runTest} disabled={test.pending || !data.emaktab}>
            {test.pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Ulanishni
            tekshirish
          </Button>
          <Button variant="outline" onClick={() => runSync(true)} disabled={sync.pending || !data.emaktab}>
            {sync.pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Ma’lumotlarni
            olish
          </Button>
          <Button onClick={() => runSync(false)} disabled={sync.pending || !data.emaktab}>
            {sync.pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Sinxronlash
          </Button>
        </div>

        {test.error && (
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertDescription className="text-foreground">{test.error}</AlertDescription>
          </Alert>
        )}
        {testResult && (
          <Alert variant={testResult.ok ? "success" : "destructive"}>
            {testResult.ok ? <CheckCircle2 /> : <AlertTriangle />}
            <AlertTitle>{testResult.ok ? "Ulanish muvaffaqiyatli" : "Ulanishda xatolik"}</AlertTitle>
            <AlertDescription className="text-foreground">
              <p>{testResult.message}</p>
              {testResult.details && testResult.details.length > 0 && (
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">
                  {testResult.details.slice(0, 6).map((detail, index) => (
                    <li key={index}>{detail}</li>
                  ))}
                </ul>
              )}
            </AlertDescription>
          </Alert>
        )}

        {sync.error && (
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertDescription className="text-foreground">{sync.error}</AlertDescription>
          </Alert>
        )}
        {syncResult && <SyncResultCard result={syncResult} />}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Official file import
// ---------------------------------------------------------------------------

function FileImportSection() {
  const router = useRouter();
  const [file, setFile] = React.useState<File | null>(null);
  const [result, setResult] = React.useState<SyncResult | null>(null);
  const action = useAction();

  const submit = (dryRun: boolean) => {
    if (!file) return;
    const formData = new FormData();
    formData.set("file", file);
    formData.set("dryRun", dryRun ? "true" : "false");
    setResult(null);
    action.run(() => emaktabFileImportAction(formData), {
      onSuccess: (value) => {
        setResult(value as SyncResult);
        router.refresh();
      },
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-4 w-4 text-primary" /> Rasmiy fayl orqali import
        </CardTitle>
        <CardDescription>
          eMaktab’dan rasmiy ruxsat bilan yuklangan CSV / XLSX / XLS faylni import qiladi. Bir xil fayl qayta
          yuklansa dublikat yaratilmaydi (externalId / tabiiy kalit bo‘yicha).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Input
          type="file"
          accept=".csv,.xlsx,.xls,.txt"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
        {action.error && (
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertDescription className="text-foreground">{action.error}</AlertDescription>
          </Alert>
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => submit(true)} disabled={!file || action.pending}>
            {action.pending && <Loader2 className="h-4 w-4 animate-spin" />} Sinov (dry-run)
          </Button>
          <Button onClick={() => submit(false)} disabled={!file || action.pending}>
            {action.pending && <Loader2 className="h-4 w-4 animate-spin" />} Import qilish
          </Button>
        </div>
        {result && <SyncResultCard result={result} />}
      </CardContent>
    </Card>
  );
}

function SyncResultCard({ result }: { result: SyncResult }) {
  const a = result.analysis;
  const variant = a.status === "FAILED" ? "destructive" : a.status === "PARTIAL" ? "warning" : "success";
  return (
    <div className="space-y-4">
      <Alert variant={variant}>
        <CheckCircle2 />
        <AlertTitle>{result.outcome.dryRun ? "Sinov natijasi" : "Sinxronlash natijasi"}</AlertTitle>
        <AlertDescription className="text-foreground">
          <p className="whitespace-pre-wrap">{result.aiSummary}</p>
        </AlertDescription>
      </Alert>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Jami sinflar" value={a.totalClasses} />
        <StatCard label="Jami o‘quvchilar" value={a.totalStudents} />
        <StatCard label="Yangi o‘quvchilar" value={a.newStudents} tone="success" />
        <StatCard label="Yangilangan" value={a.updatedStudents} tone="info" />
        <StatCard label="O‘zgarmagan" value={a.unchangedStudents} />
        <StatCard label="Yangi sinflar" value={a.newClasses} tone="success" />
        <StatCard label="Tekshirish kerak" value={a.reviewItems} tone={a.reviewItems > 0 ? "warning" : "default"} />
        <StatCard label="Xatolar" value={a.errors} tone={a.errors > 0 ? "destructive" : "default"} />
      </div>
      {result.outcome.warnings.length > 0 && (
        <Alert variant="info">
          <AlertTriangle />
          <AlertDescription className="text-foreground">
            <ul className="list-disc space-y-0.5 pl-5 text-xs">
              {result.outcome.warnings.slice(0, 8).map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sync history
// ---------------------------------------------------------------------------

function SyncHistory({ logs, schoolId }: { logs: SyncLogView[]; schoolId: string | null }) {
  if (logs.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="Sinxronlash tarixi bo‘sh"
        description="Hozircha eMaktab import yoki sinxronlash amalga oshirilmagan."
      />
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sinxronlash tarixi</CardTitle>
        <CardDescription>
          So‘nggi {logs.length} ta import. Har bir natija haqiqiy ma’lumotlardan olingan.{schoolId ? "" : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Manba</TableHead>
                <TableHead>Holat</TableHead>
                <TableHead className="text-right">Sinf +/~</TableHead>
                <TableHead className="text-right">O‘quvchi +/~</TableHead>
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
                      <Badge variant={STATUS_VARIANT[log.status] ?? "outline"}>
                        {STATUS_LABEL[log.status] ?? log.status}
                      </Badge>
                      {log.dryRun && <Badge variant="outline">Sinov</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    +{log.classesCreated} / ~{log.classesUpdated}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    +{log.studentsCreated} / ~{log.studentsUpdated}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{log.triggeredByName ?? "Tizim"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{log.startedAtLabel}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// AI assistant
// ---------------------------------------------------------------------------

function AssistantSection({
  schoolId,
  schoolName,
  aiReady,
  aiModel,
  classes,
  scopeClassId,
  pendingReviews,
  canManage,
}: {
  schoolId: string | null;
  schoolName: string;
  aiReady: boolean;
  aiModel: string;
  classes: ClassOption[];
  scopeClassId: string | null;
  pendingReviews: number;
  canManage: boolean;
}) {
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [question, setQuestion] = React.useState("");
  const [period, setPeriod] = React.useState("month");
  const [classId, setClassId] = React.useState(scopeClassId ?? "");
  const ask = useAction();

  const pushUser = (text: string) => setMessages((prev) => [...prev, { role: "user", content: text }]);

  const send = () => {
    const text = question.trim();
    if (!text) return;
    pushUser(text);
    setQuestion("");
    const history = messages.slice(-8).map((m) => ({ role: m.role, content: m.content }));
    ask.run(() => aiAskAction({ question: text, history, schoolId: schoolId ?? undefined }), {
      onSuccess: (value) => {
        const answer = value as { answer: string; toolsUsed: string[] };
        setMessages((prev) => [...prev, { role: "assistant", content: answer.answer, toolsUsed: answer.toolsUsed }]);
      },
    });
  };

  const analyze = (kind: "today" | "attendance" | "import" | "report") => {
    const preset =
      kind === "today"
        ? { kind, question: "Bugungi holatni tahlil qil" }
        : { kind, question: "Davomatni tahlil qil" };
    pushUser(preset.question);
    const selectedClass = classes.find((c) => c.id === classId);
    ask.run(
      () =>
        aiAnalyzeAction({
          kind,
          period: kind === "today" ? "today" : period,
          classId: classId || undefined,
          className: selectedClass?.label,
          schoolId: schoolId ?? undefined,
        }),
      {
        onSuccess: (value) => {
          const answer = value as { answer: string; toolsUsed: string[] };
          setMessages((prev) => [...prev, { role: "assistant", content: answer.answer, toolsUsed: answer.toolsUsed }]);
        },
      },
    );
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> AI yordamchi
          </CardTitle>
          <CardDescription>
            {schoolName} davomati, o‘quvchilari va eMaktab importlari bo‘yicha savol bering. AI faqat sizga ruxsat
            berilgan ma’lumotlar bilan ishlaydi va raqamlarni faqat real bazadan oladi.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
            <div className="space-y-1.5">
              <Label>Sinf (ixtiyoriy)</Label>
              <Select value={classId || "all"} onValueChange={(value) => setClassId(value === "all" ? "" : value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Barcha ruxsat etilgan sinflar</SelectItem>
                  {classes.map((cls) => (
                    <SelectItem key={cls.id} value={cls.id}>
                      {cls.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Davr</Label>
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger className="sm:w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PERIOD_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => analyze("today")} disabled={ask.pending}>
              Bugungi holatni tahlil qilish
            </Button>
            <Button variant="outline" size="sm" onClick={() => analyze("attendance")} disabled={ask.pending}>
              Davomatni tahlil qilish
            </Button>
            <Button variant="outline" size="sm" onClick={() => analyze("import")} disabled={ask.pending}>
              eMaktab importini tahlil qilish
            </Button>
            <Button variant="outline" size="sm" onClick={() => analyze("report")} disabled={ask.pending}>
              Hisobot yaratish
            </Button>
          </div>

          {pendingReviews > 0 && canManage && (
            <Alert variant="warning">
              <AlertTriangle />
              <AlertDescription className="text-foreground">
                {pendingReviews} ta import yozuvi qo‘lda tekshirishni kutmoqda.{" "}
                <Link href="/dashboard/integration" className="underline">
                  Integratsiya sahifasida hal qiling.
                </Link>
              </AlertDescription>
            </Alert>
          )}

          <div className="rounded-lg border bg-muted/30 p-3">
            {messages.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Masalan: “Bugun nechta o‘quvchi kelmadi?”, “Qaysi sinfda davomat eng past?”, “Eng ko‘p dars
                qoldirayotgan o‘quvchilar kim?”
              </p>
            ) : (
              <div className="space-y-3">
                {messages.map((message, index) => (
                  <div key={index} className="space-y-1">
                    <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      {message.role === "user" ? (
                        <>
                          <MessageSquare className="h-3.5 w-3.5" /> Siz
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-3.5 w-3.5" /> AI
                          {message.toolsUsed && message.toolsUsed.length > 0 && (
                            <span className="font-normal">({message.toolsUsed.length} ta manba)</span>
                          )}
                        </>
                      )}
                    </div>
                    <div
                      className={
                        message.role === "user"
                          ? "rounded-md bg-primary/10 p-2.5 text-sm whitespace-pre-wrap"
                          : "rounded-md bg-card p-2.5 text-sm whitespace-pre-wrap"
                      }
                    >
                      {message.content}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {ask.error && (
              <Alert variant="destructive" className="mt-3">
                <AlertTriangle />
                <AlertDescription className="text-foreground">{ask.error}</AlertDescription>
              </Alert>
            )}
          </div>

          <div className="flex gap-2">
            <Input
              value={question}
              placeholder="Savolingizni yozing…"
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  send();
                }
              }}
              disabled={ask.pending}
            />
            <Button onClick={send} disabled={ask.pending || question.trim().length < 2}>
              {ask.pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} So‘rash
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            Model: {aiModel}
            {!aiReady ? " · AI sozlanmagan" : ""} · AI javoblari real bazadan hisoblanadi va o‘qish uchun xizmat qiladi
            (o‘zgartirish kirita olmaydi).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
