import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { isAdmin, requirePageUser } from "@/lib/auth/guards";
import { PageHeader } from "@/components/ui/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AiClient } from "@/components/dashboard/ai-client";
import { listSchoolChoices, loadSchoolAiData, type AiSchoolData } from "@/lib/ai/page-data";

export const metadata = { title: "AI + eMaktab" };

const EMPTY_DATA: AiSchoolData = {
  aiReady: false,
  aiModel: "",
  aiHost: "",
  emaktab: null,
  syncLogs: [],
  pendingReviews: 0,
  classes: [],
};

/**
 * Super-admin view of the AI + eMaktab module. A school must be selected; the
 * selected id is validated against the DB before any data is loaded and again
 * on every AI request in `buildAiContext`.
 */
export default async function AdminAiPage({
  searchParams,
}: {
  searchParams: Promise<{ schoolId?: string }>;
}) {
  const user = await requirePageUser();
  if (!isAdmin(user)) redirect("/dashboard/ai");

  const params = await searchParams;
  const requested = typeof params.schoolId === "string" ? params.schoolId : null;

  const schools = await listSchoolChoices();
  let data: AiSchoolData = EMPTY_DATA;
  let selectedSchoolId: string | null = null;
  let schoolName = "";

  if (requested) {
    const school = await prisma.school.findFirst({
      where: { id: requested, deletedAt: null },
      select: { id: true, name: true },
    });
    if (school) {
      selectedSchoolId = school.id;
      schoolName = school.name;
      data = await loadSchoolAiData(school.id, null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI + eMaktab"
        description="Maktabni tanlang va eMaktab integratsiyasi hamda AI tahlilini boshqaring"
      />
      {!selectedSchoolId && (
        <Alert variant="info">
          <AlertDescription className="text-foreground">
            Boshlash uchun yuqoridan maktabni tanlang.
          </AlertDescription>
        </Alert>
      )}
      <AiClient
        data={data}
        canManage={false}
        schoolName={schoolName || "Maktab"}
        schools={schools}
        selectedSchoolId={selectedSchoolId}
        scopeClassId={null}
      />
    </div>
  );
}
