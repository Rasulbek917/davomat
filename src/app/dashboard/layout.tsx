import { redirect } from "next/navigation";
import { requirePageUser } from "@/lib/auth/guards";
import { AppShell } from "@/components/layout/app-shell";
import { ROLE } from "@/lib/constants";

export default async function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  const user = await requirePageUser();
  if (user.roleKey === ROLE.SUPER_ADMIN) redirect("/admin");
  return <AppShell>{children}</AppShell>;
}
