import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CalendarCheck, CalendarX, Clock, FileWarning, Gauge } from "lucide-react";
import { prisma } from "@/lib/db";
import { can, requirePageUser } from "@/lib/auth/guards";
import { PERMISSION, SESSION_SLOT_LABEL } from "@/lib/constants";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { AttendanceChip } from "@/components/ui/attendance-chip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PeriodFilter } from "@/components/filters/period-filter";
import { ReportExportButtons } from "@/components/reports/export-buttons";
import { buildStudentReport } from "@/lib/reports/aggregate";
import { formatDateOnly, formatUzDateLong, resolveRange } from "@/lib/date";
import { classLabel, formatPercent } from "@/lib/utils";
import { getClassScope, scopeAllowsClass } from "@/lib/auth/scope";

export const metadata = { title: "O‘quvchi" };

export default async function StudentDetailPage({ params, searchParams }: PageProps<"/dashboard/students/[id]">) {
  const user = await requirePageUser();
  if (!user.schoolId) redirect("/dashboard");
  if (!can(user, PERMISSION.STUDENTS_READ)) redirect("/dashboard");

  const { id } = await params;
  const query = await searchParams;
  const range = resolveRange(
    (query.period as string | undefined) ?? undefined,
    query.from as string | undefined,
    query.to as string | undefined,
  );

  const scope = await getClassScope(user);
  const student = await prisma.student.findFirst({
    where: { id, schoolId: user.schoolId, deletedAt: null },
    include: {
      enrollments: {
        where: { isActive: true, status: "ACTIVE" },
        include: { class: { select: { id: true, name: true, letter: true, academicYear: true } } },
        orderBy: { startDate: "desc" },
        take: 1,
      },
    },
  });
  if (!student) notFound();
  const enrollment = student.enrollments[0];
  if (enrollment && scope.kind === "CLASSES" && !scopeAllowsClass(scope, enrollment.class.id)) {
    notFound();
  }

  const report = await buildStudentReport(user.schoolId, id, range);
  if (!report) notFound();
  const fullName = [student.lastName, student.firstName, student.middleName].filter(Boolean).join(" ");

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2 text-muted-foreground">
          <Link href="/dashboard/students">
            <ArrowLeft /> O‘quvchilar
          </Link>
        </Button>
        <PageHeader
          title={fullName}
          description={
            enrollment
              ? `${classLabel(enrollment.class.name, enrollment.class.letter)} · ${enrollment.class.academicYear}`
              : "Sinfga biriktirilmagan"
          }
        >
          <PeriodFilter preset={range.preset} from={formatDateOnly(range.from)} to={formatDateOnly(range.to)} />
          {can(user, PERMISSION.REPORTS_EXPORT) && <ReportExportButtons scope="student" studentId={id} />}
        </PageHeader>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {student.isActive ? <Badge variant="success">Faol</Badge> : <Badge variant="outline">Nofaol</Badge>}
        {enrollment && (
          <Button asChild variant="outline" size="sm">
            <Link href={`/dashboard/classes/${enrollment.class.id}`}>Sinf sahifasi</Link>
          </Button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Davomat darajasi"
          value={formatPercent(report.rate)}
          hint={`${report.counts.present + report.counts.late}/${report.recorded} belgilangan`}
          icon={Gauge}
          tone="success"
        />
        <StatCard label="Keldi" value={report.counts.present} icon={CalendarCheck} tone="primary" />
        <StatCard label="Kechikdi" value={report.counts.late} icon={Clock} tone="warning" />
        <StatCard label="Kelmadi" value={report.counts.absent} icon={CalendarX} tone="destructive" />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Kunlik davomat</CardTitle>
            <CardDescription>{range.label} bo‘yicha qayd etilgan kunlar.</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            {report.days.length === 0 ? (
              <div className="px-6">
                <EmptyState
                  icon={FileWarning}
                  title="Ma’lumot yo‘q"
                  description="Bu davr uchun davomat yozuvlari mavjud emas."
                />
              </div>
            ) : (
              <div className="max-h-[32rem] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Sana</TableHead>
                      <TableHead>Smena</TableHead>
                      <TableHead>Holat</TableHead>
                      <TableHead>Sabab / izoh</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.days.map((day, index) => (
                      <TableRow key={`${formatDateOnly(day.date)}-${day.slot}-${index}`}>
                        <TableCell className="whitespace-nowrap">{formatUzDateLong(day.date)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {SESSION_SLOT_LABEL[day.slot]}
                        </TableCell>
                        <TableCell>
                          <AttendanceChip status={day.status} />
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {day.reason || day.note || "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Davr bo‘yicha</CardTitle>
            <CardDescription>{range.label}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Metric label="Keldi" value={report.counts.present} />
              <Metric label="Kechikdi" value={report.counts.late} />
              <Metric label="Kelmadi" value={report.counts.absent} />
              <Metric label="Sababli" value={report.counts.excused} />
            </div>
            <div className="space-y-1 border-t pt-3 text-xs text-muted-foreground">
              <p>Belgilangan kunlar: {report.recorded}</p>
              <p>Davomat: {formatPercent(report.rate)}</p>
              {report.classNames.length > 0 && <p>Sinflar: {report.classNames.join(", ")}</p>}
            </div>
          </CardContent>
        </Card>
      </div>
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
