-- Complete standalone backend baseline.
BEGIN;
-- CreateEnum
CREATE TYPE "EmploymentStatus" AS ENUM ('onboarding', 'active', 'on_leave', 'notice', 'exited');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('full_time', 'contract', 'intern');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('employee', 'manager', 'hr_operator', 'payroll_operator', 'payroll_approver');

-- CreateEnum
CREATE TYPE "MailStatus" AS ENUM ('queued', 'sent', 'failed');

-- CreateTable
CREATE TABLE "organization" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "name" VARCHAR(120) NOT NULL,
    "timezone" VARCHAR(60) NOT NULL DEFAULT 'Asia/Kolkata',
    "currency" VARCHAR(3) NOT NULL DEFAULT 'INR',
    "legal_entity" VARCHAR(160) NOT NULL,
    "pay_group" VARCHAR(120) NOT NULL,
    "email_domain" VARCHAR(120) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_settings" (
    "key" VARCHAR(100) NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "organization_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" VARCHAR(60) NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "cost_center" VARCHAR(80),
    "head_employee_id" VARCHAR(32),
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "locations" (
    "id" VARCHAR(60) NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "state" VARCHAR(80),
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" VARCHAR(32) NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "work_email" VARCHAR(254) NOT NULL,
    "designation" VARCHAR(80) NOT NULL,
    "department_id" VARCHAR(60) NOT NULL,
    "location_id" VARCHAR(60) NOT NULL,
    "manager_id" VARCHAR(32),
    "joined_on" DATE NOT NULL,
    "exited_on" DATE,
    "status" "EmploymentStatus" NOT NULL DEFAULT 'onboarding',
    "employment_type" "EmploymentType" NOT NULL,
    "photo_version" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_accounts" (
    "employee_id" VARCHAR(32) NOT NULL,
    "disabled_at" TIMESTAMPTZ(6),
    "last_sign_in_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_accounts_pkey" PRIMARY KEY ("employee_id")
);

-- CreateTable
CREATE TABLE "password_credentials" (
    "employee_id" VARCHAR(32) NOT NULL,
    "password_hash" VARCHAR(100) NOT NULL,
    "password_changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "failed_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(6),

    CONSTRAINT "password_credentials_pkey" PRIMARY KEY ("employee_id")
);

-- CreateTable
CREATE TABLE "role_assignments" (
    "employee_id" VARCHAR(32) NOT NULL,
    "role" "Role" NOT NULL,
    "granted_by" VARCHAR(32),
    "reason" VARCHAR(500),
    "granted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6),

    CONSTRAINT "role_assignments_pkey" PRIMARY KEY ("employee_id","role")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" BIGSERIAL NOT NULL,
    "at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_employee_id" VARCHAR(32),
    "action" VARCHAR(100) NOT NULL,
    "entity" VARCHAR(100) NOT NULL,
    "entity_id" VARCHAR(100),
    "details" JSONB NOT NULL DEFAULT '{}',
    "request_id" VARCHAR(100),

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "actor_id" VARCHAR(32) NOT NULL,
    "key" VARCHAR(200) NOT NULL,
    "command" VARCHAR(120) NOT NULL,
    "status" INTEGER NOT NULL,
    "response" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("actor_id","key")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" VARCHAR(40) NOT NULL,
    "employee_id" VARCHAR(32) NOT NULL,
    "kind" VARCHAR(40) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "body" VARCHAR(1000) NOT NULL,
    "href" VARCHAR(300),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMPTZ(6),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mail_outbox" (
    "id" VARCHAR(40) NOT NULL,
    "to" VARCHAR(254) NOT NULL,
    "template" VARCHAR(80) NOT NULL,
    "subject" VARCHAR(200) NOT NULL,
    "text_body" TEXT NOT NULL,
    "html_body" TEXT,
    "status" "MailStatus" NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_error" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMPTZ(6),

    CONSTRAINT "mail_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stored_files" (
    "id" VARCHAR(40) NOT NULL,
    "purpose" VARCHAR(60) NOT NULL,
    "owner_employee_id" VARCHAR(32),
    "file_name" VARCHAR(200) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sha256" VARCHAR(64) NOT NULL,
    "storage_key" VARCHAR(300) NOT NULL,
    "created_by" VARCHAR(32),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "stored_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "counters" (
    "name" VARCHAR(60) NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "counters_pkey" PRIMARY KEY ("name")
);

-- CreateTable
CREATE TABLE "pay_configuration" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "version" INTEGER NOT NULL DEFAULT 1,
    "settings" JSONB NOT NULL,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pay_configuration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pay_profiles" (
    "employeeId" VARCHAR(32) NOT NULL,
    "entityId" VARCHAR(40) NOT NULL,
    "state" VARCHAR(8) NOT NULL,
    "uan" VARCHAR(12),
    "pfMemberId" VARCHAR(40),
    "esiIp" VARCHAR(10),
    "pan" TEXT,
    "pfOptOut" BOOLEAN NOT NULL DEFAULT false,
    "vpfPercent" INTEGER NOT NULL DEFAULT 0,
    "bankName" VARCHAR(120) NOT NULL DEFAULT '',
    "accountNumber" TEXT NOT NULL DEFAULT '',
    "ifsc" VARCHAR(11) NOT NULL DEFAULT '',
    "bankStatus" VARCHAR(16) NOT NULL DEFAULT 'pending',
    "bankChangedBy" VARCHAR(32),
    "bankChangedAt" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "pay_profiles_pkey" PRIMARY KEY ("employeeId")
);

-- CreateTable
CREATE TABLE "pay_compensation" (
    "id" VARCHAR(60) NOT NULL,
    "employeeId" VARCHAR(32) NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "annualPaise" BIGINT NOT NULL,
    "previousPaise" BIGINT NOT NULL DEFAULT 0,
    "reason" VARCHAR(300) NOT NULL,
    "reference" VARCHAR(60) NOT NULL,
    "batchId" VARCHAR(60),

    CONSTRAINT "pay_compensation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pay_templates" (
    "id" VARCHAR(40) NOT NULL,
    "terms" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "publishedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedBy" VARCHAR(32) NOT NULL,

    CONSTRAINT "pay_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pay_structure_changes" (
    "id" VARCHAR(40) NOT NULL,
    "reference" VARCHAR(60) NOT NULL,
    "kind" VARCHAR(16) NOT NULL,
    "templateId" VARCHAR(40) NOT NULL,
    "input" JSONB NOT NULL,
    "state" VARCHAR(16) NOT NULL DEFAULT 'pending',
    "preparedBy" VARCHAR(32) NOT NULL,
    "preparedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedBy" VARCHAR(32),
    "decidedAt" TIMESTAMPTZ(6),
    "decisionNote" VARCHAR(300),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "pay_structure_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pay_runs" (
    "id" VARCHAR(60) NOT NULL,
    "month" VARCHAR(7) NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "state" VARCHAR(16) NOT NULL DEFAULT 'draft',
    "preparedBy" VARCHAR(32) NOT NULL,
    "approvedBy" VARCHAR(32),
    "publishedAt" TIMESTAMPTZ(6),
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "inputDigest" VARCHAR(80) NOT NULL DEFAULT '',
    "calculationInputs" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "pay_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pay_results" (
    "id" VARCHAR(100) NOT NULL,
    "runId" VARCHAR(60) NOT NULL,
    "employeeId" VARCHAR(32) NOT NULL,
    "grossPaise" BIGINT NOT NULL,
    "deductionsPaise" BIGINT NOT NULL,
    "employerPaise" BIGINT NOT NULL,
    "netPaise" BIGINT NOT NULL,
    "snapshot" JSONB NOT NULL,

    CONSTRAINT "pay_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pay_inputs" (
    "id" VARCHAR(40) NOT NULL,
    "runId" VARCHAR(60) NOT NULL,
    "employeeId" VARCHAR(32) NOT NULL,
    "kind" VARCHAR(30) NOT NULL,
    "amountPaise" BIGINT NOT NULL DEFAULT 0,
    "lopHalves" INTEGER NOT NULL DEFAULT 0,
    "arrearsFrom" VARCHAR(7),
    "arrearsMonths" INTEGER NOT NULL DEFAULT 0,
    "note" VARCHAR(300) NOT NULL,
    "addedBy" VARCHAR(32) NOT NULL,
    "addedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pay_inputs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pay_holds" (
    "id" VARCHAR(40) NOT NULL,
    "runId" VARCHAR(60) NOT NULL,
    "employeeId" VARCHAR(32) NOT NULL,
    "reason" VARCHAR(300) NOT NULL,
    "heldBy" VARCHAR(32) NOT NULL,
    "heldAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedBy" VARCHAR(32),
    "releasedAt" TIMESTAMPTZ(6),
    "releaseNote" VARCHAR(300),

    CONSTRAINT "pay_holds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pay_declarations" (
    "employeeId" VARCHAR(32) NOT NULL,
    "financialYear" VARCHAR(7) NOT NULL,
    "regime" VARCHAR(3) NOT NULL DEFAULT 'new',
    "state" VARCHAR(16) NOT NULL DEFAULT 'draft',
    "submittedAt" TIMESTAMPTZ(6),
    "items" JSONB NOT NULL DEFAULT '{}',
    "monthlyRentPaise" BIGINT NOT NULL DEFAULT 0,
    "rentCity" VARCHAR(12) NOT NULL DEFAULT 'metro',
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "pay_declarations_pkey" PRIMARY KEY ("employeeId","financialYear")
);

-- CreateTable
CREATE TABLE "pay_loans" (
    "id" VARCHAR(40) NOT NULL,
    "reference" VARCHAR(60) NOT NULL,
    "employeeId" VARCHAR(32) NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "principalPaise" BIGINT NOT NULL,
    "recoveredPaise" BIGINT NOT NULL DEFAULT 0,
    "tenureMonths" INTEGER NOT NULL,
    "paidInstallments" INTEGER NOT NULL DEFAULT 0,
    "startMonth" VARCHAR(7) NOT NULL,
    "state" VARCHAR(16) NOT NULL DEFAULT 'requested',
    "reason" VARCHAR(300) NOT NULL,
    "requestedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedBy" VARCHAR(32),
    "decidedAt" TIMESTAMPTZ(6),
    "decisionNote" VARCHAR(300),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "pay_loans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pay_imports" (
    "id" VARCHAR(40) NOT NULL,
    "reference" VARCHAR(60) NOT NULL,
    "fileName" VARCHAR(200) NOT NULL,
    "state" VARCHAR(16) NOT NULL DEFAULT 'previewed',
    "uploadedBy" VARCHAR(32) NOT NULL,
    "uploadedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMPTZ(6),
    "decidedBy" VARCHAR(32),
    "decidedAt" TIMESTAMPTZ(6),
    "decisionNote" VARCHAR(300),
    "preview" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "pay_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pay_challans" (
    "id" VARCHAR(40) NOT NULL,
    "reference" VARCHAR(60) NOT NULL,
    "obligationKey" VARCHAR(150) NOT NULL,
    "type" VARCHAR(8) NOT NULL,
    "entityId" VARCHAR(40) NOT NULL,
    "state" VARCHAR(8),
    "period" VARCHAR(7) NOT NULL,
    "amountPaise" BIGINT NOT NULL,
    "paidOn" DATE NOT NULL,
    "challanNo" VARCHAR(24) NOT NULL,
    "bsrCode" VARCHAR(7),
    "recordedBy" VARCHAR(32) NOT NULL,
    "recordedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pay_challans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pay_form16" (
    "employeeId" VARCHAR(32) NOT NULL,
    "financialYear" VARCHAR(7) NOT NULL,
    "snapshot" JSONB NOT NULL,
    "generatedBy" VARCHAR(32) NOT NULL,
    "generatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pay_form16_pkey" PRIMARY KEY ("employeeId","financialYear")
);

-- CreateTable
CREATE TABLE "report_saved" (
    "id" VARCHAR(40) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "description" VARCHAR(240) NOT NULL,
    "spec" JSONB NOT NULL,
    "visibility" VARCHAR(16) NOT NULL DEFAULT 'private',
    "sharedRoles" TEXT[],
    "ownerId" VARCHAR(32) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "schedule" JSONB,
    "nextRunAt" TIMESTAMPTZ(6),
    "lastRunAt" TIMESTAMPTZ(6),

    CONSTRAINT "report_saved_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_exports" (
    "id" VARCHAR(40) NOT NULL,
    "actorId" VARCHAR(32) NOT NULL,
    "report" VARCHAR(200) NOT NULL,
    "source" VARCHAR(16) NOT NULL,
    "format" VARCHAR(4) NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "filters" VARCHAR(2000) NOT NULL,
    "at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_exports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_deliveries" (
    "id" VARCHAR(40) NOT NULL,
    "savedReportId" VARCHAR(40) NOT NULL,
    "reportName" VARCHAR(80) NOT NULL,
    "ownerId" VARCHAR(32) NOT NULL,
    "recipientIds" TEXT[],
    "rowCount" INTEGER NOT NULL,
    "format" VARCHAR(4) NOT NULL,
    "trigger" VARCHAR(16) NOT NULL,
    "artifact" JSONB NOT NULL,
    "at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "talent_records" (
    "id" VARCHAR(60) NOT NULL,
    "domain" VARCHAR(30) NOT NULL,
    "kind" VARCHAR(40) NOT NULL,
    "owner_id" VARCHAR(32),
    "parent_id" VARCHAR(60),
    "state" VARCHAR(40) NOT NULL DEFAULT 'active',
    "data" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "talent_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "time_workflows" (
    "id" VARCHAR(50) NOT NULL,
    "reference" VARCHAR(50) NOT NULL,
    "kind" VARCHAR(30) NOT NULL,
    "employee_id" VARCHAR(32) NOT NULL,
    "approver_id" VARCHAR(32),
    "state" VARCHAR(30) NOT NULL DEFAULT 'pending',
    "start_date" VARCHAR(10),
    "end_date" VARCHAR(10),
    "version" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" TIMESTAMPTZ(6),
    "decided_by" VARCHAR(32),
    "decision_note" VARCHAR(500),

    CONSTRAINT "time_workflows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "time_documents" (
    "id" VARCHAR(180) NOT NULL,
    "kind" VARCHAR(30) NOT NULL,
    "scope" VARCHAR(120),
    "version" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "time_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "time_attendance" (
    "id" VARCHAR(50) NOT NULL,
    "employee_id" VARCHAR(32) NOT NULL,
    "date" VARCHAR(10) NOT NULL,
    "first_in" TIMESTAMPTZ(6),
    "last_out" TIMESTAMPTZ(6),
    "worked_minutes" INTEGER NOT NULL DEFAULT 0,
    "source" VARCHAR(30) NOT NULL,
    "check_in_evidence" JSONB,
    "check_out_evidence" JSONB,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "time_attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "time_leave_ledger" (
    "id" VARCHAR(50) NOT NULL,
    "employee_id" VARCHAR(32) NOT NULL,
    "leave_type_id" VARCHAR(180) NOT NULL,
    "date" VARCHAR(10) NOT NULL,
    "kind" VARCHAR(30) NOT NULL,
    "units" DECIMAL(8,2) NOT NULL,
    "expires_on" VARCHAR(10),
    "reference" VARCHAR(80) NOT NULL,
    "note" VARCHAR(500) NOT NULL,
    "actor_id" VARCHAR(32),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "time_leave_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_records" (
    "id" VARCHAR(100) NOT NULL,
    "kind" VARCHAR(40) NOT NULL,
    "owner_id" VARCHAR(32),
    "parent_id" VARCHAR(100),
    "state" VARCHAR(30) NOT NULL DEFAULT 'active',
    "version" INTEGER NOT NULL DEFAULT 1,
    "data" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "workspace_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_security" (
    "employee_id" VARCHAR(32) NOT NULL,
    "revoked_before" TIMESTAMPTZ(6),
    "totp_secret" TEXT,
    "factor_id" VARCHAR(40),
    "verified_at" TIMESTAMPTZ(6),
    "last_totp_step" BIGINT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_security_pkey" PRIMARY KEY ("employee_id")
);

-- CreateTable
CREATE TABLE "account_links" (
    "id" VARCHAR(40) NOT NULL,
    "employee_id" VARCHAR(32) NOT NULL,
    "kind" VARCHAR(20) NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "private_files" (
    "id" VARCHAR(100) NOT NULL,
    "owner_id" VARCHAR(32) NOT NULL,
    "mime" VARCHAR(100) NOT NULL,
    "bytes" BYTEA NOT NULL,
    "sha256" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "private_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "departments_name_key" ON "departments"("name");

-- CreateIndex
CREATE UNIQUE INDEX "locations_name_key" ON "locations"("name");

-- CreateIndex
CREATE UNIQUE INDEX "employees_code_key" ON "employees"("code");

-- CreateIndex
CREATE UNIQUE INDEX "employees_work_email_key" ON "employees"("work_email");

-- CreateIndex
CREATE INDEX "employees_manager_id_idx" ON "employees"("manager_id");

-- CreateIndex
CREATE INDEX "employees_department_id_idx" ON "employees"("department_id");

-- CreateIndex
CREATE INDEX "employees_status_idx" ON "employees"("status");

-- CreateIndex
CREATE INDEX "audit_log_entity_entity_id_at_idx" ON "audit_log"("entity", "entity_id", "at" DESC);

-- CreateIndex
CREATE INDEX "audit_log_actor_employee_id_at_idx" ON "audit_log"("actor_employee_id", "at" DESC);

-- CreateIndex
CREATE INDEX "audit_log_at_idx" ON "audit_log"("at" DESC);

-- CreateIndex
CREATE INDEX "idempotency_keys_created_at_idx" ON "idempotency_keys"("created_at");

-- CreateIndex
CREATE INDEX "notifications_employee_id_created_at_idx" ON "notifications"("employee_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "mail_outbox_status_created_at_idx" ON "mail_outbox"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "stored_files_storage_key_key" ON "stored_files"("storage_key");

-- CreateIndex
CREATE INDEX "stored_files_owner_employee_id_purpose_idx" ON "stored_files"("owner_employee_id", "purpose");

-- CreateIndex
CREATE INDEX "pay_profiles_entityId_state_idx" ON "pay_profiles"("entityId", "state");

-- CreateIndex
CREATE INDEX "pay_compensation_employeeId_effectiveFrom_idx" ON "pay_compensation"("employeeId", "effectiveFrom" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "pay_compensation_employeeId_effectiveFrom_key" ON "pay_compensation"("employeeId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "pay_structure_changes_reference_key" ON "pay_structure_changes"("reference");

-- CreateIndex
CREATE INDEX "pay_structure_changes_state_preparedAt_idx" ON "pay_structure_changes"("state", "preparedAt");

-- CreateIndex
CREATE INDEX "pay_runs_state_month_idx" ON "pay_runs"("state", "month");

-- CreateIndex
CREATE UNIQUE INDEX "pay_runs_month_key" ON "pay_runs"("month");

-- CreateIndex
CREATE INDEX "pay_results_employeeId_runId_idx" ON "pay_results"("employeeId", "runId");

-- CreateIndex
CREATE UNIQUE INDEX "pay_results_runId_employeeId_key" ON "pay_results"("runId", "employeeId");

-- CreateIndex
CREATE INDEX "pay_inputs_runId_employeeId_idx" ON "pay_inputs"("runId", "employeeId");

-- CreateIndex
CREATE INDEX "pay_holds_runId_employeeId_idx" ON "pay_holds"("runId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "pay_loans_reference_key" ON "pay_loans"("reference");

-- CreateIndex
CREATE INDEX "pay_loans_employeeId_state_idx" ON "pay_loans"("employeeId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "pay_imports_reference_key" ON "pay_imports"("reference");

-- CreateIndex
CREATE INDEX "pay_imports_state_uploadedAt_idx" ON "pay_imports"("state", "uploadedAt");

-- CreateIndex
CREATE UNIQUE INDEX "pay_challans_reference_key" ON "pay_challans"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "pay_challans_obligationKey_key" ON "pay_challans"("obligationKey");

-- CreateIndex
CREATE INDEX "pay_challans_period_entityId_idx" ON "pay_challans"("period", "entityId");

-- CreateIndex
CREATE INDEX "report_saved_ownerId_idx" ON "report_saved"("ownerId");

-- CreateIndex
CREATE INDEX "report_saved_nextRunAt_idx" ON "report_saved"("nextRunAt");

-- CreateIndex
CREATE INDEX "report_exports_at_idx" ON "report_exports"("at" DESC);

-- CreateIndex
CREATE INDEX "report_deliveries_ownerId_at_idx" ON "report_deliveries"("ownerId", "at" DESC);

-- CreateIndex
CREATE INDEX "talent_records_domain_kind_owner_id_idx" ON "talent_records"("domain", "kind", "owner_id");

-- CreateIndex
CREATE INDEX "talent_records_domain_kind_parent_id_idx" ON "talent_records"("domain", "kind", "parent_id");

-- CreateIndex
CREATE INDEX "talent_records_domain_kind_state_idx" ON "talent_records"("domain", "kind", "state");

-- CreateIndex
CREATE UNIQUE INDEX "time_workflows_reference_key" ON "time_workflows"("reference");

-- CreateIndex
CREATE INDEX "time_workflows_employee_id_kind_created_at_idx" ON "time_workflows"("employee_id", "kind", "created_at");

-- CreateIndex
CREATE INDEX "time_workflows_approver_id_state_kind_idx" ON "time_workflows"("approver_id", "state", "kind");

-- CreateIndex
CREATE INDEX "time_workflows_kind_start_date_end_date_idx" ON "time_workflows"("kind", "start_date", "end_date");

-- CreateIndex
CREATE INDEX "time_documents_kind_scope_idx" ON "time_documents"("kind", "scope");

-- CreateIndex
CREATE INDEX "time_attendance_date_idx" ON "time_attendance"("date");

-- CreateIndex
CREATE UNIQUE INDEX "time_attendance_employee_id_date_key" ON "time_attendance"("employee_id", "date");

-- CreateIndex
CREATE INDEX "time_leave_ledger_employee_id_leave_type_id_date_idx" ON "time_leave_ledger"("employee_id", "leave_type_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "time_leave_ledger_employee_id_leave_type_id_kind_reference_key" ON "time_leave_ledger"("employee_id", "leave_type_id", "kind", "reference");

-- CreateIndex
CREATE INDEX "workspace_records_kind_owner_id_state_idx" ON "workspace_records"("kind", "owner_id", "state");

-- CreateIndex
CREATE INDEX "workspace_records_kind_parent_id_idx" ON "workspace_records"("kind", "parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "account_links_token_hash_key" ON "account_links"("token_hash");

-- CreateIndex
CREATE INDEX "account_links_employee_id_kind_idx" ON "account_links"("employee_id", "kind");

-- CreateIndex
CREATE INDEX "private_files_owner_id_idx" ON "private_files"("owner_id");

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_accounts" ADD CONSTRAINT "user_accounts_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_credentials" ADD CONSTRAINT "password_credentials_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pay_results" ADD CONSTRAINT "pay_results_runId_fkey" FOREIGN KEY ("runId") REFERENCES "pay_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pay_inputs" ADD CONSTRAINT "pay_inputs_runId_fkey" FOREIGN KEY ("runId") REFERENCES "pay_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pay_holds" ADD CONSTRAINT "pay_holds_runId_fkey" FOREIGN KEY ("runId") REFERENCES "pay_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Additional integrity: 00-core.sql
-- Database objects Prisma's schema language cannot express. Every file in prisma/sql/ is idempotent and is applied
-- (in file-name order) after `prisma db push` in sandboxes and appended to the baseline migration.

-- Audit log is append-only.
CREATE OR REPLACE FUNCTION reject_audit_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END;
$$;

DROP TRIGGER IF EXISTS audit_log_append_only ON audit_log;
CREATE TRIGGER audit_log_append_only
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION reject_audit_change();

DROP TRIGGER IF EXISTS audit_log_no_truncate ON audit_log;
CREATE TRIGGER audit_log_no_truncate
  BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION reject_audit_change();

-- Realtime: a committed notification wakes the WebSocket hub (payload carries ids only, never content).
CREATE OR REPLACE FUNCTION publish_notification() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('gtf_notifications', json_build_object('id', NEW.id, 'employeeId', NEW.employee_id)::text);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notifications_publish ON notifications;
CREATE TRIGGER notifications_publish
  AFTER INSERT ON notifications
  FOR EACH ROW EXECUTE FUNCTION publish_notification();

-- Data integrity the Prisma schema cannot state.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employees_not_own_manager') THEN
    ALTER TABLE employees ADD CONSTRAINT employees_not_own_manager CHECK (manager_id IS NULL OR manager_id <> id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organization_singleton') THEN
    ALTER TABLE organization ADD CONSTRAINT organization_singleton CHECK (id = 1);
  END IF;
END $$;


-- Additional integrity: 10-workspace.sql
-- Parent ids in workspace_records are polymorphic (employees, posts, surveys), so only ownership is constrained.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workspace_owner_fk') THEN
    ALTER TABLE workspace_records ADD CONSTRAINT workspace_owner_fk FOREIGN KEY (owner_id) REFERENCES employees(id) ON DELETE RESTRICT;
    ALTER TABLE account_security ADD CONSTRAINT account_security_employee_fk FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE RESTRICT;
    ALTER TABLE account_links ADD CONSTRAINT account_link_employee_fk FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE RESTRICT;
    ALTER TABLE private_files ADD CONSTRAINT private_file_owner_fk FOREIGN KEY (owner_id) REFERENCES employees(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workspace_version_positive') THEN
    ALTER TABLE workspace_records ADD CONSTRAINT workspace_version_positive CHECK (version > 0);
    ALTER TABLE account_security ADD CONSTRAINT account_security_attempts_nonnegative CHECK (attempts >= 0);
    ALTER TABLE account_links ADD CONSTRAINT account_link_valid_expiry CHECK (expires_at > created_at);
  END IF;
END $$;


-- Additional integrity: 20-time.sql
DO $time$ BEGIN ALTER TABLE time_workflows ADD CONSTRAINT time_workflow_employee_fk FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE RESTRICT; EXCEPTION WHEN duplicate_object THEN NULL; END $time$;
DO $time$ BEGIN ALTER TABLE time_workflows ADD CONSTRAINT time_workflow_approver_fk FOREIGN KEY (approver_id) REFERENCES employees(id) ON DELETE RESTRICT; EXCEPTION WHEN duplicate_object THEN NULL; END $time$;
DO $time$ BEGIN ALTER TABLE time_attendance ADD CONSTRAINT time_attendance_employee_fk FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE RESTRICT; EXCEPTION WHEN duplicate_object THEN NULL; END $time$;
DO $time$ BEGIN ALTER TABLE time_leave_ledger ADD CONSTRAINT time_ledger_employee_fk FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE RESTRICT; EXCEPTION WHEN duplicate_object THEN NULL; END $time$;
DO $time$ BEGIN ALTER TABLE time_attendance ADD CONSTRAINT time_attendance_minutes CHECK (worked_minutes >= 0 AND (last_out IS NULL OR first_in IS NOT NULL) AND (last_out IS NULL OR last_out >= first_in)); EXCEPTION WHEN duplicate_object THEN NULL; END $time$;
DO $time$ BEGIN ALTER TABLE time_workflows ADD CONSTRAINT time_workflow_version CHECK (version > 0); EXCEPTION WHEN duplicate_object THEN NULL; END $time$;
DO $time$ BEGIN ALTER TABLE time_leave_ledger ADD CONSTRAINT time_ledger_half_units CHECK (units * 2 = trunc(units * 2)); EXCEPTION WHEN duplicate_object THEN NULL; END $time$;
CREATE UNIQUE INDEX IF NOT EXISTS time_open_regularization ON time_workflows(employee_id,start_date) WHERE kind='regularization' AND state='pending';
CREATE UNIQUE INDEX IF NOT EXISTS time_active_comp_off ON time_workflows(employee_id,start_date) WHERE kind='comp_off' AND state IN ('pending','approved');
CREATE UNIQUE INDEX IF NOT EXISTS time_timesheet_week ON time_workflows(employee_id,start_date) WHERE kind='timesheet';


-- Additional integrity: 30-payroll.sql
CREATE OR REPLACE FUNCTION pay_protect_results() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE run_state text;
BEGIN
  SELECT state INTO run_state FROM pay_runs WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD."runId" ELSE NEW."runId" END;
  IF run_state IN ('approved', 'published', 'paid') THEN
    RAISE EXCEPTION 'Finalized payroll results are immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS pay_result_immutable ON pay_results;
CREATE TRIGGER pay_result_immutable BEFORE INSERT OR UPDATE OR DELETE ON pay_results FOR EACH ROW EXECUTE FUNCTION pay_protect_results();
CREATE UNIQUE INDEX IF NOT EXISTS pay_active_hold ON pay_holds("runId", "employeeId") WHERE "releasedAt" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS pay_pending_loan ON pay_loans("employeeId") WHERE state = 'requested';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pay_independent_approval') THEN
    ALTER TABLE pay_runs ADD CONSTRAINT pay_independent_approval CHECK ("approvedBy" IS NULL OR "approvedBy" <> "preparedBy");
    ALTER TABLE pay_compensation ADD CONSTRAINT pay_positive_compensation CHECK ("annualPaise" > 0);
    ALTER TABLE pay_loans ADD CONSTRAINT pay_valid_loan CHECK ("principalPaise" > 0 AND "recoveredPaise" >= 0 AND "recoveredPaise" <= "principalPaise" AND "tenureMonths" BETWEEN 1 AND 24);
    ALTER TABLE pay_inputs ADD CONSTRAINT pay_valid_input CHECK ("amountPaise" >= 0 AND "lopHalves" BETWEEN 0 AND 62);
    ALTER TABLE pay_profiles ADD CONSTRAINT pay_valid_vpf CHECK ("vpfPercent" BETWEEN 0 AND 88);
  END IF;
END $$;


-- Additional integrity: 31-payroll-ownership.sql
-- Historical payroll rows retain their employee references after employment ends.
-- PayTemplate.publishedBy is a human-readable label, not an employee identifier.
DO $$
DECLARE item record;
BEGIN
  FOR item IN SELECT * FROM (VALUES
    ('pay_profiles', 'employeeId'), ('pay_profiles', 'bankChangedBy'),
    ('pay_compensation', 'employeeId'),
    ('pay_structure_changes', 'preparedBy'), ('pay_structure_changes', 'decidedBy'),
    ('pay_runs', 'preparedBy'), ('pay_runs', 'approvedBy'),
    ('pay_results', 'employeeId'), ('pay_inputs', 'employeeId'), ('pay_inputs', 'addedBy'),
    ('pay_holds', 'employeeId'), ('pay_holds', 'heldBy'), ('pay_holds', 'releasedBy'),
    ('pay_declarations', 'employeeId'), ('pay_loans', 'employeeId'), ('pay_loans', 'decidedBy'),
    ('pay_imports', 'uploadedBy'), ('pay_imports', 'decidedBy'),
    ('pay_challans', 'recordedBy'), ('pay_form16', 'employeeId'), ('pay_form16', 'generatedBy'),
    ('report_saved', 'ownerId'), ('report_exports', 'actorId'), ('report_deliveries', 'ownerId')
  ) AS refs(table_name, column_name)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = item.table_name || '_' || item.column_name || '_employee_fk') THEN
      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES employees(id) ON DELETE RESTRICT',
        item.table_name, item.table_name || '_' || item.column_name || '_employee_fk', item.column_name);
    END IF;
  END LOOP;
END $$;


-- Additional integrity: 40-talent.sql
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='talent_owner_employee_fk') THEN ALTER TABLE talent_records ADD CONSTRAINT talent_owner_employee_fk FOREIGN KEY (owner_id) REFERENCES employees(id) ON DELETE RESTRICT; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='talent_record_version_positive') THEN ALTER TABLE talent_records ADD CONSTRAINT talent_record_version_positive CHECK (version > 0); END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='talent_record_domain_valid') THEN ALTER TABLE talent_records ADD CONSTRAINT talent_record_domain_valid CHECK (domain IN ('lifecycle','recruitment','performance')); END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS talent_asset_tag_unique ON talent_records ((data->>'tag')) WHERE domain='lifecycle' AND kind='asset';
CREATE UNIQUE INDEX IF NOT EXISTS talent_asset_serial_unique ON talent_records ((data->>'serial')) WHERE domain='lifecycle' AND kind='asset';
CREATE UNIQUE INDEX IF NOT EXISTS talent_settlement_employee_unique ON talent_records (owner_id) WHERE domain='lifecycle' AND kind='settlement';
CREATE UNIQUE INDEX IF NOT EXISTS talent_active_resignation_unique ON talent_records (owner_id) WHERE domain='lifecycle' AND kind='resignation' AND state IN ('pending_manager','pending_hr','on_hold','accepted');
CREATE UNIQUE INDEX IF NOT EXISTS talent_performance_participation_unique ON talent_records (owner_id,parent_id) WHERE domain='performance' AND kind='review';
CREATE UNIQUE INDEX IF NOT EXISTS talent_onboarding_case_unique ON talent_records (owner_id) WHERE domain='lifecycle' AND kind='onboarding';

COMMIT;
