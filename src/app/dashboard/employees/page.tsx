import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { can, requirePageUser } from "@/lib/auth/guards";
import { ASSIGNABLE_ROLE_KEYS, PERMISSION } from "@/lib/constants";
import { PageHeader } from "@/components/ui/page-header";
import { EmployeesClient, type EmployeeRow } from "@/components/dashboard/employees-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";


export const metadata = { title: "Xodimlar" };

export default async function DashboardEmployeesPage() {
  const user = await requirePageUser();
  if (!user.schoolId) redirect("/dashboard");
  if (!can(user, PERMISSION.EMPLOYEES_MANAGE)) redirect("/dashboard");

  const [employees, classes] = await Promise.all([
    prisma.user.findMany({
      where: {
        schoolId: user.schoolId,
        deletedAt: null,
        role: { key: { in: [...ASSIGNABLE_ROLE_KEYS] } },
      },
      include: {
        role: { select: { key: true, nameUz: true } },
        employeeProfile: { select: { position: true } },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    prisma.schoolClass.findMany({
      where: { schoolId: user.schoolId, deletedAt: null },
      include: { teacher: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: [{ gradeYear: "asc" }, { name: "asc" }],
    }),
  ]);

  const rows: EmployeeRow[] = employees.map((employee) => ({
    id: employee.id,
    firstName: employee.firstName,
    lastName: employee.lastName,
    middleName: employee.middleName,
    login: employee.login,
    phone: employee.phone,
    roleKey: employee.role.key as EmployeeRow["roleKey"],
    roleName: employee.role.nameUz,
    position: employee.employeeProfile?.position ?? null,
    isActive: employee.isActive,
    mustChangePassword: employee.mustChangePassword,
  }));

  // teacherOptions not needed here yet (moved to client if needed)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Xodimlar"
        description={`Jami ${rows.length} ta xodim. Rolga qarab tizim imkoniyatlari belgilanadi.`}
      />
      <EmployeesClient employees={rows} />

      <Card>
        <CardHeader>
          <CardTitle>Sinf rahbarlari</CardTitle>
          <CardDescription>Har bir sinfga sinf rahbarini tayinlash</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sinf</TableHead>
                <TableHead>Sinf rahbari</TableHead>
                <TableHead className="w-40" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {classes.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">
                    {c.name}
                    {c.letter ? `-${c.letter}` : ""}
                  </TableCell>
                  <TableCell>{c.teacher ? `${c.teacher.lastName} ${c.teacher.firstName}` : "—"}</TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline">
                      Tayinlash
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
