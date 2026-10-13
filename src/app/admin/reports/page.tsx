import { redirect } from "next/navigation";
import { AlertTriangle, BarChart3, CalendarCheck, Gauge, School } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PeriodFilter } from "@/components/filters/period-filter";
import { ReportExportButtons } from "@/components/reports/export-buttons";
import { can, requirePageUser } from "@/lib/auth/guards";
import { isSuperAdmin, PERMISSION } from "@/lib/constants";
import { buildPlatformReport } from "@/lib/reports/aggregate";
import { formatDateOnly, formatUzDateLong, resolveRange } from "@/lib/date";
import { formatPercent } from "@/lib/utils";

export const metadata = { title: "Platforma hisoboti" };

export default async function AdminReportsPage({ searchParams }: PageProps<"/admin/reports">) {
  const user = await requirePageUser();
  if (!isSuperAdmin(user.permissions) && !can(user, PERMISSION.REPORTS_READ)) redirect("/admin");

  const params = await searchParams;
  const range = resolveRange(
    (params.period as string | undefined) ?? undefined,
    params.from as string | undefined,
    params.to as string | undefined,
  );

  const report = await buildPlatformReport(range);
  const totals = report.totals;
  const totalStudents = report.rows.reduce((sum, row) => sum + row.studentCount, 0);
  const totalClasses = report.rows.reduce((sum, row) => sum + row.classCount, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Platforma hisoboti"
        description={`Barcha maktablar bo‘yicha yig‘ma davomat · ${formatUzDateLong(range.from)}${
          formatDateOnly(range.from) === formatDateOnly(range.to) ? "" : ` — ${formatUzDateLong(range.to)}`
        }`}
      >
        <PeriodFilter preset={range.preset} from={formatDateOnly(range.from)} to={formatDateOnly(range.to)} />
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Umumiy davomat"
          value={formatPercent(totals.rate)}
          hint={`${totals.attended} keldi / ${totals.recorded} belgilangan`}
          icon={Gauge}
          tone="primary"
        />
        <StatCard
          label="Umumiy qamrov"
          value={formatPercent(totals.coverage)}
          hint={totals.reliable ? "Ma’lumot yetarli" : "Ma’lumot qisman"}
          icon={CalendarCheck}
          tone={totals.coverage < 70 ? "warning" : "success"}
        />
        <StatCard label="Maktablar" value={report.rows.length} hint={`${totalClasses} ta sinf`} icon={School} tone="info" />
        <StatCard label="O‘quvchilar" value={totalStudents} hint={`${totals.recorded} yozuv`} icon={BarChart3} tone="default" />
      </div>

      <Card>
        <CardHeader className="flex-row items-start justify-between space-y-0 gap-4">
          <div className="space-y-1">
            <CardTitle>Eksport</CardTitle>
            <CardDescription>Tanlangan davr uchun platforma hisobotini yuklab oling (faqat bosh administrator).</CardDescription>
          </div>
          <ReportExportButtons scope="platform" />
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Maktablar bo‘yicha davomat</CardTitle>
          <CardDescription>Har bir maktabning tanlangan davr uchun ko‘rsatkichlari. «Qisman» belgisi qamrov 70% dan pastligini bildiradi.</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {report.rows.length === 0 ? (
            <div className="px-6">
              <EmptyState
                icon={School}
                title="Maktablar mavjud emas"
                description="Hisobot tuzish uchun tizimda kamida bitta maktab bo‘lishi kerak."
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Maktab</TableHead>
                  <TableHead className="text-right">O‘quvchi</TableHead>
                  <TableHead className="text-right">Sinf</TableHead>
                  <TableHead className="text-right">Belgilangan</TableHead>
                  <TableHead className="text-right">Davomat</TableHead>
                  <TableHead className="text-right">Qamrov</TableHead>
                  <TableHead className="w-32" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.rows.map((row) => (
                  <TableRow key={row.schoolId}>
                    <TableCell className="font-medium">{row.schoolName}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.studentCount}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.classCount}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.recorded}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{formatPercent(row.rate)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      <span className="inline-flex items-center gap-1.5">
                        {formatPercent(row.coverage)}
                        {!row.reliable && row.recorded > 0 && <Badge variant="warning">Qisman</Badge>}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end">
                        <ReportExportButtons scope="school" schoolId={row.schoolId} />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {!totals.reliable && totals.recorded > 0 && (
        <Alert variant="warning">
          <AlertTriangle />
          <AlertTitle>Ma’lumot qisman</AlertTitle>
          <AlertDescription className="text-foreground">
            Umumiy qamrov {formatPercent(totals.coverage)}. Davomat foizi {totals.unrecorded} ta belgilanmagan holatni
            hisobga olmaydi.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
