/**
 * ---------------------------------------------------------------------------
 * DEVELOPMENT SEED
 * ---------------------------------------------------------------------------
 * IMPORTANT: every person in this file is FICTIONAL. Names are generic Uzbek
 * given names/surnames combined programmatically. No real school or student
 * personal data is used anywhere in this repository.
 *
 * The seed is idempotent: running it repeatedly produces the same dataset.
 * ---------------------------------------------------------------------------
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  AttendanceSessionStatus,
  AttendanceStatus,
  EnrollmentStatus,
  IntegrationProvider,
  PrismaClient,
  Role,
  StudentStatus,
} from "@prisma/client";

// --- load .env (prisma db seed runs in a child process) ---------------------
for (const file of [".env.local", ".env"]) {
  const full = path.join(process.cwd(), file);
  if (!existsSync(full)) continue;
  for (const rawLine of readFileSync(full, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// --- deterministic pseudo random -------------------------------------------
let seedState = 987654321;
function rnd(): number {
  seedState = (seedState * 1103515245 + 12345) % 2147483648;
  return seedState / 2147483648;
}
function pick<T>(items: readonly T[]): T {
  return items[Math.floor(rnd() * items.length)];
}
function randInt(min: number, max: number): number {
  return min + Math.floor(rnd() * (max - min + 1));
}

// --- fictional name pools ---------------------------------------------------
const MALE_NAMES = ["Ali", "Bekzod", "Davron", "Eldor", "Farrux", "G‘ayrat", "Hasan", "Islom", "Jasur", "Kamron", "Lutfulla", "Murod", "Nodir", "Otabek", "Rustam", "Sardor", "Temur", "Ulug‘bek", "Valijon", "Zafar"];
const FEMALE_NAMES = ["Aziza", "Dilnoza", "Fotima", "Gulnora", "Hilola", "Iroda", "Jasmina", "Kamola", "Latofat", "Madina", "Nilufar", "Oygul", "Robiya", "Sabina", "Tursunoy", "Umida", "Vasila", "Zarina", "Shahnoza", "Yulduz"];
const SURNAMES = ["Abdullayev", "Bekmurodov", "Davronov", "Ergashev", "Fayziyev", "G‘ulomov", "Hakimov", "Ismoilov", "Jo‘rayev", "Karimov", "Mahmudov", "Nazarov", "Olimov", "Rahimov", "Saidov", "Toshpo‘latov", "Usmonov", "Valiyev", "Yo‘ldoshev", "Zaripov"];

function dateOnlyUTC(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}
function addDays(value: Date, days: number): Date {
  return new Date(value.getTime() + days * 86_400_000);
}

const DEMO_PASSWORD = "Demo!2026";

type ClassSpec = {
  name: string;
  letter: string;
  gradeYear: number;
  /** Share of students marked PRESENT (drives the demo statistics). */
  quality: number;
  /** When < 1, only this share of students is recorded (demonstrates insufficient data). */
  coverage?: number;
};

const SCHOOLS: {
  code: string;
  name: string;
  region: string;
  district: string;
  director: { login: string; firstName: string; lastName: string; middleName: string };
  classes: ClassSpec[];
  studentsPerClass: number;
}[] = [
  {
    code: "DEMO-01",
    name: "1-son umumta’lim maktabi",
    region: "Toshkent shahri",
    district: "Chilonzor tumani",
    director: { login: "direktor1", firstName: "Aziz", lastName: "Rahimov", middleName: "Baxtiyorovich" },
    classes: [
      { name: "5-A", letter: "A", gradeYear: 5, quality: 0.97 },
      { name: "5-B", letter: "B", gradeYear: 5, quality: 0.92 },
      { name: "6-A", letter: "A", gradeYear: 6, quality: 0.9 },
      { name: "7-B", letter: "B", gradeYear: 7, quality: 0.88, coverage: 0.35 },
      { name: "8-A", letter: "A", gradeYear: 8, quality: 0.86 },
      { name: "9-B", letter: "B", gradeYear: 9, quality: 0.74 },
    ],
    studentsPerClass: 14,
  },
  {
    code: "DEMO-02",
    name: "14-son umumta’lim maktabi",
    region: "Toshkent shahri",
    district: "Yunusobod tumani",
    director: { login: "direktor2", firstName: "Malika", lastName: "Karimova", middleName: "Sherzodovna" },
    classes: [
      { name: "3-A", letter: "A", gradeYear: 3, quality: 0.94 },
      { name: "4-A", letter: "A", gradeYear: 4, quality: 0.9 },
      { name: "4-V", letter: "V", gradeYear: 4, quality: 0.83 },
    ],
    studentsPerClass: 12,
  },
];

const ROLE_SPECS = [
  {
    key: "SUPER_ADMIN",
    nameUz: "Bosh administrator",
    description: "Tizim egasi. Maktablar va direktorlarni boshqaradi.",
    permissions: ["*"],
    isSystem: true,
  },
  {
    key: "DIRECTOR",
    nameUz: "Direktor",
    description: "O‘z maktabi doirasida to‘liq boshqaruv.",
    permissions: [
      "employees:manage", "classes:read", "classes:manage", "students:read", "students:manage",
      "attendance:read", "attendance:write", "attendance:correct", "reports:read", "reports:export",
      "integration:read", "integration:manage", "duty:read", "duty:manage", "audit:read", "ai:use",
    ],
    isSystem: true,
  },
  {
    key: "DEPUTY_DIRECTOR",
    nameUz: "O‘quv ishlari bo‘yicha o‘rinbosar",
    description: "Davomat va hisobotlarni nazorat qiladi.",
    permissions: [
      "classes:read", "students:read", "attendance:read", "attendance:write", "attendance:correct",
      "reports:read", "reports:export", "integration:read", "duty:read", "duty:manage", "ai:use",
    ],
    isSystem: true,
  },
  {
    key: "TEACHER",
    nameUz: "Sinf rahbari / o‘qituvchi",
    description: "O‘ziga biriktirilgan sinflarda davomat yuritadi.",
    permissions: ["classes:read", "students:read", "attendance:read", "attendance:write", "reports:read", "reports:export", "duty:read", "ai:use"],
    isSystem: true,
  },
  {
    key: "EMPLOYEE",
    nameUz: "Xodim",
    description: "Faqat o‘ziga ruxsat berilgan bo‘limlarni ko‘radi.",
    permissions: ["classes:read", "students:read", "attendance:read", "duty:read"],
    isSystem: true,
  },
];

async function main() {
  console.log("→ Seed boshlanmoqda...");

  // 1. Roles -----------------------------------------------------------------
  const roles = new Map<string, Role>();
  for (const spec of ROLE_SPECS) {
    const role = await prisma.role.upsert({
      where: { key: spec.key },
      update: { nameUz: spec.nameUz, description: spec.description, permissions: spec.permissions },
      create: spec,
    });
    roles.set(spec.key, role);
  }
  console.log(`  ✓ Rollar: ${roles.size}`);

  // 2. Super admin -----------------------------------------------------------
  const adminLogin = process.env.SEED_SUPERADMIN_LOGIN || "superadmin";
  const adminPassword = process.env.SEED_SUPERADMIN_PASSWORD || "ChangeMe!2026";
  const superAdmin = await prisma.user.upsert({
    where: { login: adminLogin },
    update: { roleId: roles.get("SUPER_ADMIN")!.id },
    create: {
      login: adminLogin,
      passwordHash: await bcrypt.hash(adminPassword, 12),
      firstName: "Bosh",
      lastName: "Administrator",
      roleId: roles.get("SUPER_ADMIN")!.id,
      isActive: true,
      preference: { create: { theme: "SYSTEM", locale: "uz-Latn" } },
    },
  });
  console.log(`  ✓ Bosh administrator: ${adminLogin}`);

  const academicYear = "2025-2026";
  const yearStart = new Date(Date.UTC(2025, 8, 2)); // 2-sentabr
  const demoHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  // 3. Schools, directors, employees, classes, students, attendance ----------
  for (const spec of SCHOOLS) {
    const school = await prisma.school.upsert({
      where: { code: spec.code },
      update: { name: spec.name, region: spec.region, district: spec.district },
      create: {
        code: spec.code,
        name: spec.name,
        region: spec.region,
        district: spec.district,
        address: `${spec.district}, Maktab ko‘chasi ${randInt(1, 40)}`,
        phone: `+998 71 ${randInt(200, 299)}-${randInt(10, 99)}-${randInt(10, 99)}`,
      },
    });

    // Director
    const director = await prisma.user.upsert({
      where: { login: spec.director.login },
      update: { schoolId: school.id, roleId: roles.get("DIRECTOR")!.id },
      create: {
        login: spec.director.login,
        passwordHash: demoHash,
        firstName: spec.director.firstName,
        lastName: spec.director.lastName,
        middleName: spec.director.middleName,
        roleId: roles.get("DIRECTOR")!.id,
        schoolId: school.id,
        mustChangePassword: true,
        preference: { create: { theme: "SYSTEM", locale: "uz-Latn" } },
      },
    });

    // Employees
    const employeeSpecs = [
      { login: `orinbosar-${spec.code.toLowerCase()}`, role: "DEPUTY_DIRECTOR", position: "O‘quv ishlari bo‘yicha o‘rinbosar", gender: "female" as const },
      { login: `oqituvchi-${spec.code.toLowerCase()}`, role: "TEACHER", position: "Sinf rahbari", gender: "male" as const },
      { login: `xodim-${spec.code.toLowerCase()}`, role: "EMPLOYEE", position: "Kotib", gender: "female" as const },
    ];
    const employees = [];
    for (const es of employeeSpecs) {
      const firstName = es.gender === "female" ? pick(FEMALE_NAMES) : pick(MALE_NAMES);
      const user = await prisma.user.upsert({
        where: { login: es.login },
        update: { schoolId: school.id, roleId: roles.get(es.role)!.id },
        create: {
          login: es.login,
          passwordHash: demoHash,
          firstName,
          lastName: pick(SURNAMES),
          middleName: es.gender === "male" ? `${pick(MALE_NAMES)} o‘g‘li` : `${pick(MALE_NAMES)} qizi`,
          roleId: roles.get(es.role)!.id,
          schoolId: school.id,
          mustChangePassword: true,
          preference: { create: { theme: "SYSTEM", locale: "uz-Latn" } },
        },
      });
      await prisma.employeeProfile.upsert({
        where: { userId: user.id },
        update: { position: es.position, schoolId: school.id },
        create: { userId: user.id, schoolId: school.id, position: es.position, hiredAt: new Date(Date.UTC(2020, 0, 15)) },
      });
      employees.push(user);
    }
    const teacher = employees.find((e) => e.login.startsWith("oqituvchi")) ?? director;

    // Classes + students + enrollments + attendance
    let classCount = 0;
    let studentCount = 0;
    let recordCount = 0;

    for (const classSpec of spec.classes) {
      // Individual class schedule: lower grades study Monday–Friday, upper
      // grades Monday–Saturday. This is a demo default; a director can change it
      // per class at any time (and the change is versioned by effective date).
      const workingDays = classSpec.gradeYear <= 4 ? [1, 2, 3, 4, 5] : [1, 2, 3, 4, 5, 6];

      const schoolClass = await prisma.schoolClass.upsert({
        where: { schoolId_name_academicYear: { schoolId: school.id, name: classSpec.name, academicYear } },
        update: { gradeYear: classSpec.gradeYear, letter: classSpec.letter, teacherId: teacher.id, workingDays },
        create: {
          schoolId: school.id,
          name: classSpec.name,
          letter: classSpec.letter,
          gradeYear: classSpec.gradeYear,
          academicYear,
          capacity: 35,
          teacherId: teacher.id,
          workingDays,
        },
      });
      classCount++;

      const existingSchedule = await prisma.classSchedule.findFirst({
        where: { classId: schoolClass.id, effectiveFrom: yearStart },
        select: { id: true },
      });
      if (!existingSchedule) {
        await prisma.classSchedule.create({
          data: {
            schoolId: school.id,
            classId: schoolClass.id,
            effectiveFrom: yearStart,
            weekdays: workingDays,
            note: "Boshlang‘ich jadval",
            createdById: teacher.id,
          },
        });
      }

      for (let i = 0; i < spec.studentsPerClass; i++) {
        const isMale = rnd() > 0.5;
        const externalId = `${spec.code}-${classSpec.name}-${String(i + 1).padStart(3, "0")}`;
        const student = await prisma.student.upsert({
          where: { schoolId_externalId: { schoolId: school.id, externalId } },
          update: {},
          create: {
            schoolId: school.id,
            firstName: isMale ? pick(MALE_NAMES) : pick(FEMALE_NAMES),
            lastName: pick(SURNAMES),
            middleName: isMale ? `${pick(MALE_NAMES)} o‘g‘li` : `${pick(MALE_NAMES)} qizi`,
            externalId,
            gender: isMale ? "MALE" : "FEMALE",
            birthDate: new Date(Date.UTC(2025 - classSpec.gradeYear - 6, randInt(0, 11), randInt(1, 28))),
            status: StudentStatus.ACTIVE,
            guardianPhone: `+998 9${randInt(0, 9)} ${randInt(100, 999)}-${randInt(10, 99)}-${randInt(10, 99)}`,
          },
        });
        studentCount++;

        await prisma.enrollment.upsert({
          where: { studentId_classId_academicYear: { studentId: student.id, classId: schoolClass.id, academicYear } },
          update: {},
          create: {
            schoolId: school.id,
            studentId: student.id,
            classId: schoolClass.id,
            academicYear,
            status: EnrollmentStatus.ACTIVE,
            startDate: yearStart,
          },
        });
      }

      // Attendance for the most recent 14 calendar days (weekdays only, not future)
      const todayUtc = dateOnlyUTC(new Date());
      const enrollments = await prisma.enrollment.findMany({
        where: { classId: schoolClass.id, academicYear, isActive: true },
        select: { id: true, studentId: true },
      });
      const coverage = classSpec.coverage ?? 1;

      for (let back = 13; back >= 0; back--) {
        const day = addDays(todayUtc, -back);
        const dow = day.getUTCDay();
        if (dow === 0 || dow === 6) continue; // weekend

        const session = await prisma.attendanceSession.upsert({
          where: { classId_date_slot: { classId: schoolClass.id, date: day, slot: "FULL_DAY" } },
          update: {},
          create: {
            schoolId: school.id,
            classId: schoolClass.id,
            date: day,
            slot: "FULL_DAY",
            status: AttendanceSessionStatus.SUBMITTED,
            recordedById: teacher.id,
            submittedAt: day,
          },
        });

        const toRecord = Math.max(1, Math.round(enrollments.length * coverage));
        for (let e = 0; e < enrollments.length; e++) {
          if (e >= toRecord) break; // leave some students unrecorded when coverage < 1
          const enrollment = enrollments[e];
          const roll = rnd();
          let status: AttendanceStatus;
          if (roll < classSpec.quality) status = AttendanceStatus.PRESENT;
          else if (roll < classSpec.quality + 0.05) status = AttendanceStatus.LATE;
          else if (roll < classSpec.quality + 0.09) status = AttendanceStatus.EXCUSED;
          else status = AttendanceStatus.ABSENT;

          await prisma.attendanceRecord.upsert({
            where: { sessionId_studentId: { sessionId: session.id, studentId: enrollment.studentId } },
            update: {},
            create: {
              schoolId: school.id,
              sessionId: session.id,
              studentId: enrollment.studentId,
              enrollmentId: enrollment.id,
              status,
              reason: status === AttendanceStatus.EXCUSED ? "Oilaviy sabab" : null,
              recordedById: teacher.id,
            },
          });
          recordCount++;
        }
      }
    }

    // School calendar: mark two recent dates as non-working days
    for (const offset of [3, 8]) {
      const day = addDays(dateOnlyUTC(new Date()), -offset);
      await prisma.schoolCalendar.upsert({
        where: { schoolId_date: { schoolId: school.id, date: day } },
        update: {},
        create: { schoolId: school.id, date: day, isWorkingDay: false, note: "Bayram kuni", academicYear },
      });
    }

    // Duty (navbatchilik): settings, eligible teachers and a round-robin plan
    // for the coming weeks. Duty days are independent from class study days.
    const todaySeed = dateOnlyUTC(new Date());
    const dutySettings = await prisma.dutySettings.upsert({
      where: { schoolId: school.id },
      update: {},
      create: {
        schoolId: school.id,
        title: "Navbatchilik",
        perDay: 1,
        weekdays: [1, 2, 3, 4, 5, 6],
        avoidConsecutive: true,
        isActive: true,
        startDate: todaySeed,
        endDate: addDays(todaySeed, 120),
        createdById: director.id,
      },
    });

    // The plain "xodim" is intentionally left out to show eligibility control.
    const dutyTeachers = employees.filter((e) => !e.login.startsWith("xodim"));
    for (const member of dutyTeachers) {
      await prisma.dutyTeacherEligibility.upsert({
        where: {
          dutySettingsId_teacherId: { dutySettingsId: dutySettings.id, teacherId: member.id },
        },
        update: {},
        create: {
          schoolId: school.id,
          dutySettingsId: dutySettings.id,
          teacherId: member.id,
          isEligible: true,
        },
      });
    }

    let dutyIndex = 0;
    let dutyCount = 0;
    for (let forward = 1; forward <= 21 && dutyTeachers.length > 0; forward++) {
      const day = addDays(todaySeed, forward);
      if (day.getUTCDay() === 0) continue; // Sunday is not a duty day
      const member = dutyTeachers[dutyIndex % dutyTeachers.length];
      dutyIndex++;
      const existing = await prisma.dutyAssignment.findFirst({
        where: { dutySettingsId: dutySettings.id, date: day, teacherId: member.id },
        select: { id: true },
      });
      if (existing) continue;
      await prisma.dutyAssignment.create({
        data: {
          schoolId: school.id,
          dutySettingsId: dutySettings.id,
          date: day,
          teacherId: member.id,
          slotIndex: 0,
          status: "PLANNED",
          createdById: director.id,
        },
      });
      dutyCount++;
    }

    // An integration config row that is NOT connected. No sync has ever run, so
    // the UI shows the setup state rather than fabricated results.
    await prisma.integrationConfig.upsert({
      where: { id: `demo-csv-${school.id}` },
      update: {},
      create: {
        id: `demo-csv-${school.id}`,
        schoolId: school.id,
        provider: IntegrationProvider.CSV_EXCEL,
        name: "eMaktab CSV/Excel import",
        isEnabled: false,
        credentialHint: null,
        createdById: director.id,
        settings: {},
      },
    });

    console.log(
      `  ✓ ${school.name}: ${classCount} sinf, ${studentCount} o‘quvchi, ${recordCount} davomat yozuvi, ${dutyCount} navbatchilik`,
    );
  }

  console.log("\n✅ Seed tugadi.\n");
  console.log("   Kirish ma’lumotlari (FAQAT ishlab chiqish uchun):");
  console.log(`   • Bosh administrator : ${adminLogin} / ${adminPassword}`);
  for (const spec of SCHOOLS) {
    console.log(`   • Direktor (${spec.name}): ${spec.director.login} / ${DEMO_PASSWORD}`);
    console.log(`   • Xodimlar (${spec.name}): orinbosar-${spec.code.toLowerCase()}, oqituvchi-${spec.code.toLowerCase()}, xodim-${spec.code.toLowerCase()} / ${DEMO_PASSWORD}`);
  }
  console.log("\n   ⚠️  Ishlab chiqarishga chiqarishdan oldin barcha demo parollarni almashtiring.\n");

  void superAdmin;
}

main()
  .catch((error) => {
    console.error("Seed xatosi:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
