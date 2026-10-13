import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { can, requirePageUser } from "@/lib/auth/guards";
import { PERMISSION } from "@/lib/constants";
import { PageHeader } from "@/components/ui/page-header";
import { ClassesClient, type ClassRow, type TeacherOption } from "@/components/dashboard/classes-client";
import { shortName } from "@/lib/utils";
import { getClassScope, scopeClassIds } from "@/lib/auth/scope";

export const metadata = { title: "Sinflar" };

export default async function DashboardClassesPage() {
  const user = await requirePageUser();
  if (!user.schoolId) redirect("/dashboard");
  if (!can(user, PERMISSION.CLASSES_READ)) redirect("/dashboard");

  const scope = await getClassScope(user);
  const allowed = scopeClassIds(scope);
  if (allowed && allowed.length === 0) {
    redirect("/dashboard");
  }

  const [classes, teachers] = await Promise.all([
    prisma.schoolClass.findMany({
      where: {
        schoolId: user.schoolId,
        deletedAt: null,
        ...(allowed ? { id: { in: allowed } } : {}),
      },
      include: {
        teacher: { select: { id: true, firstName: true, lastName: true } },
        _count: {
          select: {
            enrollments: { where: { isActive: true } },
            attendanceSessions: true,
          },
        },
      },
      orderBy: [{ gradeYear: "asc" }, { name: "asc" }],
    }),
    prisma.user.findMany({
      where: { schoolId: user.schoolId, isActive: true, deletedAt: null },
      select: { id: true, firstName: true, lastName: true, role: { select: { key: true } } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
  ]);

  const rows: ClassRow[] = classes.map((schoolClass) => ({
    id: schoolClass.id,
    name: schoolClass.name,
    letter: schoolClass.letter,
    gradeYear: schoolClass.gradeYear,
    academicYear: schoolClass.academicYear,
    capacity: schoolClass.capacity,
    teacherId: schoolClass.teacherId,
    teacherName: schoolClass.teacher ? shortName(schoolClass.teacher) : null,
    isActive: schoolClass.isActive,
    studentCount: schoolClass._count.enrollments,
    sessionCount: schoolClass._count.attendanceSessions,
    workingDays: schoolClass.workingDays,
  }));

  const teacherOptions: TeacherOption[] = teachers.map((teacher) => ({
    id: teacher.id,
    name: shortName(teacher),
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sinflar"
        description={`Jami ${rows.length} ta sinf. Sinfni bosib o‘quvchilar ro‘yxatini ko‘ring.`}
      />
      <ClassesClient
        classes={rows}
        teachers={teacherOptions}
        canManage={can(user, PERMISSION.CLASSES_MANAGE)}
      />
    </div>
  );
}
