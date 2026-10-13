import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Gauge, Users } from "lucide-react";
import { prisma } from "@/lib/db";
import { can, requirePageUser } from "@/lib/auth/guards";
import { PERMISSION } from "@/lib/constants";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PeriodFilter } from "@/components/filters/period-filter";
import { ReportExportButtons } from "@/components/reports/export-buttons";
import { ClassScheduleCard, type ScheduleVersionRow } from "@/components/dashboard/class-schedule-card";
import { classStatsForRange, listSessions } from "@/lib/attendance/queries";
import { formatDateOnly, formatUzDate, formatUzDateLong, resolveRange } from "@/lib/date";
import { classLabel, formatPercent, shortName } from "@/lib/utils";
import { getClassScope, scopeAllowsClass } from "@/lib/auth/scope";

export const metadata = { title: "Sinf" };

export default async function ClassDetailPage({ params, searchParams }: PageProps<"/dashboard/classes/[id]">) {
  const user = await requirePageUser();
  if (!user.schoolId) redirect("/dashboard");
  if (!can(user, PERMISSION.CLASSES_READ)) redirect("/dashboard");

  const { id } = await params;
  const query = await searchParams;
  const range = resolveRange(
    (query.period as string | undefined) ?? undefined,
    query.from as string | undefined,
    query.to as string | undefined,
  );

  const scope = await getClassScope(user);
  if (!scopeAllowsClass(scope, id)) {
    notFound();
  }

  const schoolClass = await prisma.schoolClass.findFirst({
    where: { id, schoolId: user.schoolId, deletedAt: null },
    include: {
      teacher: { select: { firstName: true, lastName: true, middleName: true } },
      enrollments: {
        where: { isActive: true, status: "ACTIVE" },
        include: {
          student: {
            select: { id: true, firstName: true, lastName: true, middleName: true, isActive: true },
          },
        },
        orderBy: [{ student: { lastName: "asc" } }, { student: { firstName: "asc" } }],
      },
    },
  });
  if (!schoolClass) notFound();

  const [stats, sessions] = await Promise.all([
    classStatsForRange({ schoolId: user.schoolId, classId: id, range }),
    listSessions(user.schoolId, { classId: id, from: range.from, to: range.to }),
  ]);

  const scheduleVersions = await prisma.classSchedule.findMany({
    where: { classId: id, schoolId: user.schoolId },
    orderBy: { effectiveFrom: "desc" },
    select: { id: true, effectiveFrom: true, weekdays: true, note: true },
  });

  const versions: ScheduleVersionRow[] = scheduleVersions.map((version) => ({
    id: version.id,
    effectiveFrom: formatDateOnly(version.effectiveFrom),
    weekdays: version.weekdays,
    note: version.note,
  }));

  const label = classLabel(schoolClass.name, schoolClass.letter);

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2 text-muted-foreground">
          <Link href="/dashboard/classes">
            <ArrowLeft /> Sinflar
          </Link>
        </Button>
        <PageHeader
          title={label}
          description={`${schoolClass.academicYear} o‘quv yili${
            schoolClass.teacher ? ` · Sinf rahbari: ${shortName(schoolClass.teacher)}` : ""
          }`}
        >
          <PeriodFilter preset={range.preset} from={formatDateOnly(range.from)} to={formatDateOnly(range.to)} />
          {can(user, PERMISSION.REPORTS_EXPORT) && (
            <ReportExportButtons scope="class" classId={id} />
          )}
        </PageHeader>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="O‘quvchilar" value={schoolClass.enrollments.length} icon={Users} tone="primary" />
        <StatCard
          label="Davomat darajasi"
          value={formatPercent(stats.stats.rate)}
          hint={`${stats.stats.attended}/${stats.stats.recorded} belgilangan`}
          icon={Gauge}
          tone="success"
        />
        <StatCard
          label="Qamrov"
          value={formatPercent(stats.stats.coverage)}
          hint={stats.stats.reliable ? "Ma’lumot yetarli" : "Ma’lumot qisman"}
          tone={stats.stats.reliable ? "info" : "warning"}
        />
        <StatCard label="Sessiyalar" value={sessions.length} tone="default" />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>O‘quvchilar</CardTitle>
            <CardDescription>{range.label} bo‘yicha davomat holati.</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            {schoolClass.enrollments.length === 0 ? (
              <div className="px-6">
                <EmptyState
                  icon={Users}
                  title="O‘quvchi biriktirilmagan"
                  description="Bu sinfga hali o‘quvchilar biriktirilmagan."
                  action={
                    can(user, PERMISSION.STUDENTS_READ) ? (
                      <Button asChild>
                        <Link href="/dashboard/students">O‘quvchilar bo‘limi</Link>
                      </Button>
                    ) : undefined
                  }
                />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>F.I.Sh.</TableHead>
                    <TableHead>Holat</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {schoolClass.enrollments.map((enrollment) => (
                    <TableRow key={enrollment.id}>
                      <TableCell className="font-medium">
                        <Link
                          href={`/dashboard/students/${enrollment.student.id}`}
                          className="hover:text-primary hover:underline"
                        >
                          {enrollment.student.lastName} {enrollment.student.firstName}{" "}
                          {enrollment.student.middleName ?? ""}
                        </Link>
                      </TableCell>
                      <TableCell>
                        {enrollment.student.isActive ? (
                          <Badge variant="success">Faol</Badge>
                        ) : (
                          <Badge variant="outline">Nofaol</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Davr bo‘yicha</CardTitle>
            <CardDescription>{formatUzDateLong(range.from)} — {formatUzDateLong(range.to)}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Metric label="Keldi" value={stats.stats.present} />
              <Metric label="Kechikdi" value={stats.stats.late} />
              <Metric label="Kelmadi" value={stats.stats.absent} />
              <Metric label="Sababli" value={stats.stats.excused} />
            </div>
            <div className="space-y-1 border-t pt-3 text-xs text-muted-foreground">
              <p>Belgilangan: {stats.stats.recorded}</p>
              <p>Qamrov: {formatPercent(stats.stats.coverage)}</p>
              <p>Davomat: {formatPercent(stats.stats.rate)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Individual o‘qish jadvali</CardTitle>
          <CardDescription>
            Bu sinfning haftalik o‘qish kunlari. Davomat va hisobotlar faqat shu kunlar asosida hisoblanadi.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ClassScheduleCard
            classId={id}
            currentWeekdays={schoolClass.workingDays}
            versions={versions}
            canManage={can(user, PERMISSION.CLASSES_MANAGE)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Davomat sessiyalari</CardTitle>
          <CardDescription>Tanlangan davr uchun qayd etilgan davomatlar.</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {sessions.length === 0 ? (
            <p className="px-6 text-sm text-muted-foreground">Bu davr uchun davomat qayd etilmagan.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sana</TableHead>
                  <TableHead>Holat</TableHead>
                  <TableHead className="text-right">Keldi</TableHead>
                  <TableHead>Kim belgilagan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((session) => (
                  <TableRow key={session.id}>
                    <TableCell>{formatUzDate(session.date)}</TableCell>
                    <TableCell>
                      {session.status === "SUBMITTED" ? (
                        <Badge variant="success">Tasdiqlangan</Badge>
                      ) : (
                        <Badge variant="warning">Qoralama</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {session.presentCount}/{session.recordCount}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{session.recordedByName ?? "—"}</TableCell>
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

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}
