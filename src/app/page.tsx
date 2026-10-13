import { redirect } from "next/navigation";
import { getCurrentUser, homeRouteFor } from "@/lib/auth/session";

export default async function HomePage() {
  const user = await getCurrentUser();
  redirect(user ? homeRouteFor(user.roleKey) : "/login");
}