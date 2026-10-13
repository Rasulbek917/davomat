import { redirect } from "next/navigation";
import { requirePageUser } from "@/lib/auth/guards";
import { AppShell } from "@/components/layout/app-shell";
import { ROLE } from "@/lib/constants";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await requirePageUser();
  if (user.roleKey !== ROLE.SUPER_ADMIN) redirect("/dashboard");
  return <AppShell>{children}</AppShell>;
}
