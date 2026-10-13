import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, Clock, Globe, ShieldCheck, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { AppearanceSettings } from "@/components/settings/appearance-settings";
import { prisma } from "@/lib/db";
import { can, requirePageUser } from "@/lib/auth/guards";
import { isSuperAdmin, PERMISSION, ROLE } from "@/lib/constants";
import { formatUzDateLong, LOCALE, today, TIMEZONE } from "@/lib/date";

export const metadata = { title: "Sozlamalar" };

export default async function AdminSettingsPage() {
  const user = await requirePageUser();
  if (!isSuperAdmin(user.permissions) && !can(user, PERMISSION.PLATFORM_STATS)) redirect("/admin");

  const [schoolCount, directorCount, employeeCount] = await Promise.all([
    prisma.school.count({ where: { deletedAt: null } }),
    prisma.user.count({ where: { deletedAt: null, role: { key: ROLE.DIRECTOR } } }),
    prisma.user.count({
      where: { deletedAt: null, role: { key: { in: [ROLE.DEPUTY_DIRECTOR, ROLE.TEACHER, ROLE.EMPLOYEE] } } },
    }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Sozlamalar" description="Ko‘rinish, hisob va platforma ma’lumotlari." />

      <AppearanceSettings initialTheme={user.preference.theme} attendanceSlot="FULL_DAY" showSlot={false} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-primary" /> Platforma ma’lumotlari
            </CardTitle>
            <CardDescription>Tizim konfiguratsiyasi (faqat ko‘rish).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <InfoRow icon={Clock} label="Vaqt mintaqasi" value={TIMEZONE} />
            <InfoRow icon={Globe} label="Til / lokale" value={LOCALE} />
            <InfoRow icon={Building2} label="Maktablar" value={String(schoolCount)} />
            <InfoRow icon={ShieldCheck} label="Direktorlar" value={String(directorCount)} />
            <InfoRow icon={UserRound} label="Xodimlar" value={String(employeeCount)} />
            <InfoRow icon={Clock} label="Bugungi sana" value={formatUzDateLong(today())} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserRound className="h-5 w-5 text-primary" /> Hisob
            </CardTitle>
            <CardDescription>Shaxsiy ma’lumotlar, parol va profil rasmi.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {user.fullName} · {user.roleNameUz}
            </p>
            <Button asChild variant="outline">
              <Link href="/admin/profile">
                <UserRound /> Profilga o‘tish
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: typeof Clock; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b pb-2 last:border-0 last:pb-0">
      <span className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" /> {label}
      </span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
