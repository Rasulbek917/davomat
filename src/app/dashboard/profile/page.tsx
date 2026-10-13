import { Suspense } from "react";
import { prisma } from "@/lib/db";
import { requirePageUser } from "@/lib/auth/guards";
import { PageHeader } from "@/components/ui/page-header";
import { Spinner } from "@/components/ui/spinner";
import { ProfileClient, type ProfileUser } from "@/components/profile/profile-client";

export const metadata = { title: "Profil" };

export default async function DashboardProfilePage() {
  const user = await requirePageUser();
  const record = await prisma.user.findUnique({ where: { id: user.id }, select: { phone: true } });

  const profile: ProfileUser = {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    middleName: user.middleName,
    login: user.login,
    phone: record?.phone ?? null,
    avatarPath: user.avatarPath,
    roleNameUz: user.roleNameUz,
    schoolName: user.school?.name ?? null,
    mustChangePassword: user.mustChangePassword,
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Profil" description="Shaxsiy ma’lumotlar va xavfsizlik sozlamalari." />
      <Suspense fallback={<Spinner />}>
        <ProfileClient user={profile} />
      </Suspense>
    </div>
  );
}
