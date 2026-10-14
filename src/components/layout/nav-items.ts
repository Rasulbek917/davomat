import {
  BarChart3,
  CalendarClock,
  ClipboardCheck,
  History,
  Link2,
  School,
  Settings,
  Users,
  GraduationCap,
  LayoutDashboard,
  Sparkles,
  UserCog,
  type LucideIcon,
} from "lucide-react";
import { PERMISSION, ROLE, type PermissionKey } from "@/lib/constants";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Required permission; null = always visible to authenticated users. */
  permission?: PermissionKey;
  /** When true, icons are hidden on small screens (compact mode). */
};

export type NavConfig = {
  section: string;
  items: NavItem[];
}[];

/** Sidebar nav for the Super Admin area. */
export const SUPER_ADMIN_NAV: NavConfig = [
  {
    section: "Asosiy",
    items: [
      { href: "/admin", label: "Boshqaruv paneli", icon: LayoutDashboard },
      { href: "/admin/schools", label: "Maktablar", icon: School, permission: PERMISSION.SCHOOLS_MANAGE },
      { href: "/admin/directors", label: "Direktorlar", icon: UserCog, permission: PERMISSION.DIRECTORS_MANAGE },
    ],
  },
  {
    section: "Ma’lumotlar",
    items: [
      { href: "/admin/attendance", label: "Davomat", icon: ClipboardCheck, permission: PERMISSION.ATTENDANCE_READ },
      { href: "/admin/duty", label: "Navbatchilik", icon: CalendarClock, permission: PERMISSION.DUTY_READ },
      { href: "/admin/reports", label: "Hisobotlar", icon: BarChart3, permission: PERMISSION.REPORTS_READ },
      { href: "/admin/integration", label: "Integratsiya", icon: Link2, permission: PERMISSION.INTEGRATION_READ },
    ],
  },
  {
    section: "Intellekt",
    items: [{ href: "/admin/ai", label: "AI + eMaktab", icon: Sparkles }],
  },
  {
    section: "Tizim",
    items: [
      { href: "/admin/settings", label: "Sozlamalar", icon: Settings },
      { href: "/admin/profile", label: "Profil", icon: Users },
    ],
  },
];

/** Sidebar nav for school-scoped users (director / deputy / teacher / employee). */
export const SCHOOL_NAV: NavConfig = [
  {
    section: "Asosiy",
    items: [
      { href: "/dashboard", label: "Boshqaruv paneli", icon: LayoutDashboard },
      { href: "/dashboard/employees", label: "Xodimlar", icon: Users, permission: PERMISSION.EMPLOYEES_MANAGE },
      { href: "/dashboard/classes", label: "Sinflar", icon: GraduationCap, permission: PERMISSION.CLASSES_READ },
      { href: "/dashboard/students", label: "O‘quvchilar", icon: Users, permission: PERMISSION.STUDENTS_READ },
    ],
  },
  {
    section: "Davomat",
    items: [
      { href: "/dashboard/attendance", label: "Davomatni belgilash", icon: ClipboardCheck, permission: PERMISSION.ATTENDANCE_WRITE },
      { href: "/dashboard/history", label: "Davomat tarixi", icon: History, permission: PERMISSION.ATTENDANCE_READ },
      { href: "/dashboard/duty", label: "Navbatchilik", icon: CalendarClock, permission: PERMISSION.DUTY_READ },
      { href: "/dashboard/reports", label: "Hisobotlar", icon: BarChart3, permission: PERMISSION.REPORTS_READ },
    ],
  },
  {
    section: "Intellekt",
    items: [
      { href: "/dashboard/ai", label: "AI + eMaktab", icon: Sparkles, permission: PERMISSION.AI_USE },
    ],
  },
  {
    section: "Tizim",
    items: [
      { href: "/dashboard/integration", label: "eMaktab integratsiyasi", icon: Link2, permission: PERMISSION.INTEGRATION_READ },
      { href: "/dashboard/settings", label: "Sozlamalar", icon: Settings },
      { href: "/dashboard/profile", label: "Profil", icon: Users },
    ],
  },
];

export function navForRole(roleKey: string): NavConfig {
  return roleKey === ROLE.SUPER_ADMIN ? SUPER_ADMIN_NAV : SCHOOL_NAV;
}

export function filterNavByPermissions(nav: NavConfig, permissions: string[]): NavConfig {
  return nav
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (item) => !item.permission || permissions.includes("*") || permissions.includes(item.permission),
      ),
    }))
    .filter((section) => section.items.length > 0);
}