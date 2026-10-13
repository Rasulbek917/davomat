import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { can, requirePageUser } from "@/lib/auth/guards";
import { PERMISSION } from "@/lib/constants";
import { PageHeader } from "@/components/ui/page-header";
import { SettingsClient, type CalendarRow } from "@/components/dashboard/settings-client";
import { formatUzDateLong } from "@/lib/date";

export const metadata = { title: "Sozlamalar" };

type Slot = "FULL_DAY" | "MORNING" | "AFTERNOON";

function asSlot(value: string): Slot {
  return value === "MORNING" || value === "AFTERNOON" ? value : "FULL_DAY";
}

export default async function DashboardSettingsPage() {
  const user = await requirePageUser();
  if (!user.schoolId) redirect("/dashboard");

  const calendarRows = await prisma.schoolCalendar.findMany({
    where: { schoolId: user.schoolId },
    orderBy: { date: "asc" },
    select: { date: true, isWorkingDay: true, note: true },
  });

  const rows: CalendarRow[] = calendarRows.map((row) => ({
    date: row.date.toISOString().slice(0, 10),
    dateLabel: formatUzDateLong(row.date),
    isWorkingDay: row.isWorkingDay,
    note: row.note,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sozlamalar"
        description="Ko‘rinish, standart davomat smenasi va maktab o‘quv kalendari."
      />

      <SettingsClient
        initialTheme={user.preference.theme}
        attendanceSlot={asSlot(user.preference.attendanceSlot)}
        rows={rows}
        canManageCalendar={can(user, PERMISSION.CLASSES_MANAGE)}
      />
    </div>
  );
}
