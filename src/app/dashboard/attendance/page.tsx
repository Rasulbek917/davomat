import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { can, requirePageUser } from "@/lib/auth/guards";
import { PERMISSION } from "@/lib/constants";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { AttendanceRegister, type RegisterClass } from "@/components/dashboard/attendance-register";
import { getRegister } from "@/lib/attendance/queries";
import { loadClassDayResolver } from "@/lib/attendance/class-schedule";
import { getCalendarOverrides } from "@/lib/attendance/working-days";
import { formatDateOnly, formatUzDateLong, parseDateOnly, today } from "@/lib/date";
import { classLabel } from "@/lib/utils";
import { getClassScope, scopeClassIds, scopeAllowsClass } from "@/lib/auth/scope";

export const metadata = { title: "Davomatni belgilash" };

type Slot = "FULL_DAY" | "MORNING" | "AFTERNOON";

export default async function AttendancePage({ searchParams }: PageProps<"/dashboard/attendance">) {
  const user = await requirePageUser();
  if (!user.schoolId) redirect("/dashboard");
  if (!can(user, PERMISSION.ATTENDANCE_WRITE)) redirect("/dashboard");

  const params = await searchParams;
  const slotParam = params.slot;
  const slot: Slot =
    slotParam === "MORNING" || slotParam === "AFTERNOON" || slotParam === "FULL_DAY"
      ? slotParam
      : ((user.preference.attendanceSlot as Slot) ?? "FULL_DAY");

  const dateValue = typeof params.date === "string" ? params.date : null;
  const date = parseDateOnly(dateValue) ?? today();

  const scope = await getClassScope(user);
  const allowed = scopeClassIds(scope);
  if (allowed && allowed.length === 0) {
    redirect("/dashboard");
  }

  const classes = await prisma.schoolClass.findMany({
    where: {
      schoolId: user.schoolId,
      isActive: true,
      deletedAt: null,
      ...(allowed ? { id: { in: allowed } } : {}),
    },
    select: { id: true, name: true, letter: true },
    orderBy: [{ gradeYear: "asc" }, { name: "asc" }],
  });

  if (classes.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Davomatni belgilash" description="Sinf tanlab, o‘quvchilar davomatini belgilang." />
        <EmptyState
          icon={GraduationCap}
          title="Sinflar mavjud emas"
          description="Davomat belgilashdan oldin kamida bitta sinf yaratishingiz kerak."
          action={
            can(user, PERMISSION.CLASSES_MANAGE) ? (
              <Button asChild>
                <Link href="/dashboard/classes">Sinflar bo‘limi</Link>
              </Button>
            ) : undefined
          }
        />
      </div>
    );
  }

  const requestedClassId = typeof params.classId === "string" ? params.classId : null;
  let classId = classes.find((c) => c.id === requestedClassId)?.id ?? classes[0].id;
  if (allowed && !scopeAllowsClass(scope, classId)) {
    classId = classes[0].id;
  }

  const data = await getRegister(user.schoolId, classId, date, slot);

  // Per-class study-day check (schedule + school calendar override).
  const [resolver, overrides] = await Promise.all([
    loadClassDayResolver(user.schoolId, date),
    getCalendarOverrides(user.schoolId, date, date),
  ]);
  const override = overrides.get(formatDateOnly(date));
  const studyDay = resolver.isStudyDay(classId, date, override?.isWorkingDay);

  const classOptions: RegisterClass[] = classes.map((schoolClass) => ({
    id: schoolClass.id,
    label: classLabel(schoolClass.name, schoolClass.letter),
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Davomatni belgilash"
        description={`${formatUzDateLong(date)} · ${classLabel(
          data.class?.name ?? "",
          classes.find((c) => c.id === classId)?.letter ?? null,
        )}`}
      />
      <AttendanceRegister
        data={data}
        classes={classOptions}
        classId={classId}
        date={formatDateOnly(date)}
        slot={slot}
        canCorrect={can(user, PERMISSION.ATTENDANCE_CORRECT)}
        studyDay={studyDay}
      />
    </div>
  );
}
