import Link from "next/link";
import { BarChart3, LineChart, Sparkles, Wand2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

/**
 * Dashboard entry card for the AI + eMaktab module (spec §20). Purely
 * presentational — the actual assistant lives at /dashboard/ai and enforces
 * RBAC server-side.
 */
export function AiAssistantCard({ aiReady, href = "/dashboard/ai" }: { aiReady: boolean; href?: string }) {
  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> AI yordamchi
          </CardTitle>
          <Badge variant={aiReady ? "success" : "warning"}>{aiReady ? "Tayyor" : "Sozlanmagan"}</Badge>
        </div>
        <CardDescription>
          Maktabingizdagi davomat, o‘quvchilar va eMaktab ma’lumotlarini tahlil qiling. AI faqat real bazadan
          hisoblaydi.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button asChild>
          <Link href={href}>
            <Wand2 /> AI’ga savol berish
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={href}>
            <LineChart /> Bugungi holatni tahlil qilish
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={href}>
            <BarChart3 /> Hisobot yaratish
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
