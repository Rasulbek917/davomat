import { prisma } from "@/lib/db";
import { requirePageUser } from "@/lib/auth/guards";
import { ROLE } from "@/lib/constants";
import { PageHeader } from "@/components/ui/page-header";
import { DirectorsClient, type DirectorRow, type SchoolOption } from "@/components/admin/directors-client";

export const metadata = { title: "Direktorlar" };

export default async function AdminDirectorsPage() {
  await requirePageUser();

  const [directors, schools] = await Promise.all([
    prisma.user.findMany({
      where: { deletedAt: null, role: { key: ROLE.DIRECTOR } },
      include: { school: { select: { id: true, name: true } } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    prisma.school.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, isActive: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const rows: DirectorRow[] = directors.map((director) => ({
    id: director.id,
    firstName: director.firstName,
    lastName: director.lastName,
    middleName: director.middleName,
    login: director.login,
    phone: director.phone,
    schoolId: director.school?.id ?? "",
    schoolName: director.school?.name ?? "—",
    isActive: director.isActive,
    mustChangePassword: director.mustChangePassword,
  }));

  const schoolOptions: SchoolOption[] = schools;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Direktorlar"
        description={`Jami ${rows.length} ta direktor. Har bir maktabga direktor biriktiriladi.`}
      />
      <DirectorsClient directors={rows} schools={schoolOptions} />
    </div>
  );
}
