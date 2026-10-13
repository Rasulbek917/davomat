import { redirect } from "next/navigation";
import type { AttendanceSessionStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { can, requirePageUser } from "@/lib/auth/guards";
import { PERMISSION } from "@/lib/constants";
import { PageHeader } from "@/components/ui/page-header";
import { PeriodFilter } from "@/components/filters/period-filter";
import { HistoryClient, type HistoryClassOption, type HistorySession } from "@/components/dashboard/history-client";
import { listSessions } from "@/lib/attendance/queries";
import { formatDateOnly, formatUzDate, resolveRange } from "@/lib/date";
import { classLabel } from "@/lib/utils";
import { getClassScope, scopeClassIds, scopeAllowsClass } from "@/lib/auth/scope";

export const metadata = { title: "Davomat tarixi" };

export default async function DashboardHistoryPage({ searchParams }: PageProps<"/dashboard/history">) {
  const user = await requirePageUser();
  if (!user.schoolId) redirect("/dashboard");
  if (!can(user, PERMISSION.ATTENDANCE_READ)) redirect("/dashboard");

  const params = await searchParams;
  const range = resolveRange(
    (params.period as string | undefined) ?? undefined,
    params.from as string | undefined,
    params.to as string | undefined,
  );

  const requestedClassId = typeof params.classId === "string" ? params.classId : "";
  const requestedStatus = typeof params.status === "string" ? params.status : "";

  const scope = await getClassScope(user);
  const allowed = scopeClassIds(scope);
  if (allowed && allowed.length === 0) {
    redirect("/dashboard");
  }

  const classRows = await prisma.schoolClass.findMany({
    where: {
      schoolId: user.schoolId,
      isActive: true,
      deletedAt: null,
      ...(allowed ? { id: { in: allowed } } : {}),
    },
    select: { id: true, name: true, letter: true },
    orderBy: [{ gradeYear: "asc" }, { name: "asc" }],
  });

  let classId = classRows.some((c) => c.id === requestedClassId) ? requestedClassId : "";
  if (classId && allowed && !scopeAllowsClass(scope, classId)) {
    classId = "";
  }
  const status: AttendanceSessionStatus | undefined =
    requestedStatus === "SUBMITTED" || requestedStatus === "DRAFT" ? requestedStatus : undefined;

  const sessions = await listSessions(user.schoolId, { classId: classId || undefined, from: range.from, to: range.to, status });

  const rows: HistorySession[] = sessions.map((session) => ({
    ...session,
    dateLabel: formatUzDate(session.date),
    dateIso: formatDateOnly(session.date),
  }));

  const classOptions: HistoryClassOption[] = classRows.map((schoolClass) => ({
    id: schoolClass.id,
    label: classLabel(schoolClass.name, schoolClass.letter),
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Davomat tarixi"
        description={`${range.label} bo‘yicha belgilangan davomat yozuvlari (jami ${rows.length} ta).`}
      >
        <PeriodFilter preset={range.preset} from={formatDateOnly(range.from)} to={formatDateOnly(range.to)} />
      </PageHeader>

      <HistoryClient
        sessions={rows}
        classes={classOptions}
        classId={classId}
        status={status ?? ""}
        canCorrect={can(user, PERMISSION.ATTENDANCE_CORRECT)}
      />
    </div>
  );
}
