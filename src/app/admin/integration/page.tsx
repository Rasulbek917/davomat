import { redirect } from "next/navigation";
import { AlertTriangle, CheckCircle2, Link2, Plug, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { prisma } from "@/lib/db";
import { can, requirePageUser } from "@/lib/auth/guards";
import { isSuperAdmin, PERMISSION } from "@/lib/constants";
import { PROVIDER_META } from "@/lib/integration/registry";
import { formatUzDateTime } from "@/lib/date";

export const metadata = { title: "Integratsiya nazorati" };

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

export default async function AdminIntegrationPage() {
  const user = await requirePageUser();
  if (!isSuperAdmin(user.permissions) && !can(user, PERMISSION.INTEGRATION_READ)) redirect("/admin");

  const [configs, logs, activeConfigs, failedSyncs, pendingReviews] = await Promise.all([
    prisma.integrationConfig.findMany({
      orderBy: [{ provider: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        name: true,
        provider: true,
        isEnabled: true,
        baseUrl: true,
        lastSyncAt: true,
        lastSyncStatus: true,
        lastSyncMessage: true,
        school: { select: { id: true, name: true } },
      },
    }),
    prisma.syncLog.findMany({
      orderBy: { startedAt: "desc" },
      take: 40,
      select: {
        id: true,
        source: true,
        provider: true,
        status: true,
        dryRun: true,
        startedAt: true,
        studentsCreated: true,
        studentsUpdated: true,
        recordsSkipped: true,
        school: { select: { name: true } },
        triggeredBy: { select: { firstName: true, lastName: true, middleName: true } },
      },
    }),
    prisma.integrationConfig.count({ where: { isEnabled: true } }),
    prisma.syncLog.count({ where: { status: "FAILED" } }),
    prisma.importReviewItem.count({ where: { status: "PENDING" } }),
  ]);

  const configuredSchools = new Set(configs.map((c) => c.school.id)).size;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Integratsiya nazorati"
        description="Maktablarning eMaktab import sozlamalari va sinxronizatsiya tarixi (faqat ko‘rish)."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Sozlangan maktablar" value={configuredSchools} icon={Link2} tone="primary" />
        <StatCard label="Faol sozlamalar" value={activeConfigs} hint={`${configs.length} ta jami`} icon={Plug} tone="info" />
        <StatCard label="Sinxronizatsiya" value={logs.length > 0 ? "Bor" : "Yo‘q"} hint="Oxirgi 40 yozuv" icon={RefreshCw} tone="success" />
        <StatCard
          label="Xatoliklar"
          value={failedSyncs}
          hint="Muvaffaqiyatsiz import"
          icon={AlertTriangle}
          tone={failedSyncs > 0 ? "destructive" : "default"}
        />
      </div>

      <Alert variant="info">
        <CheckCircle2 />
        <AlertDescription className="text-foreground">
          Integratsiya sozlamalari har bir maktab direktori tomonidan o‘z kabinetida boshqariladi. Tizim eMaktab
          veb-interfeysini avtomatik yuklab olmaydi va himoyani chetlab o‘tmaydi.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Sozlamalar</CardTitle>
          <CardDescription>
            {configs.length} ta sozlama{configs.length === 0 ? "" : ` · ${pendingReviews} ta kutilayotgan tekshiruv`}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {configs.length === 0 ? (
            <div className="px-6">
              <EmptyState
                icon={Link2}
                title="Integratsiya sozlanmagan"
                description="Hozircha birorta maktab CSV/Excel yoki eMaktab API integratsiyasini sozlamagan."
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Maktab</TableHead>
                  <TableHead>Nomi</TableHead>
                  <TableHead>Turi</TableHead>
                  <TableHead>Holat</TableHead>
                  <TableHead>Oxirgi sinxronizatsiya</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {configs.map((config) => (
                  <TableRow key={config.id}>
                    <TableCell className="font-medium">{config.school.name}</TableCell>
                    <TableCell>
                      <div>{config.name}</div>
                      {config.baseUrl && <div className="text-xs text-muted-foreground">{config.baseUrl}</div>}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{PROVIDER_META[config.provider]?.label ?? config.provider}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1">
                        {config.isEnabled ? <Badge variant="success">Yoqilgan</Badge> : <Badge variant="outline">O‘chirilgan</Badge>}
                        {config.lastSyncStatus && (
                          <Badge variant={STATUS_VARIANT[config.lastSyncStatus] ?? "outline"}>
                            {STATUS_LABEL[config.lastSyncStatus] ?? config.lastSyncStatus}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatUzDateTime(config.lastSyncAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sinxronizatsiya tarixi</CardTitle>
          <CardDescription>Barcha maktablar bo‘yicha oxirgi {logs.length} ta import natijasi.</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {logs.length === 0 ? (
            <p className="px-6 text-sm text-muted-foreground">Hozircha sinxronizatsiya amalga oshirilmagan.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Manba</TableHead>
                  <TableHead>Maktab</TableHead>
                  <TableHead>Holat</TableHead>
                  <TableHead className="text-right">O‘quvchi</TableHead>
                  <TableHead className="text-right">O‘tkazildi</TableHead>
                  <TableHead>Vaqt</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell>
                      <div className="font-medium">{log.source}</div>
                      <div className="text-xs text-muted-foreground">
                        {PROVIDER_META[log.provider]?.label ?? log.provider}
                      </div>
                    </TableCell>
                    <TableCell>{log.school.name}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1">
                        <Badge variant={STATUS_VARIANT[log.status] ?? "outline"}>
                          {STATUS_LABEL[log.status] ?? log.status}
                        </Badge>
                        {log.dryRun && <Badge variant="outline">Sinov</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      +{log.studentsCreated} / ~{log.studentsUpdated}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{log.recordsSkipped}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatUzDateTime(log.startedAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
