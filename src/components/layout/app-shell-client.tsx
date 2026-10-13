"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, LogOut, Menu, Moon, PanelLeft, Settings, Sun, User as UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { filterNavByPermissions, navForRole, type NavConfig } from "@/components/layout/nav-items";
import { useTheme } from "@/components/theme";
import { logoutAction, updatePreferenceAction } from "@/lib/auth/actions";
import { cn, initials } from "@/lib/utils";

export type ShellUser = {
  id: string;
  fullName: string;
  roleKey: string;
  roleNameUz: string;
  schoolName: string | null;
  avatarPath: string | null;
  permissions: string[];
  theme: "LIGHT" | "DARK" | "SYSTEM";
  sidebarCollapsed: boolean;
  mustChangePassword: boolean;
  homeHref: string;
};

function NavSectionNav({
  nav,
  collapsed,
  pathname,
  onNavigate,
}: {
  nav: NavConfig;
  collapsed: boolean;
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex-1 space-y-4 overflow-y-auto scrollbar-thin px-3 py-4">
      {nav.map((section) => (
        <div key={section.section} className="space-y-1">
          {!collapsed && (
            <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              {section.section}
            </p>
          )}
          {section.items.map((item) => {
            const active =
              pathname === item.href || (item.href !== "/admin" && item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`));
            const Icon = item.icon;
            const link = (
              <Link
                key={item.href}
                href={item.href as never}
                onClick={onNavigate}
                className={cn(
                  "group flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
                  collapsed && "justify-center px-0",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                )}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );
            if (!collapsed) return link;
            return (
              <Tooltip key={item.href} delayDuration={100}>
                <TooltipTrigger asChild>{link}</TooltipTrigger>
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function Brand({ collapsed }: { collapsed: boolean }) {
  return (
    <Link href="/" className={cn("flex items-center gap-2.5 px-4 py-4", collapsed && "justify-center px-0")}>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-foreground shadow-sm">
        MD
      </span>
      {!collapsed && (
        <span className="flex flex-col leading-tight">
          <span className="text-sm font-semibold">Maktab Davomat</span>
          <span className="text-[11px] text-muted-foreground">Boshqaruv tizimi</span>
        </span>
      )}
    </Link>
  );
}

function ThemeToggle({ isDark, onChange }: { isDark: boolean; onChange: (t: "LIGHT" | "DARK") => void }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={isDark ? "Yorug‘ mavzuga o‘tish" : "Tungi mavzuga o‘tish"}
      onClick={() => onChange(isDark ? "LIGHT" : "DARK")}
    >
      {isDark ? <Sun /> : <Moon />}
    </Button>
  );
}

export function AppShellClient({ user, children }: { user: ShellUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = React.useState(user.sidebarCollapsed);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const { theme, isDark, setTheme } = useTheme(user.theme);
  const logoutFormRef = React.useRef<HTMLFormElement>(null);

  const nav = React.useMemo(
    () => filterNavByPermissions(navForRole(user.roleKey), user.permissions),
    [user.roleKey, user.permissions],
  );

  const handleCollapse = () => {
    const next = !collapsed;
    setCollapsed(next);
    void updatePreferenceAction({ theme: theme as "LIGHT" | "DARK" | "SYSTEM", sidebarCollapsed: next });
  };

  const handleTheme = (next: "LIGHT" | "DARK") => {
    setTheme(next);
    void updatePreferenceAction({ theme: next });
  };

  return (
    <TooltipProvider delayDuration={150}>
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 hidden flex-col border-r bg-sidebar lg:flex",
          collapsed ? "w-[68px]" : "w-64",
        )}
      >
        <Brand collapsed={collapsed} />
        <NavSectionNav nav={nav} collapsed={collapsed} pathname={pathname} />
        <div className="border-t p-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCollapse}
            className={cn("w-full justify-start gap-2 text-muted-foreground", collapsed && "justify-center")}
          >
            {collapsed ? <PanelLeft /> : <ChevronLeft />}
            {!collapsed && <span>Yig‘ish</span>}
          </Button>
        </div>
      </aside>

      {/* Mobile drawer */}
      <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogContent
          className="fixed inset-y-0 left-0 top-0 h-full w-72 max-w-[85vw] translate-x-0 translate-y-0 gap-0 rounded-none rounded-r-xl p-0"
          hideClose
        >
          <DialogTitle className="sr-only">Asosiy menyu</DialogTitle>
          <Brand collapsed={false} />
          <NavSectionNav nav={nav} collapsed={false} pathname={pathname} onNavigate={() => setMobileOpen(false)} />
        </DialogContent>
      </Dialog>

      {/* Content column */}
      <div className={cn("flex min-h-screen flex-col", collapsed ? "lg:pl-[68px]" : "lg:pl-64")}>
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur-lg sm:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-label="Menyuni ochish"
            onClick={() => setMobileOpen(true)}
          >
            <Menu />
          </Button>

          <div className="min-w-0 flex-1">
            {user.schoolName ? (
              <div className="flex items-center gap-2 truncate">
                <span className="truncate text-sm font-medium">{user.schoolName}</span>
                <span className="hidden rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground sm:inline">
                  {user.roleNameUz}
                </span>
              </div>
            ) : (
              <span className="text-sm font-medium">{user.roleNameUz}</span>
            )}
          </div>

          <ThemeToggle isDark={isDark} onChange={handleTheme} />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-2 rounded-full p-0.5 outline-none ring-offset-background transition focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Foydalanuvchi menyusi"
              >
                <Avatar className="h-9 w-9">
                  {user.avatarPath && <AvatarImage src={`/api/avatars/${user.avatarPath}`} alt={user.fullName} />}
                  <AvatarFallback>{initials(user.fullName.split(" ")[1], user.fullName.split(" ")[0])}</AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel className="flex flex-col gap-0.5">
                <span className="truncate text-sm font-medium">{user.fullName}</span>
                <span className="truncate text-xs font-normal text-muted-foreground">
                  {user.schoolName ?? user.roleNameUz}
                </span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href={`${user.homeHref}/profile` as never} className="cursor-pointer">
                  <UserIcon /> Profil
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`${user.homeHref}/settings` as never} className="cursor-pointer">
                  <Settings /> Sozlamalar
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => logoutFormRef.current?.requestSubmit()}
              >
                <LogOut /> Chiqish
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        {/* Kept outside the dropdown: Radix unmounts menu content on select, which
            would cancel a native form submit if the form lived inside the menu. */}
        <form ref={logoutFormRef} action={logoutAction} className="hidden" aria-hidden="true" />

        {user.mustChangePassword && (
          <div className="border-b border-warning/30 bg-warning/10 px-4 py-2 text-sm text-warning-foreground dark:text-warning sm:px-6">
            Xavfsizlik uchun parolingizni o‘zgartiring.{" "}
            <Link href={`${user.homeHref}/profile?c=1` as never} className="font-medium underline">
              Profilga o‘tish
            </Link>
          </div>
        )}

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:py-8">{children}</main>

        <footer className="border-t px-4 py-4 text-center text-xs text-muted-foreground sm:px-6">
          Maktab Davomat · {new Date().getFullYear()}
        </footer>
      </div>
    </TooltipProvider>
  );
}