import { redirect } from "next/navigation";
import Link from "next/link";
import { CalendarClock, School as SchoolIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { prisma } from "@/lib/db";
import { can, requirePageUser } from "@/lib/auth/guards";
import { DUTY_STATUS_LABEL, DUTY_STATUS_VARIANT, isSuperAdmin, PERMISSION, WEEKDAY_LABEL } from "@/lib/constants";
import { addDays, formatDateOnly, formatUzDate, today } from "@/lib/date";
import { fullName } from "@/lib/utils";

export const metadata = { title: "Navbatchilik nazorati" };

export default async function AdminDutyPage() {
  const user = await requirePageUser();
  if (!isSuperAdmin(user.permissions) && !can(user, PERMISSION.DUTY_READ)) redirect("/admin");

  const now = today();
  const from = now;
  const to = addDays(now, 30);

  const [schools, settings, upcoming, counts] = await Promise.all([
    prisma.school.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, isActive: true },
      orderBy: { name: "asc" },
    }),
    prisma.dutySettings.findMany({
      select: { schoolId: true, perDay: true, weekdays: true, isActive: true },
    }),
    prisma.dutyAssignment.findMany({
      where: { date: { gte: from, lte: to }, status: { not: "CANCELLED" } },
      orderBy: [{ date: "asc" }],
      take: 80,
      select: {
        id: true,
        date: true,
        status: true,
        school: { select: { id: true, name: true } },
        teacher: { select: { firstName: true, lastName: true, middleName: true } },
      },
    }),
    prisma.dutyAssignment.groupBy({ by: ["schoolId"], _count: { _all: true } }),
  ]);

  const settingsMap = new Map(settings.map((s) => [s.schoolId, s]));
  const countMap = new Map(counts.map((c) => [c.schoolId, c._count._all]));
  const configured = schools.filter((s) => settingsMap.has(s.id)).length;
  const todayIso = formatDateOnly(now);
  const todayCount = upcoming.filter((a) => formatDateOnly(a.date) === todayIso).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Navbatchilik nazorati"
        description={`Barcha maktablar bo‘yicha navbatchilik holati · ${from.getUTCFullYear()}`}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Faol maktablar" value={schools.filter((s) => s.isActive).length} icon={SchoolIcon} tone="primary" />
        <StatCard label="Sozlangan" value={`${configured} / ${schools.length}`} icon={CalendarClock} tone="info" />
        <StatCard label="Bugungi navbatchiliklar" value={todayCount} icon={CalendarClock} tone="success" />
        <StatCard label="Kelgusi 30 kun" value={upcoming.length} icon={CalendarClock} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Maktablar kesimida</CardTitle>
          <CardDescription>Har bir maktabning navbatchilik sozlamalari va tayinlovlar soni.</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {schools.length === 0 ? (
            <div className="px-6">
              <EmptyState icon={SchoolIcon} title="Maktab yo‘q" description="Hali maktab qo‘shilmagan." />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Maktab</TableHead>
                  <TableHead>Sozlama</TableHead>
                  <TableHead className="text-right">Kuniga</TableHead>
                  <TableHead>Navbatchilik kunlari</TableHead>
                  <TableHead className="text-right">Jami tayinlov</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {schools.map((school) => {
                  const setting = settingsMap.get(school.id);
                  return (
                    <TableRow key={school.id}>
                      <TableCell className="font-medium">{school.name}</TableCell>
                      <TableCell>
                        {setting ? (
                          <Badge variant={setting.isActive ? "success" : "outline"}>
                            {setting.isActive ? "Faol" : "Nofaol"}
                          </Badge>
                        ) : (
                          <Badge variant="warning">Sozlanmagan</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{setting?.perDay ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {setting
                          ? setting.weekdays
                              .sort((a, b) => a - b)
                              .map((d) => WEEKDAY_LABEL[d]?.slice(0, 2))
                              .join(", ")
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{countMap.get(school.id) ?? 0}</TableCell>
                      <TableCell className="text-right">
                        <Link
                          href={`/admin/reports?school=${school.id}`}
                          className="text-sm text-primary hover:underline"
                        >
                          Hisobot
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Kelgusi navbatchiliklar</CardTitle>
          <CardDescription>Kelgusi 30 kun uchun barcha maktablar bo‘yicha tayinlovlar.</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {upcoming.length === 0 ? (
            <div className="px-6">
              <EmptyState
                icon={CalendarClock}
                title="Tayinlovlar yo‘q"
                description="Kelgusi 30 kun uchun navbatchilik tayinlanmagan."
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sana</TableHead>
                  <TableHead>Maktab</TableHead>
                  <TableHead>Navbatchi</TableHead>
                  <TableHead>Holat</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {upcoming.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap font-medium">{formatUzDate(row.date)}</TableCell>
                    <TableCell>{row.school.name}</TableCell>
                    <TableCell>{fullName(row.teacher) || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={DUTY_STATUS_VARIANT[row.status]}>{DUTY_STATUS_LABEL[row.status]}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
