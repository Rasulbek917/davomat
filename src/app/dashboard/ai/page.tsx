import { redirect } from "next/navigation";
import { requirePageUser, can } from "@/lib/auth/guards";
import { getClassScope, hasAnyClass } from "@/lib/auth/scope";
import { PERMISSION, ROLE } from "@/lib/constants";
import { PageHeader } from "@/components/ui/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AiClient } from "@/components/dashboard/ai-client";
import { loadSchoolAiData } from "@/lib/ai/page-data";

export const metadata = { title: "AI + eMaktab" };

/**
 * "AI + eMaktab" section for school-scoped users (director / deputy / teacher /
 * class teacher). Super admins are redirected to /admin/ai where they first
 * pick a school.
 */
export default async function AiPage() {
  const user = await requirePageUser();

  if (user.roleKey === ROLE.SUPER_ADMIN || !user.schoolId) {
    redirect("/admin/ai");
  }
  if (!can(user, PERMISSION.AI_USE)) {
    redirect("/dashboard");
  }

  const scope = await getClassScope(user);
  if (!hasAnyClass(scope)) {
    return (
      <div className="space-y-6">
        <PageHeader title="AI + eMaktab" description="Sinf rahbari va o‘qituvchilar uchun AI tahlil" />
        <Alert variant="info">
          <AlertDescription className="text-foreground">
            Sizga sinf biriktirilmagan, shuning uchun AI tahlili uchun ma’lumot yo‘q. Direktor bilan bog‘laning.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const allowedClassIds = scope.kind === "CLASSES" ? scope.classIds : null;
  const scopeClassId =
    scope.kind === "CLASSES" && scope.classIds.length === 1 ? scope.classIds[0] : null;

  const data = await loadSchoolAiData(user.schoolId, allowedClassIds);

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI + eMaktab"
        description="eMaktab ma’lumotlarini boshqaring va maktab davomatini AI orqali tahlil qiling"
      />
      <AiClient
        data={data}
        canManage={can(user, PERMISSION.INTEGRATION_MANAGE)}
        schoolName={user.school?.name ?? "Maktab"}
        selectedSchoolId={null}
        scopeClassId={scopeClassId}
      />
    </div>
  );
}
