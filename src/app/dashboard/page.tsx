import {
  AlertTriangle,
  CalendarCheck,
  Gauge,
  GraduationCap,
  TrendingDown,
  TrendingUp,
  UserMinus,
  Users,
} from "lucide-react";
import { prisma } from "@/lib/db";
import { can, requirePageUser } from "@/lib/auth/guards";
import { PERMISSION } from "@/lib/constants";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PeriodFilter } from "@/components/filters/period-filter";
import { DailyRateChart, StatusDistributionChart, ClassRateChart } from "@/components/charts/attendance-charts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { classStatsForRange, schoolStatsForRange, statusDistribution } from "@/lib/attendance/queries";
import { classStudentRanking, studentExtremes, todayStatusStudents } from "@/lib/attendance/queries-ext";
import { buildSchoolReport } from "@/lib/reports/aggregate";
import { formatDateOnly, formatUzDate, formatUzDateLong, resolveRange, today } from "@/lib/date";
import { classLabel, formatPercent } from "@/lib/utils";
import { getClassScope, hasAnyClass } from "@/lib/auth/scope";
import { ClassTeacherDashboard } from "@/components/dashboard/class-teacher-dashboard";
import { AiAssistantCard } from "@/components/dashboard/ai-assistant-card";
import { aiConfigured } from "@/lib/ai/provider";

export const metadata = { title: "Boshqaruv paneli" };

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const user = await requirePageUser();
  const params = await searchParams;

  const range = resolveRange(
    (params.period as string | undefined) ?? undefined,
    params.from as string | undefined,
    params.to as string | undefined,
  );

  const scope = await getClassScope(user);
  if (!hasAnyClass(scope)) {
    return (
      <div className="space-y-6">
        <PageHeader title="Boshqaruv paneli" description="Sinf rahbari uchun dashboard" />
        <Alert variant="info">
          <AlertDescription className="text-foreground">
            Sizga sinf biriktirilmagan. Direktor bilan bog‘laning.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const aiReady = aiConfigured();
  const showAi = can(user, PERMISSION.AI_USE);
  const aiHref = "/dashboard/ai";

  // --------------------------- Class teacher ---------------------------------
  if (scope.kind === "CLASSES" && scope.classIds.length > 0) {
    const classId = scope.classIds[0];
    const schoolId = user.schoolId!;
    const [schoolClass, ranking, extremes, todayStatus] = await Promise.all([
      prisma.schoolClass.findFirst({
        where: { id: classId, schoolId },
        select: { id: true, name: true, letter: true, gradeYear: true, academicYear: true },
      }),
      classStudentRanking(schoolId, classId, range),
      studentExtremes(schoolId, classId, range),
      todayStatusStudents(schoolId, classId, today()),
    ]);
    const stats = await classStatsForRange({ schoolId, classId, range });
    const week = resolveRange("week", undefined, undefined, today());
    const month = resolveRange("month", undefined, undefined, today());
    const [statsWeek, statsMonth] = await Promise.all([
      classStatsForRange({ schoolId, classId, range: week }),
      classStatsForRange({ schoolId, classId, range: month }),
    ]);
    const className = schoolClass ? classLabel(schoolClass.name, schoolClass.letter) : classId;
    const todayAbsentLateExcused = todayStatus.map((t) => ({
      fullName: t.fullName,
      status: t.status === "ABSENT" ? "Kelmadi" : t.status === "LATE" ? "Kechikdi" : "Sababli",
    }));

    return (
      <div className="space-y-6">
        {showAi && <AiAssistantCard aiReady={aiReady} href={aiHref} />}
        <ClassTeacherDashboard
          className={className}
          totalStudents={ranking.length}
          rate={stats.stats.rate}
          weekly={statsWeek.stats.rate}
          monthly={statsMonth.stats.rate}
          todayAbsentLateExcused={todayAbsentLateExcused}
          bestStudent={extremes.best}
          worstStudent={extremes.worst}
          ranking={ranking}
          periodFrom={formatDateOnly(range.from)}
          periodTo={formatDateOnly(range.to)}
          periodPreset={range.preset}
          daily={[]}
          aiHref={showAi ? aiHref : undefined}
        />
      </div>
    );
  }

  // --------------------------- School-wide -----------------------------------
  const schoolId = user.schoolId;
  if (!schoolId) {
    return (
      <div className="space-y-6">
        <PageHeader title="Boshqaruv paneli" />
        <Alert variant="info">
          <AlertDescription className="text-foreground">Maktab biriktirilmagan.</AlertDescription>
        </Alert>
      </div>
    );
  }

  const todayRange = resolveRange("today");
  const weekRange = resolveRange("week", undefined, undefined, today());
  const monthRange = resolveRange("month", undefined, undefined, today());

  const [report, weekStats, monthStats, todayDistribution, todayAbsent] = await Promise.all([
    buildSchoolReport(schoolId, range),
    schoolStatsForRange(schoolId, weekRange).then((r) => r.stats),
    schoolStatsForRange(schoolId, monthRange).then((r) => r.stats),
    statusDistribution(schoolId, todayRange),
    prisma.attendanceRecord.count({
      where: { schoolId, status: "ABSENT", session: { date: { gte: todayRange.from, lte: todayRange.to } } },
    }),
  ]);

  const stats = report.stats.stats;
  const ranking = report.stats.ranking;
  const classRateData = report.classes
    .filter((row) => row.recorded > 0)
    .map((row) => ({ className: row.className, rate: row.rate }));

  return (
    <div className="space-y-6">
      <PageHeader title="Boshqaruv paneli" description={`${user.school?.name ?? "Maktab"} · ${report.range.label}`}>
        <PeriodFilter preset={range.preset} from={formatDateOnly(range.from)} to={formatDateOnly(range.to)} />
      </PageHeader>

      {showAi && <AiAssistantCard aiReady={aiReady} href={aiHref} />}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Jami o‘quvchilar"
          value={report.stats.studentCount}
          icon={Users}
          tone="primary"
          hint={`${report.stats.classCount} ta sinf`}
        />
        <StatCard
          label="Davomat"
          value={formatPercent(stats.rate)}
          icon={Gauge}
          tone={stats.rate >= 90 ? "success" : stats.rate >= 80 ? "warning" : "destructive"}
          trend={stats.rate - weekStats.rate}
          trendLabel="haftaga nisbatan"
          hint={`Qamrov: ${formatPercent(stats.coverage)}`}
        />
        <StatCard
          label="Bugun kelmagan"
          value={todayAbsent}
          icon={UserMinus}
          tone={todayAbsent > 0 ? "destructive" : "success"}
          hint={`Bugun: ${todayDistribution.present} keldi · ${todayDistribution.late} kechikdi`}
        />
        <StatCard
          label="Shu oy davomati"
          value={formatPercent(monthStats.rate)}
          icon={CalendarCheck}
          tone="info"
          hint={`Shu hafta: ${formatPercent(weekStats.rate)}`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Kunlik davomat dinamikasi</CardTitle>
            <CardDescription>{report.range.label}</CardDescription>
          </CardHeader>
          <CardContent>
            <DailyRateChart data={report.daily} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Holatlar taqsimoti</CardTitle>
            <CardDescription>Tanlangan davr bo‘yicha yozuvlar</CardDescription>
          </CardHeader>
          <CardContent>
            <StatusDistributionChart counts={report.distribution} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Sinflar bo‘yicha davomat</CardTitle>
          <CardDescription>Faol sinflar kesimida davomat foizi</CardDescription>
        </CardHeader>
        <CardContent>
          {classRateData.length === 0 ? (
            <EmptyState
              icon={GraduationCap}
              title="Ma’lumot yo‘q"
              description="Tanlangan davrda davomat qayd etilmagan."
            />
          ) : (
            <ClassRateChart data={classRateData} />
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-success" /> Reyting
            </CardTitle>
            <CardDescription>Muvaffaqiyatli qamrov asosida eng yaxshi va eng past sinflar</CardDescription>
          </CardHeader>
          <CardContent>
            {!ranking.best ? (
              <EmptyState
                icon={AlertTriangle}
                title="Reyting uchun ma’lumot yetarli emas"
                description="Sinflarda yetarli davomat qaydlari mavjud emas."
              />
            ) : (
              <div className="space-y-3">
                <RankRow label="Eng yaxshi sinf" tone="success" row={ranking.best} />
                {ranking.worst && <RankRow label="Eng past sinf" tone="destructive" row={ranking.worst} />}
                {ranking.excludedForInsufficientData.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {ranking.excludedForInsufficientData.length} ta sinf qamrov yetarli bo‘lmagani uchun reytingga
                    kiritilmadi.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-destructive" /> Yuqori darajada dars qoldirganlar
            </CardTitle>
            <CardDescription>Belgilangan chegaradan (25%) yuqori</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            {report.highAbsence.length === 0 ? (
              <div className="px-6">
                <EmptyState
                  icon={Users}
                  title="Yuqori darajada qoldirganlar yo‘q"
                  description="Tanlangan davrda hech bir o‘quvchi chegaradan oshmagan."
                />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>O‘quvchi</TableHead>
                    <TableHead>Sinf</TableHead>
                    <TableHead className="text-right">Kelmagan kun</TableHead>
                    <TableHead className="text-right">Daraja</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.highAbsence.slice(0, 10).map((row) => (
                    <TableRow key={row.studentId}>
                      <TableCell className="font-medium">{row.fullName}</TableCell>
                      <TableCell className="text-muted-foreground">{row.className}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.absentDays}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatPercent(row.rate)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-muted-foreground">
        {formatUzDate(range.from)} — {formatUzDateLong(range.to)}
      </p>
    </div>
  );
}

function RankRow({
  label,
  tone,
  row,
}: {
  label: string;
  tone: "success" | "destructive";
  row: { className: string; letter: string | null; gradeYear: number; stats: { rate: number; present: number; absent: number } };
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border p-3">
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-medium">{row.className}</p>
      </div>
      <Badge variant={tone}>{formatPercent(row.stats.rate)}</Badge>
    </div>
  );
}
