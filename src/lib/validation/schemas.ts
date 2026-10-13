import { z } from "zod";
import { ASSIGNABLE_ROLE_KEYS, ROLE } from "@/lib/constants";

// ---------------------------------------------------------------------------
// Reusable primitives
// ---------------------------------------------------------------------------

const loginField = z
  .string()
  .trim()
  .min(3, "Login kamida 3 belgidan iborat bo‘lishi kerak")
  .max(50, "Login 50 belgidan oshmasligi kerak")
  .regex(/^[a-zA-Z0-9._-]+$/, "Login faqat harf, raqam, nuqta, tire va pastki chiziqdan iborat bo‘lsin");

const nameField = z
  .string()
  .trim()
  .min(2, "Kamida 2 belgi kiriting")
  .max(60, "60 belgidan oshmasligi kerak");

const optionalName = z
  .string()
  .trim()
  .max(60, "60 belgidan oshmasligi kerak")
  .optional()
  .or(z.literal("").transform(() => undefined));

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `${max} belgidan oshmasligi kerak`)
    .optional()
    .or(z.literal("").transform(() => undefined));

const phoneField = z
  .string()
  .trim()
  .max(30, "Telefon raqami juda uzun")
  .regex(/^[+0-9()\s-]*$/, "Telefon raqami noto‘g‘ri")
  .optional()
  .or(z.literal("").transform(() => undefined));

const passwordField = z
  .string()
  .min(8, "Parol kamida 8 belgidan iborat bo‘lishi kerak")
  .max(128, "Parol juda uzun");

const dateOnlyField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Sana YYYY-MM-DD ko‘rinishida bo‘lishi kerak");

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const loginSchema = z.object({
  login: z.string().trim().min(1, "Loginni kiriting"),
  password: z.string().min(1, "Parolni kiriting"),
  remember: z.boolean().optional().default(false),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Joriy parolni kiriting"),
    newPassword: passwordField,
    confirmPassword: z.string().min(1, "Parolni tasdiqlang"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Parollar mos kelmadi",
    path: ["confirmPassword"],
  })
  .refine((data) => data.newPassword !== data.currentPassword, {
    message: "Yangi parol joriy paroldan farq qilishi kerak",
    path: ["newPassword"],
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const profileSchema = z.object({
  firstName: nameField,
  lastName: nameField,
  middleName: optionalName,
  login: loginField,
  phone: phoneField,
});
export type ProfileInput = z.infer<typeof profileSchema>;

export const themeSchema = z.object({
  theme: z.enum(["LIGHT", "DARK", "SYSTEM"]),
  sidebarCollapsed: z.boolean().optional(),
  attendanceSlot: z.enum(["FULL_DAY", "MORNING", "AFTERNOON"]).optional(),
});

// ---------------------------------------------------------------------------
// Schools & directors (Super Admin)
// ---------------------------------------------------------------------------

export const schoolSchema = z.object({
  id: z.string().optional(),
  code: z
    .string()
    .trim()
    .min(2, "Maktab kodi kamida 2 belgi")
    .max(30, "Maktab kodi juda uzun")
    .regex(/^[A-Za-z0-9._-]+$/, "Kod faqat harf, raqam, nuqta, tire va pastki chiziqdan iborat bo‘lsin"),
  name: nameField,
  region: optionalText(80),
  district: optionalText(80),
  address: optionalText(160),
  phone: phoneField,
  email: z
    .string()
    .trim()
    .max(120)
    .email("Email manzil noto‘g‘ri")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  isActive: z.boolean().optional().default(true),
});
export type SchoolInput = z.infer<typeof schoolSchema>;

export const directorSchema = z.object({
  id: z.string().optional(),
  firstName: nameField,
  lastName: nameField,
  middleName: optionalName,
  login: loginField,
  phone: phoneField,
  schoolId: z.string().min(1, "Maktabni tanlang"),
  password: z.union([passwordField, z.literal("")]).optional(),
  isActive: z.boolean().optional().default(true),
});
export type DirectorInput = z.infer<typeof directorSchema>;

export const resetPasswordSchema = z.object({
  userId: z.string().min(1),
  password: passwordField,
});

// ---------------------------------------------------------------------------
// Employees (Director)
// ---------------------------------------------------------------------------

export const employeeSchema = z.object({
  id: z.string().optional(),
  firstName: nameField,
  lastName: nameField,
  middleName: optionalName,
  login: loginField,
  phone: phoneField,
  roleKey: z.enum(["DEPUTY_DIRECTOR", "TEACHER", "EMPLOYEE"], {
    message: "Rolni tanlang",
  }),
  position: optionalText(80),
  password: z.union([passwordField, z.literal("")]).optional(),
  isActive: z.boolean().optional().default(true),
});
export type EmployeeInput = z.infer<typeof employeeSchema>;

export const assignableRoles = ASSIGNABLE_ROLE_KEYS;

// ---------------------------------------------------------------------------
// Classes
// ---------------------------------------------------------------------------

export const classSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Sinf nomini kiriting").max(30),
  letter: optionalText(5),
  gradeYear: z.coerce
    .number({ message: "Sinf raqamini kiriting" })
    .int("Butun son bo‘lishi kerak")
    .min(1, "1 dan kichik bo‘lmasin")
    .max(11, "11 dan katta bo‘lmasin"),
  academicYear: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{4}$/, "O‘quv yili 2025-2026 ko‘rinishida bo‘lishi kerak"),
  capacity: z.coerce.number().int().min(1).max(60).optional(),
  teacherId: optionalText(60),
  weekdays: z
    .array(z.number().int().min(1).max(7))
    .min(1, "Kamida bitta o‘qish kuni tanlang")
    .max(7)
    .optional(),
  isActive: z.boolean().optional().default(true),
});
export type ClassInput = z.infer<typeof classSchema>;

// ---------------------------------------------------------------------------
// Students
// ---------------------------------------------------------------------------

export const studentSchema = z.object({
  id: z.string().optional(),
  firstName: nameField,
  lastName: nameField,
  middleName: optionalName,
  externalId: z
    .string()
    .trim()
    .max(60, "Tashqi ID juda uzun")
    .regex(/^[A-Za-z0-9._-]*$/, "Tashqi ID faqat harf, raqam, nuqta, tire va pastki chiziqdan iborat bo‘lsin")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  birthDate: dateOnlyField.optional().or(z.literal("").transform(() => undefined)),
  gender: z.enum(["MALE", "FEMALE"]).optional(),
  status: z.enum(["ACTIVE", "TRANSFERRED", "GRADUATED", "INACTIVE"]).optional().default("ACTIVE"),
  guardianName: optionalText(80),
  guardianPhone: phoneField,
  note: optionalText(300),
  classId: optionalText(60),
  isActive: z.boolean().optional().default(true),
});
export type StudentInput = z.infer<typeof studentSchema>;

export const enrollStudentSchema = z.object({
  studentId: z.string().min(1),
  classId: z.string().min(1, "Sinfni tanlang"),
  academicYear: z.string().trim().regex(/^\d{4}-\d{4}$/, "O‘quv yili noto‘g‘ri"),
  startDate: dateOnlyField,
});

// ---------------------------------------------------------------------------
// Attendance
// ---------------------------------------------------------------------------

export const attendanceEntrySchema = z.object({
  studentId: z.string().min(1),
  enrollmentId: z.string().optional(),
  status: z.enum(["PRESENT", "ABSENT", "LATE", "EXCUSED"]),
  reason: optionalText(160),
  note: optionalText(200),
});

export const saveAttendanceSchema = z.object({
  classId: z.string().min(1, "Sinfni tanlang"),
  date: dateOnlyField,
  slot: z.enum(["FULL_DAY", "MORNING", "AFTERNOON"]).default("FULL_DAY"),
  entries: z.array(attendanceEntrySchema).min(1, "Kamida bitta yozuv bo‘lishi kerak"),
  submit: z.boolean().optional().default(true),
});
export type SaveAttendanceInput = z.infer<typeof saveAttendanceSchema>;

// ---------------------------------------------------------------------------
// Integration
// ---------------------------------------------------------------------------

export const csvIntegrationSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2, "Nom kiriting").max(80),
  isEnabled: z.boolean().default(true),
  settings: z
    .object({
      delimiter: z.enum([",", ";", "\t"]).default(","),
      hasHeader: z.boolean().default(true),
      defaultAcademicYear: z
        .string()
        .trim()
        .regex(/^\d{4}-\d{4}$/, "O‘quv yili 2025-2026 ko‘rinishida bo‘lishi kerak"),
    })
    .default({ delimiter: ",", hasHeader: true, defaultAcademicYear: "2025-2026" }),
});

export const apiIntegrationSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2, "Nom kiriting").max(80),
  isEnabled: z.boolean().default(true),
  baseUrl: z.string().trim().url("API manzili (URL) noto‘g‘ri"),
  endpointPath: optionalText(200),
  login: z.string().trim().min(1, "Login kiriting").max(120),
  secret: z
    .string()
    .max(400, "Maxfiy kalit juda uzun")
    .optional()
    .or(z.literal("").transform(() => undefined)),
});
export type ApiIntegrationInput = z.infer<typeof apiIntegrationSchema>;

export const reviewResolveSchema = z.object({
  reviewId: z.string().min(1),
  action: z.enum(["CREATE_NEW", "LINK_EXISTING", "IGNORE"]),
  studentId: optionalText(60),
});

// ---------------------------------------------------------------------------
// School calendar
// ---------------------------------------------------------------------------

export const calendarDaySchema = z.object({
  date: dateOnlyField,
  isWorkingDay: z.boolean(),
  note: optionalText(120),
  academicYear: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{4}$/, "O‘quv yili 2025-2026 ko‘rinishida bo‘lishi kerak")
    .optional()
    .or(z.literal("").transform(() => undefined)),
});
export type CalendarDayInput = z.infer<typeof calendarDaySchema>;

// ---------------------------------------------------------------------------
// Filters / pagination (search params)
// ---------------------------------------------------------------------------

export const listQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(20),
  sort: z.string().trim().max(40).optional(),
  dir: z.enum(["asc", "desc"]).default("asc"),
});
export type ListQuery = z.infer<typeof listQuerySchema>;

export const ROLE_KEYS = [
  ROLE.SUPER_ADMIN,
  ROLE.DIRECTOR,
  ROLE.DEPUTY_DIRECTOR,
  ROLE.TEACHER,
  ROLE.EMPLOYEE,
] as const;

// ---------------------------------------------------------------------------
// Class schedule (individual study days)
// ---------------------------------------------------------------------------

const weekdayArray = z
  .array(z.number().int().min(1).max(7))
  .min(1, "Kamida bitta kun tanlang")
  .max(7)
  .transform((days) => [...new Set(days)].sort((a, b) => a - b));

export const classScheduleSchema = z.object({
  classId: z.string().min(1, "Sinfni tanlang"),
  weekdays: weekdayArray,
  effectiveFrom: dateOnlyField,
  note: optionalText(160),
});
export type ClassScheduleInput = z.infer<typeof classScheduleSchema>;

// ---------------------------------------------------------------------------
// Duty (navbatchilik)
// ---------------------------------------------------------------------------

const optionalDateOnly = dateOnlyField.optional().or(z.literal("").transform(() => undefined));

export const dutySettingsSchema = z.object({
  title: z.string().trim().min(2, "Nom kiriting").max(80).default("Navbatchilik"),
  startDate: optionalDateOnly,
  endDate: optionalDateOnly,
  perDay: z.coerce.number().int().min(1, "Kamida 1").max(3, "Ko‘pi bilan 3").default(1),
  weekdays: weekdayArray,
  avoidConsecutive: z.boolean().default(true),
  isActive: z.boolean().default(true),
  eligibility: z
    .array(
      z.object({
        teacherId: z.string().min(1),
        isEligible: z.boolean().default(true),
        unavailableFrom: optionalDateOnly,
        unavailableTo: optionalDateOnly,
        note: optionalText(160),
      }),
    )
    .default([]),
});
export type DutySettingsInput = z.infer<typeof dutySettingsSchema>;

export const dutyGenerateSchema = z.object({
  from: dateOnlyField,
  to: dateOnlyField,
  replaceExisting: z.boolean().default(false),
});
export type DutyGenerateInput = z.infer<typeof dutyGenerateSchema>;

export const dutyAssignSchema = z.object({
  date: dateOnlyField,
  teacherIds: z.array(z.string().min(1)).min(1, "Kamida bitta o‘qituvchi tanlang").max(3),
  note: optionalText(160),
});
export type DutyAssignInput = z.infer<typeof dutyAssignSchema>;

export const dutyReplaceSchema = z.object({
  assignmentId: z.string().min(1),
  teacherId: z.string().min(1, "Yangi o‘qituvchini tanlang"),
  reason: z.string().trim().min(2, "Sababni kiriting").max(200),
});
export type DutyReplaceInput = z.infer<typeof dutyReplaceSchema>;

export const dutyReasonSchema = z.object({
  assignmentId: z.string().min(1),
  reason: z.string().trim().min(2, "Sababni kiriting").max(200),
});
export type DutyReasonInput = z.infer<typeof dutyReasonSchema>;

export const dutyStatusSchema = z.object({
  assignmentId: z.string().min(1),
  status: z.enum(["PLANNED", "COMPLETED"]),
});
export type DutyStatusInput = z.infer<typeof dutyStatusSchema>;
