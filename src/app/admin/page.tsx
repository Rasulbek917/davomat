import Link from "next/link";
import { Building2, GraduationCap, School, UserCheck, Users } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePageUser } from "@/lib/auth/guards";
import { ROLE } from "@/lib/constants";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { formatUzDateTime } from "@/lib/date";
import { truncate } from "@/lib/utils";

export const metadata = { title: "Boshqaruv paneli" };

export default async function AdminDashboardPage() {
  await requirePageUser();

  const [schoolCount, activeSchoolCount, directorCount, studentCount, classCount, schools, auditLogs] =
    await Promise.all([
      prisma.school.count({ where: { deletedAt: null } }),
      prisma.school.count({ where: { deletedAt: null, isActive: true } }),
      prisma.user.count({ where: { deletedAt: null, role: { key: ROLE.DIRECTOR } } }),
      prisma.student.count({ where: { deletedAt: null, isActive: true } }),
      prisma.schoolClass.count({ where: { deletedAt: null, isActive: true } }),
      prisma.school.findMany({
        where: { deletedAt: null },
        select: {
          id: true,
          name: true,
          code: true,
          region: true,
          isActive: true,
          createdAt: true,
          _count: {
            select: {
              students: { where: { deletedAt: null, isActive: true } },
              classes: { where: { deletedAt: null, isActive: true } },
              users: { where: { deletedAt: null } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 6,
      }),
      prisma.auditLog.findMany({
        select: { id: true, action: true, summary: true, createdAt: true, actor: { select: { firstName: true, lastName: true } } },
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
    ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Boshqaruv paneli"
        description="Tizim bo‘yicha umumiy ko‘rsatkichlar."
      >
        <Button asChild>
          <Link href="/admin/schools">Maktablar</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/admin/directors">Direktorlar</Link>
        </Button>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Maktablar" value={schoolCount} hint={`${activeSchoolCount} ta faol`} icon={School} tone="primary" />
        <StatCard label="Direktorlar" value={directorCount} icon={UserCheck} tone="info" />
        <StatCard label="O‘quvchilar" value={studentCount} icon={Users} tone="success" />
        <StatCard label="Sinflar" value={classCount} icon={GraduationCap} tone="warning" />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Maktablar</CardTitle>
            <CardDescription>Oxirgi qo‘shilgan maktablar va ularning ko‘rsatkichlari.</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            {schools.length === 0 ? (
              <div className="px-6">
                <EmptyState
                  icon={Building2}
                  title="Hozircha maktab qo‘shilmagan"
                  description="Tizimdan foydalanish uchun birinchi maktabni qo‘shing."
                  action={
                    <Button asChild>
                      <Link href="/admin/schools">Maktab qo‘shish</Link>
                    </Button>
                  }
                />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Maktab</TableHead>
                    <TableHead className="text-right">O‘quvchi</TableHead>
                    <TableHead className="text-right">Sinf</TableHead>
                    <TableHead className="text-right">Foydalanuvchi</TableHead>
                    <TableHead>Holat</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {schools.map((school) => (
                    <TableRow key={school.id}>
                      <TableCell>
                        <div className="font-medium">{school.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {school.code}
                          {school.region ? ` · ${school.region}` : ""}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{school._count.students}</TableCell>
                      <TableCell className="text-right tabular-nums">{school._count.classes}</TableCell>
                      <TableCell className="text-right tabular-nums">{school._count.users}</TableCell>
                      <TableCell>
                        {school.isActive ? (
                          <Badge variant="success">Faol</Badge>
                        ) : (
                          <Badge variant="outline">Faol emas</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>So‘nggi harakatlar</CardTitle>
            <CardDescription>Audit jurnalidan oxirgi yozuvlar.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {auditLogs.length === 0 ? (
              <p className="text-sm text-muted-foreground">Yozuvlar yo‘q.</p>
            ) : (
              auditLogs.map((log) => (
                <div key={log.id} className="flex flex-col gap-0.5 border-b pb-2 last:border-0 last:pb-0">
                  <span className="text-sm">{truncate(log.summary, 90)}</span>
                  <span className="text-xs text-muted-foreground">
                    {log.actor ? `${log.actor.lastName} ${log.actor.firstName}` : "Tizim"} ·{" "}
                    {formatUzDateTime(log.createdAt)}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
