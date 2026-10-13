import { requirePageUser } from "@/lib/auth/guards";
import { homeRouteFor } from "@/lib/auth/session";
import { AppShellClient } from "@/components/layout/app-shell-client";

/** Server wrapper: resolves the current user and renders the interactive shell. */
export async function AppShell({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();

  return (
    <AppShellClient
      user={{
        id: user.id,
        fullName: user.fullName,
        roleKey: user.roleKey,
        roleNameUz: user.roleNameUz,
        schoolName: user.school?.name ?? null,
        avatarPath: user.avatarPath,
        permissions: user.permissions,
        theme: user.preference.theme,
        sidebarCollapsed: user.preference.sidebarCollapsed,
        mustChangePassword: user.mustChangePassword,
        homeHref: homeRouteFor(user.roleKey),
      }}
    >
      {children}
    </AppShellClient>
  );
}