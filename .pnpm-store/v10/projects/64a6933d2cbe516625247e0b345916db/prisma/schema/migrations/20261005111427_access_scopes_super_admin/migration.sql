-- Super admin role and department-scoped role grants (docs/decisions BE-003).
-- Hand-trimmed: the generated diff also dropped the custom foreign keys created from prisma/sql in the initial
-- migration (they are not expressible in the Prisma schema); those constraints must stay.

-- AlterEnum
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'super_admin';

-- CreateTable
CREATE TABLE "role_scopes" (
    "employee_id" VARCHAR(32) NOT NULL,
    "role" "Role" NOT NULL,
    "department_id" VARCHAR(60) NOT NULL,

    CONSTRAINT "role_scopes_pkey" PRIMARY KEY ("employee_id","role","department_id")
);

-- CreateIndex
CREATE INDEX "role_scopes_department_id_idx" ON "role_scopes"("department_id");

-- AddForeignKey
ALTER TABLE "role_scopes" ADD CONSTRAINT "role_scopes_employee_id_role_fkey" FOREIGN KEY ("employee_id", "role") REFERENCES "role_assignments"("employee_id", "role") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_scopes" ADD CONSTRAINT "role_scopes_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
