import { prisma } from "@/lib/db";
import { requirePageUser } from "@/lib/auth/guards";
import { ROLE } from "@/lib/constants";
import { PageHeader } from "@/components/ui/page-header";
import { SchoolsClient, type SchoolRow } from "@/components/admin/schools-client";

export const metadata = { title: "Maktablar" };

export default async function AdminSchoolsPage() {
  await requirePageUser();

  const schools = await prisma.school.findMany({
    where: { deletedAt: null },
    include: {
      _count: {
        select: {
          users: { where: { deletedAt: null, role: { key: ROLE.DIRECTOR } } },
          students: { where: { deletedAt: null, isActive: true } },
          classes: { where: { deletedAt: null, isActive: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const rows: SchoolRow[] = schools.map((school) => ({
    id: school.id,
    code: school.code,
    name: school.name,
    region: school.region,
    district: school.district,
    address: school.address,
    phone: school.phone,
    email: school.email,
    isActive: school.isActive,
    directorCount: school._count.users,
    studentCount: school._count.students,
    classCount: school._count.classes,
  }));

  return (
    <div className="space-y-6">
      <PageHeader title="Maktablar" description={`Jami ${rows.length} ta maktab.`} />
      <SchoolsClient schools={rows} />
    </div>
  );
}
