import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { can, requirePageUser } from "@/lib/auth/guards";
import { PERMISSION } from "@/lib/constants";
import { addDays, formatDateOnly, today } from "@/lib/date";
import { fullName } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import {
  getDutyDashboard,
  listDutyAssignments,
  type DutyDashboard,
} from "@/lib/duty/queries";
import {
  DutyClient,
  type DutyEligibilityRow,
} from "@/components/dashboard/duty-client";

export const metadata = { title: "Navbatchilik" };

export default async function DutyPage() {
  const user = await requirePageUser();
  if (!user.schoolId) redirect("/dashboard");
  if (!can(user, PERMISSION.DUTY_READ)) redirect("/dashboard");

  const canManage = can(user, PERMISSION.DUTY_MANAGE);
  const now = today();

  const [dashboard, assignments, eligibilityRows] = await Promise.all([
    getDutyDashboard(user.schoolId, now),
    listDutyAssignments(user.schoolId, { from: addDays(now, -45), to: addDays(now, 120) }),
    prisma.dutyTeacherEligibility.findMany({
      where: { schoolId: user.schoolId },
      select: {
        teacherId: true,
        isEligible: true,
        unavailableFrom: true,
        unavailableTo: true,
        note: true,
      },
    }),
  ]);

  // Teachers can only ever see their own duty; managers see the whole school.
  const visibleAssignments = canManage
    ? assignments
    : assignments.filter((row) => row.teacherId === user.id);

  const eligibility: DutyEligibilityRow[] = eligibilityRows.map((row) => ({
    teacherId: row.teacherId,
    isEligible: row.isEligible,
    unavailableFrom: row.unavailableFrom ? formatDateOnly(row.unavailableFrom) : null,
    unavailableTo: row.unavailableTo ? formatDateOnly(row.unavailableTo) : null,
    note: row.note,
  }));

  const summary: DutyDashboard = {
    ...dashboard,
    teacherOptions: dashboard.teacherOptions,
    todayAssignments: canManage
      ? dashboard.todayAssignments
      : dashboard.todayAssignments.filter((row) => row.teacherId === user.id),
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Navbatchilik"
        description={
          canManage
            ? "O‘qituvchilar navbatchiligini avtomatik tuzing, tahrirlang va adolatli taqsimlanishini nazorat qiling."
            : "Sizning navbatchilik jadvalingiz."
        }
      />
      <DutyClient
        canManage={canManage}
        currentUserId={user.id}
        currentUserName={fullName(user) || "Siz"}
        todayIso={formatDateOnly(now)}
        dashboard={summary}
        assignments={visibleAssignments}
        allAssignments={canManage ? assignments : []}
        eligibility={canManage ? eligibility : []}
      />
    </div>
  );
}
