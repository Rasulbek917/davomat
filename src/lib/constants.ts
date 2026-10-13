import type { AttendanceStatus, DutyAssignmentStatus, SessionSlot } from "@prisma/client";

// ---------------------------------------------------------------------------
// Roles & permissions
// ---------------------------------------------------------------------------

export const ROLE = {
  SUPER_ADMIN: "SUPER_ADMIN",
  DIRECTOR: "DIRECTOR",
  DEPUTY_DIRECTOR: "DEPUTY_DIRECTOR",
  TEACHER: "TEACHER",
  EMPLOYEE: "EMPLOYEE",
} as const;

export type RoleKey = (typeof ROLE)[keyof typeof ROLE];

export const PERMISSION = {
  SCHOOLS_MANAGE: "schools:manage",
  DIRECTORS_MANAGE: "directors:manage",
  EMPLOYEES_MANAGE: "employees:manage",
  CLASSES_READ: "classes:read",
  CLASSES_MANAGE: "classes:manage",
  STUDENTS_READ: "students:read",
  STUDENTS_MANAGE: "students:manage",
  ATTENDANCE_READ: "attendance:read",
  ATTENDANCE_WRITE: "attendance:write",
  ATTENDANCE_CORRECT: "attendance:correct",
  REPORTS_READ: "reports:read",
  REPORTS_EXPORT: "reports:export",
  INTEGRATION_READ: "integration:read",
  INTEGRATION_MANAGE: "integration:manage",
  DUTY_READ: "duty:read",
  DUTY_MANAGE: "duty:manage",
  AUDIT_READ: "audit:read",
  PLATFORM_STATS: "platform:stats",
} as const;

export type PermissionKey = (typeof PERMISSION)[keyof typeof PERMISSION];

export const ALL_PERMISSIONS: PermissionKey[] = Object.values(PERMISSION);

export type RoleDefinition = {
  key: RoleKey;
  nameUz: string;
  description: string;
  permissions: string[];
  schoolScoped: boolean;
};

/**
 * Seeded roles. `permissions` may contain the wildcard "*".
 * `schoolScoped` means every query performed by the role must be filtered by
 * the user's assigned school.
 */
export const ROLE_DEFINITIONS: RoleDefinition[] = [
  {
    key: ROLE.SUPER_ADMIN,
    nameUz: "Bosh administrator",
    description: "Tizim egasi. Maktablar va direktorlarni boshqaradi.",
    permissions: ["*"],
    schoolScoped: false,
  },
  {
    key: ROLE.DIRECTOR,
    nameUz: "Direktor",
    description: "O‘z maktabi doirasida to‘liq boshqaruv.",
    permissions: [
      PERMISSION.EMPLOYEES_MANAGE,
      PERMISSION.CLASSES_READ,
      PERMISSION.CLASSES_MANAGE,
      PERMISSION.STUDENTS_READ,
      PERMISSION.STUDENTS_MANAGE,
      PERMISSION.ATTENDANCE_READ,
      PERMISSION.ATTENDANCE_WRITE,
      PERMISSION.ATTENDANCE_CORRECT,
      PERMISSION.REPORTS_READ,
      PERMISSION.REPORTS_EXPORT,
      PERMISSION.INTEGRATION_READ,
      PERMISSION.INTEGRATION_MANAGE,
      PERMISSION.DUTY_READ,
      PERMISSION.DUTY_MANAGE,
      PERMISSION.AUDIT_READ,
    ],
    schoolScoped: true,
  },
  {
    key: ROLE.DEPUTY_DIRECTOR,
    nameUz: "O‘quv ishlari bo‘yicha o‘rinbosar",
    description: "Davomat va hisobotlarni nazorat qiladi.",
    permissions: [
      PERMISSION.CLASSES_READ,
      PERMISSION.STUDENTS_READ,
      PERMISSION.ATTENDANCE_READ,
      PERMISSION.ATTENDANCE_WRITE,
      PERMISSION.ATTENDANCE_CORRECT,
      PERMISSION.REPORTS_READ,
      PERMISSION.REPORTS_EXPORT,
      PERMISSION.INTEGRATION_READ,
      PERMISSION.DUTY_READ,
      PERMISSION.DUTY_MANAGE,
    ],
    schoolScoped: true,
  },
  {
    key: ROLE.TEACHER,
    nameUz: "Sinf rahbari / o‘qituvchi",
    description: "O‘ziga biriktirilgan sinflarda davomat yuritadi.",
    permissions: [
      PERMISSION.CLASSES_READ,
      PERMISSION.STUDENTS_READ,
      PERMISSION.ATTENDANCE_READ,
      PERMISSION.ATTENDANCE_WRITE,
      PERMISSION.REPORTS_READ,
      PERMISSION.REPORTS_EXPORT,
      PERMISSION.DUTY_READ,
    ],
    schoolScoped: true,
  },
  {
    key: ROLE.EMPLOYEE,
    nameUz: "Xodim",
    description: "Faqat o‘ziga ruxsat berilgan bo‘limlarni ko‘radi.",
    permissions: [
      PERMISSION.CLASSES_READ,
      PERMISSION.STUDENTS_READ,
      PERMISSION.ATTENDANCE_READ,
      PERMISSION.DUTY_READ,
    ],
    schoolScoped: true,
  },
];

/** Roles a DIRECTOR may assign to an employee (never SUPER_ADMIN/DIRECTOR). */
export const ASSIGNABLE_ROLE_KEYS: RoleKey[] = [
  ROLE.DEPUTY_DIRECTOR,
  ROLE.TEACHER,
  ROLE.EMPLOYEE,
];

export function roleHasPermission(permissions: string[], permission: PermissionKey): boolean {
  return permissions.includes("*") || permissions.includes(permission);
}

export function isSuperAdmin(permissions: string[]): boolean {
  return permissions.includes("*");
}

// ---------------------------------------------------------------------------
// Attendance presentation
// ---------------------------------------------------------------------------

export const ATTENDANCE_STATUSES: AttendanceStatus[] = [
  "PRESENT",
  "ABSENT",
  "LATE",
  "EXCUSED",
];

export const ATTENDANCE_LABEL: Record<AttendanceStatus, string> = {
  PRESENT: "Keldi",
  ABSENT: "Kelmagan",
  LATE: "Kechikdi",
  EXCUSED: "Sababli kelmadi",
};

/** Short label for tables/chips. */
export const ATTENDANCE_SHORT_LABEL: Record<AttendanceStatus, string> = {
  PRESENT: "Keldi",
  ABSENT: "Kelmadi",
  LATE: "Kechikdi",
  EXCUSED: "Sababli",
};

/** Tailwind classes for status chips. */
export const ATTENDANCE_CHIP_CLASS: Record<AttendanceStatus, string> = {
  PRESENT:
    "bg-success/12 text-success ring-1 ring-inset ring-success/25 dark:bg-success/15",
  ABSENT:
    "bg-destructive/12 text-destructive ring-1 ring-inset ring-destructive/25 dark:bg-destructive/15",
  LATE: "bg-warning/15 text-warning-foreground ring-1 ring-inset ring-warning/30 dark:text-warning",
  EXCUSED: "bg-info/12 text-info ring-1 ring-inset ring-info/25 dark:bg-info/15",
};

export const ATTENDANCE_HEX: Record<AttendanceStatus, string> = {
  PRESENT: "#22a06b",
  ABSENT: "#e5484d",
  LATE: "#e8a33d",
  EXCUSED: "#3d8bdd",
};

export const SESSION_SLOTS: SessionSlot[] = ["FULL_DAY", "MORNING", "AFTERNOON"];

export const SESSION_SLOT_LABEL: Record<SessionSlot, string> = {
  FULL_DAY: "To‘liq kun",
  MORNING: "Birinchi smena",
  AFTERNOON: "Ikkinchi smena",
};

export const WEEKDAYS_UZ = [
  "Dushanba",
  "Seshanba",
  "Chorshanba",
  "Payshanba",
  "Juma",
  "Shanba",
  "Yakshanba",
] as const;

/** ISO weekday numbers (1 = Dushanba ... 7 = Yakshanba) with Uzbek labels. */
export const WEEKDAYS: { value: number; label: string; short: string }[] = [
  { value: 1, label: "Dushanba", short: "Du" },
  { value: 2, label: "Seshanba", short: "Se" },
  { value: 3, label: "Chorshanba", short: "Ch" },
  { value: 4, label: "Payshanba", short: "Pa" },
  { value: 5, label: "Juma", short: "Ju" },
  { value: 6, label: "Shanba", short: "Sh" },
  { value: 7, label: "Yakshanba", short: "Ya" },
];

export const WEEKDAY_LABEL: Record<number, string> = Object.fromEntries(
  WEEKDAYS.map((d) => [d.value, d.label]),
);

/** Default weekly schedule: Monday–Friday. */
export const DEFAULT_WORKING_DAYS = [1, 2, 3, 4, 5];

/** Convert a JS `Date` (date-only, UTC) to an ISO weekday number 1..7. */
export function isoWeekday(date: Date): number {
  const dow = date.getUTCDay(); // 0 = Sunday
  return dow === 0 ? 7 : dow;
}

// --------------------------------- Duty ------------------------------------

export const DUTY_PER_DAY_OPTIONS = [1, 2, 3] as const;

export const DUTY_STATUS_LABEL: Record<DutyAssignmentStatus, string> = {
  PLANNED: "Rejalashtirilgan",
  COMPLETED: "Bajarildi",
  REPLACED: "Almashtirildi",
  CANCELLED: "Bekor qilindi",
};

export const DUTY_STATUS_VARIANT: Record<
  DutyAssignmentStatus,
  "default" | "secondary" | "success" | "warning" | "destructive" | "info" | "outline"
> = {
  PLANNED: "info",
  COMPLETED: "success",
  REPLACED: "warning",
  CANCELLED: "destructive",
};

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

export const ACADEMIC_YEAR_DEFAULT = (() => {
  const now = new Date();
  const y = now.getUTCFullYear();
  // Uzbek academic year starts in September.
  return now.getUTCMonth() >= 8 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
})();

export const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2 MB
export const ACCEPTED_AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"];

export const PAGE_SIZES = [10, 20, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 20;
