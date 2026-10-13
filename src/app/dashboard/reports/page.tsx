import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, BarChart3, CalendarCheck, ClipboardList, Download, Gauge, TrendingDown } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PeriodFilter } from "@/components/filters/period-filter";
import { ClassRateChart, DailyRateChart, StatusDistributionChart } from "@/components/charts/attendance-charts";
import { ReportExportButtons } from "@/components/reports/export-buttons";
import { can, requirePageUser } from "@/lib/auth/guards";
import { PERMISSION } from "@/lib/constants";
import { buildSchoolReport } from "@/lib/reports/aggregate";
import { formatDateOnly, formatUzDateLong, resolveRange } from "@/lib/date";
import { formatPercent } from "@/lib/utils";
import { getClassScope, scopeClassIds } from "@/lib/auth/scope";

export const metadata = { title: "Hisobotlar" };

export default async function DashboardReportsPage({ searchParams }: PageProps<"/dashboard/reports">) {
  const user = await requirePageUser();
  if (!user.schoolId) redirect("/dashboard");
  if (!can(user, PERMISSION.REPORTS_READ)) redirect("/dashboard");

  const params = await searchParams;
  const range = resolveRange(
    (params.period as string | undefined) ?? undefined,
    params.from as string | undefined,
    params.to as string | undefined,
  );

  const scope = await getClassScope(user);
  const classFilter = scope.kind === "CLASSES" ? scope.classIds : undefined;
  if (classFilter && classFilter.length === 0) {
    redirect("/dashboard");
  }

  const report = await buildSchoolReport(user.schoolId, range, classFilter);
  const stats = report.stats.stats;
  const mayExport = can(user, PERMISSION.REPORTS_EXPORT);

  const classChart = report.classes.filter((row) => row.recorded > 0).map((row) => ({ className: row.className, rate: row.rate }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Hisobotlar"
        description={`${report.schoolName} · ${formatUzDateLong(range.from)}${
          formatDateOnly(range.from) === formatDateOnly(range.to) ? "" : ` — ${formatUzDateLong(range.to)}`
        }`}
      >
        <PeriodFilter preset={range.preset} from={formatDateOnly(range.from)} to={formatDateOnly(range.to)} />
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Davomat darajasi"
          value={formatPercent(stats.rate)}
          hint={`${stats.attended} keldi / ${stats.recorded} belgilangan`}
          icon={Gauge}
          tone="primary"
        />
        <StatCard
          label="Qamrov"
          value={formatPercent(stats.coverage)}
          hint={stats.reliable ? "Ma’lumot yetarli" : "Ma’lumot to‘liq emas"}
          icon={CalendarCheck}
          tone={stats.coverage < 70 ? "warning" : "success"}
        />
        <StatCard
          label="Belgilangan yozuv"
          value={stats.recorded}
          hint={`${report.stats.classCount} ta sinf`}
          icon={ClipboardList}
          tone="info"
        />
        <StatCard
          label="Sessiyalar"
          value={report.stats.sessionCount}
          hint={`${report.stats.studentCount} o‘quvchi`}
          icon={BarChart3}
          tone="default"
        />
      </div>

      <Card>
        <CardHeader className="flex-row items-start justify-between space-y-0 gap-4">
          <div className="space-y-1">
            <CardTitle>Eksport</CardTitle>
            <CardDescription>
              {mayExport
                ? "Tanlangan davr uchun maktab hisobotini yuklab oling."
                : "Eksport qilish uchun ruxsatingiz yo‘q."}
            </CardDescription>
          </div>
          <ReportExportButtons scope="school" disabled={!mayExport} />
        </CardHeader>
      </Card>

      {!stats.reliable && stats.recorded > 0 && (
        <Alert variant="warning">
          <AlertTriangle />
          <AlertTitle>Ma’lumot qisman</AlertTitle>
          <AlertDescription className="text-foreground">
            Tanlangan davr uchun qamrov {formatPercent(stats.coverage)}. Davomat foizi {stats.unrecorded} ta
            belgilanmagan holatni hisobga olmaydi — natijalar to‘liq davr yig‘ilgach aniqroq bo‘ladi.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Kunlik davomat dinamikasi</CardTitle>
            <CardDescription>{range.label} bo‘yicha kunlik o‘zgarish.</CardDescription>
          </CardHeader>
          <CardContent>
            <DailyRateChart data={report.daily} />
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Holatlar taqsimoti</CardTitle>
            <CardDescription>{stats.recorded} ta yozuv asosida.</CardDescription>
          </CardHeader>
          <CardContent>
            <StatusDistributionChart counts={report.distribution} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Sinflar bo‘yicha davomat</CardTitle>
          <CardDescription>Har bir sinfning davr uchun davomat foizi.</CardDescription>
        </CardHeader>
        <CardContent>
          <ClassRateChart data={classChart} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sinflar jadvali</CardTitle>
          <CardDescription>Batafsil ko‘rsatkichlar. Har bir sinf hisobotini alohida yuklash mumkin.</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {report.classes.length === 0 ? (
            <div className="px-6">
              <EmptyState
                icon={BarChart3}
                title="Sinflar mavjud emas"
                description="Hisobot tuzish uchun avval sinflar va davomat yozuvlari kerak."
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sinf</TableHead>
                  <TableHead className="text-right">Keldi</TableHead>
                  <TableHead className="text-right">Kechikdi</TableHead>
                  <TableHead className="text-right">Kelmadi</TableHead>
                  <TableHead className="text-right">Sababli</TableHead>
                  <TableHead className="text-right">Belgilangan</TableHead>
                  <TableHead className="text-right">Davomat</TableHead>
                  <TableHead className="text-right">Qamrov</TableHead>
                  <TableHead className="w-32" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.classes.map((row) => (
                  <TableRow key={row.classId}>
                    <TableCell className="font-medium">
                      <Link href={`/dashboard/classes/${row.classId}`} className="hover:underline">
                        {row.className}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-success">{row.present}</TableCell>
                    <TableCell className="text-right tabular-nums text-warning dark:text-warning">{row.late}</TableCell>
                    <TableCell className="text-right tabular-nums text-destructive">{row.absent}</TableCell>
                    <TableCell className="text-right tabular-nums text-info">{row.excused}</TableCell>
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
                        <Button asChild variant="ghost" size="sm" disabled={!mayExport}>
                          <a
                            href={`/api/reports/export?scope=class&format=xlsx&classId=${row.classId}&period=${range.preset}&from=${formatDateOnly(
                              range.from,
                            )}&to=${formatDateOnly(range.to)}`}
                            download
                          >
                            <Download /> Excel
                          </a>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ko‘p qoldirgan o‘quvchilar</CardTitle>
          <CardDescription>Davr bo‘yicha 25% dan ko‘p dars qoldirgan o‘quvchilar.</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {report.highAbsence.length === 0 ? (
            <p className="px-6 text-sm text-muted-foreground">
              Bu davr uchun yuqori darajada dars qoldirgan o‘quvchilar topilmadi.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>O‘quvchi</TableHead>
                  <TableHead>Sinf</TableHead>
                  <TableHead className="text-right">Qoldirilgan kun</TableHead>
                  <TableHead className="text-right">Daraja</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.highAbsence.map((student) => (
                  <TableRow key={student.studentId}>
                    <TableCell className="font-medium">{student.fullName}</TableCell>
                    <TableCell className="text-muted-foreground">{student.className}</TableCell>
                    <TableCell className="text-right tabular-nums">{student.absentDays}</TableCell>
                    <TableCell className="text-right">
                      <span className="inline-flex items-center gap-1 text-warning dark:text-warning">
                        <TrendingDown className="h-4 w-4" /> {formatPercent(student.rate)}
                      </span>
                    </TableCell>
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
