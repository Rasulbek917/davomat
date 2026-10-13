-- CreateEnum
CREATE TYPE "DutyAssignmentStatus" AS ENUM ('PLANNED', 'COMPLETED', 'REPLACED', 'CANCELLED');

-- AlterTable
ALTER TABLE "classes" ADD COLUMN     "workingDays" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5]::INTEGER[];

-- CreateTable
CREATE TABLE "class_schedules" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "weekdays" INTEGER[],
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "class_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "duty_settings" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Navbatchilik',
    "startDate" DATE,
    "endDate" DATE,
    "perDay" INTEGER NOT NULL DEFAULT 1,
    "weekdays" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5, 6]::INTEGER[],
    "avoidConsecutive" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "duty_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "duty_teacher_eligibility" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "dutySettingsId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "isEligible" BOOLEAN NOT NULL DEFAULT true,
    "unavailableFrom" DATE,
    "unavailableTo" DATE,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "duty_teacher_eligibility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "duty_assignments" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "dutySettingsId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "teacherId" TEXT NOT NULL,
    "slotIndex" INTEGER NOT NULL DEFAULT 0,
    "status" "DutyAssignmentStatus" NOT NULL DEFAULT 'PLANNED',
    "originalTeacherId" TEXT,
    "note" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "duty_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "duty_changes" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "changedById" TEXT,
    "action" TEXT NOT NULL,
    "fromTeacherId" TEXT,
    "toTeacherId" TEXT,
    "fromStatus" "DutyAssignmentStatus",
    "toStatus" "DutyAssignmentStatus",
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "duty_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "class_schedules_classId_effectiveFrom_idx" ON "class_schedules"("classId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "class_schedules_schoolId_effectiveFrom_idx" ON "class_schedules"("schoolId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "duty_settings_schoolId_key" ON "duty_settings"("schoolId");

-- CreateIndex
CREATE INDEX "duty_teacher_eligibility_schoolId_idx" ON "duty_teacher_eligibility"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "duty_teacher_eligibility_dutySettingsId_teacherId_key" ON "duty_teacher_eligibility"("dutySettingsId", "teacherId");

-- CreateIndex
CREATE INDEX "duty_assignments_schoolId_date_idx" ON "duty_assignments"("schoolId", "date");

-- CreateIndex
CREATE INDEX "duty_assignments_teacherId_date_idx" ON "duty_assignments"("teacherId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "duty_assignments_dutySettingsId_date_teacherId_key" ON "duty_assignments"("dutySettingsId", "date", "teacherId");

-- CreateIndex
CREATE INDEX "duty_changes_assignmentId_idx" ON "duty_changes"("assignmentId");

-- CreateIndex
CREATE INDEX "duty_changes_schoolId_createdAt_idx" ON "duty_changes"("schoolId", "createdAt");

-- AddForeignKey
ALTER TABLE "class_schedules" ADD CONSTRAINT "class_schedules_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_schedules" ADD CONSTRAINT "class_schedules_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_schedules" ADD CONSTRAINT "class_schedules_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duty_settings" ADD CONSTRAINT "duty_settings_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duty_settings" ADD CONSTRAINT "duty_settings_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duty_teacher_eligibility" ADD CONSTRAINT "duty_teacher_eligibility_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duty_teacher_eligibility" ADD CONSTRAINT "duty_teacher_eligibility_dutySettingsId_fkey" FOREIGN KEY ("dutySettingsId") REFERENCES "duty_settings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duty_teacher_eligibility" ADD CONSTRAINT "duty_teacher_eligibility_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duty_assignments" ADD CONSTRAINT "duty_assignments_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duty_assignments" ADD CONSTRAINT "duty_assignments_dutySettingsId_fkey" FOREIGN KEY ("dutySettingsId") REFERENCES "duty_settings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duty_assignments" ADD CONSTRAINT "duty_assignments_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duty_assignments" ADD CONSTRAINT "duty_assignments_originalTeacherId_fkey" FOREIGN KEY ("originalTeacherId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duty_assignments" ADD CONSTRAINT "duty_assignments_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duty_assignments" ADD CONSTRAINT "duty_assignments_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duty_changes" ADD CONSTRAINT "duty_changes_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duty_changes" ADD CONSTRAINT "duty_changes_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "duty_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duty_changes" ADD CONSTRAINT "duty_changes_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
