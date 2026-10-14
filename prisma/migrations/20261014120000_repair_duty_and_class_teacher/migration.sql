-- Repair drift between the migrations and prisma/schema.prisma:
--   * the duty eligibility table was created with the singular name while the
--     schema maps the model to the plural `duty_teacher_eligibilities`
--   * the `class_teacher_assignments` table (class-teacher feature) had no
--     migration at all
--
-- This runs after `20261012144249_class_schedules_and_duty`, which created the
-- singular table, so dropping it here is deterministic on every database.

DROP TABLE "duty_teacher_eligibility";

CREATE TABLE "duty_teacher_eligibilities" (
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

    CONSTRAINT "duty_teacher_eligibilities_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "class_teacher_assignments" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "assignedById" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "endReason" TEXT,

    CONSTRAINT "class_teacher_assignments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "duty_teacher_eligibilities_schoolId_idx" ON "duty_teacher_eligibilities"("schoolId");
CREATE INDEX "duty_teacher_eligibilities_teacherId_idx" ON "duty_teacher_eligibilities"("teacherId");
CREATE UNIQUE INDEX "duty_teacher_eligibilities_dutySettingsId_teacherId_key" ON "duty_teacher_eligibilities"("dutySettingsId", "teacherId");
CREATE INDEX "class_teacher_assignments_schoolId_idx" ON "class_teacher_assignments"("schoolId");
CREATE INDEX "class_teacher_assignments_classId_idx" ON "class_teacher_assignments"("classId");
CREATE INDEX "class_teacher_assignments_teacherId_idx" ON "class_teacher_assignments"("teacherId");
CREATE INDEX "class_teacher_assignments_assignedAt_idx" ON "class_teacher_assignments"("assignedAt");

ALTER TABLE "duty_teacher_eligibilities" ADD CONSTRAINT "duty_teacher_eligibilities_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "duty_teacher_eligibilities" ADD CONSTRAINT "duty_teacher_eligibilities_dutySettingsId_fkey" FOREIGN KEY ("dutySettingsId") REFERENCES "duty_settings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "duty_teacher_eligibilities" ADD CONSTRAINT "duty_teacher_eligibilities_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "class_teacher_assignments" ADD CONSTRAINT "class_teacher_assignments_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "class_teacher_assignments" ADD CONSTRAINT "class_teacher_assignments_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "class_teacher_assignments" ADD CONSTRAINT "class_teacher_assignments_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "class_teacher_assignments" ADD CONSTRAINT "class_teacher_assignments_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
