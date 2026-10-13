import { redirect } from "next/navigation";
import { ClipboardCheck, School } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PeriodFilter } from "@/components/filters/period-filter";
import { prisma } from "@/lib/db";
import { can, requirePageUser } from "@/lib/auth/guards";
import { isSuperAdmin, PERMISSION, SESSION_SLOT_LABEL } from "@/lib/constants";
import { formatDateOnly, formatUzDate, resolveRange } from "@/lib/date";
import { classLabel, fullName } from "@/lib/utils";

export const metadata = { title: "Davomat nazorati" };

export default async function AdminAttendancePage({ searchParams }: PageProps<"/admin/attendance">) {
  const user = await requirePageUser();
  if (!isSuperAdmin(user.permissions) && !can(user, PERMISSION.ATTENDANCE_READ)) redirect("/admin");

  const params = await searchParams;
  const range = resolveRange(
    (params.period as string | undefined) ?? undefined,
    params.from as string | undefined,
    params.to as string | undefined,
  );

  const dateFilter = { gte: range.from, lte: range.to };

  const [total, submitted, draft, schoolCount, sessions] = await Promise.all([
    prisma.attendanceSession.count({ where: { date: dateFilter } }),
    prisma.attendanceSession.count({ where: { date: dateFilter, status: "SUBMITTED" } }),
    prisma.attendanceSession.count({ where: { date: dateFilter, status: "DRAFT" } }),
    prisma.school.count({ where: { deletedAt: null, isActive: true } }),
    prisma.attendanceSession.findMany({
      where: { date: dateFilter },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 60,
      select: {
        id: true,
        date: true,
        slot: true,
        status: true,
        submittedAt: true,
        school: { select: { name: true } },
        class: { select: { name: true, letter: true } },
        recorder: { select: { firstName: true, lastName: true, middleName: true } },
        _count: { select: { records: true } },
      },
    }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Davomat nazorati"
        description={`Barcha maktablar bo‘yicha davomat sessiyalari · ${range.label}`}
      >
        <PeriodFilter preset={range.preset} from={formatDateOnly(range.from)} to={formatDateOnly(range.to)} />
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Sessiyalar" value={total} hint={range.label} icon={ClipboardCheck} tone="primary" />
        <StatCard label="Tasdiqlangan" value={submitted} icon={ClipboardCheck} tone="success" />
        <StatCard label="Qoralama" value={draft} icon={ClipboardCheck} tone="warning" />
        <StatCard label="Faol maktablar" value={schoolCount} icon={School} tone="info" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>So‘nggi sessiyalar</CardTitle>
          <CardDescription>Tanlangan davr uchun oxirgi {sessions.length} ta davomat sessiyasi.</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {sessions.length === 0 ? (
            <div className="px-6">
              <EmptyState
                icon={ClipboardCheck}
                title="Sessiyalar topilmadi"
                description="Bu davr uchun hech qanday davomat sessiyasi belgilanmagan."
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sana</TableHead>
                  <TableHead>Maktab</TableHead>
                  <TableHead>Sinf</TableHead>
                  <TableHead>Smena</TableHead>
                  <TableHead>Holat</TableHead>
                  <TableHead className="text-right">Yozuv</TableHead>
                  <TableHead>Kim</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((session) => (
                  <TableRow key={session.id}>
                    <TableCell className="whitespace-nowrap font-medium">{formatUzDate(session.date)}</TableCell>
                    <TableCell>{session.school.name}</TableCell>
                    <TableCell>{classLabel(session.class.name, session.class.letter)}</TableCell>
                    <TableCell className="text-muted-foreground">{SESSION_SLOT_LABEL[session.slot]}</TableCell>
                    <TableCell>
                      {session.status === "SUBMITTED" ? (
                        <Badge variant="success">Tasdiqlangan</Badge>
                      ) : (
                        <Badge variant="outline">Qoralama</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{session._count.records}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {session.recorder ? fullName(session.recorder) : "—"}
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
