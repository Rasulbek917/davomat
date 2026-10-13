import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { can, requirePageUser } from "@/lib/auth/guards";
import { DEFAULT_PAGE_SIZE, PERMISSION } from "@/lib/constants";
import { PageHeader } from "@/components/ui/page-header";
import { StudentsClient, type ClassOption, type StudentRow } from "@/components/dashboard/students-client";
import { formatDateOnly } from "@/lib/date";
import { classLabel } from "@/lib/utils";
import type { Prisma } from "@prisma/client";
import { getClassScope, scopeClassIds } from "@/lib/auth/scope";

export const metadata = { title: "O‘quvchilar" };

export default async function DashboardStudentsPage({ searchParams }: PageProps<"/dashboard/students">) {
  const user = await requirePageUser();
  if (!user.schoolId) redirect("/dashboard");
  if (!can(user, PERMISSION.STUDENTS_READ)) redirect("/dashboard");

  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.trim() : "";
  const classId = typeof params.classId === "string" ? params.classId : "";
  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = DEFAULT_PAGE_SIZE;

  const scope = await getClassScope(user);
  const allowed = scopeClassIds(scope);
  const scopedClassId = classId || (allowed && allowed.length === 1 ? allowed[0] : "");

  if (allowed && allowed.length === 0) {
    redirect("/dashboard");
  }

  const where: Prisma.StudentWhereInput = {
    schoolId: user.schoolId,
    deletedAt: null,
    ...(query
      ? {
          OR: [
            { firstName: { contains: query, mode: "insensitive" } },
            { lastName: { contains: query, mode: "insensitive" } },
            { middleName: { contains: query, mode: "insensitive" } },
            { externalId: { contains: query, mode: "insensitive" } },
          ],
        }
      : {}),
    enrollments: {
      some: {
        isActive: true,
        ...(scopedClassId ? { classId: scopedClassId } : {}),
        ...(allowed ? { classId: { in: allowed } } : {}),
      },
    },
  };

  const [students, total, classRows] = await Promise.all([
    prisma.student.findMany({
      where,
      include: {
        enrollments: {
          where: { isActive: true, status: "ACTIVE" },
          include: { class: { select: { id: true, name: true, letter: true } } },
          take: 1,
        },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.student.count({ where }),
    prisma.schoolClass.findMany({
      where: {
        schoolId: user.schoolId,
        isActive: true,
        deletedAt: null,
        ...(allowed ? { id: { in: allowed } } : {}),
      },
      select: { id: true, name: true, letter: true, academicYear: true },
      orderBy: [{ gradeYear: "asc" }, { name: "asc" }],
    }),
  ]);

  const rows: StudentRow[] = students.map((student) => {
    const enrollment = student.enrollments[0];
    return {
      id: student.id,
      firstName: student.firstName,
      lastName: student.lastName,
      middleName: student.middleName,
      externalId: student.externalId,
      birthDate: student.birthDate ? formatDateOnly(student.birthDate) : null,
      gender: student.gender,
      status: student.status,
      isActive: student.isActive,
      guardianName: student.guardianName,
      guardianPhone: student.guardianPhone,
      note: student.note,
      classId: enrollment?.class.id ?? null,
      className: enrollment ? classLabel(enrollment.class.name, enrollment.class.letter) : null,
      enrollmentId: enrollment?.id ?? null,
    };
  });

  const classOptions: ClassOption[] = classRows.map((schoolClass) => ({
    id: schoolClass.id,
    label: classLabel(schoolClass.name, schoolClass.letter),
    academicYear: schoolClass.academicYear,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="O‘quvchilar"
        description={`Jami ${total} ta o‘quvchi. Sinfga biriktirish va holatni boshqarish.`}
      />
      <StudentsClient
        students={rows}
        classes={classOptions}
        total={total}
        page={page}
        pageSize={pageSize}
        query={query}
        classId={scopedClassId}
        canManage={can(user, PERMISSION.STUDENTS_MANAGE)}
      />
    </div>
  );
}
