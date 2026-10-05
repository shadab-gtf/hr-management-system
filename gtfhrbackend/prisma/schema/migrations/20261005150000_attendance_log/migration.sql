-- Selfie + live GPS attendance log (src/modules/attendance-log, docs/api/attendance-log.md).
-- Hand-written; the append-only trigger is mirrored in prisma/sql/25-attendance-log.sql for db-push sandboxes.

-- CreateEnum
CREATE TYPE "att_log_event_type" AS ENUM ('sign_in', 'sign_out');

-- CreateEnum
CREATE TYPE "att_log_status" AS ENUM ('success', 'failed');

-- CreateTable
CREATE TABLE "att_log_entries" (
    "id" VARCHAR(40) NOT NULL,
    "employee_id" VARCHAR(32) NOT NULL,
    "event_type" "att_log_event_type" NOT NULL,
    "business_date" VARCHAR(10) NOT NULL,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "accuracy_m" DECIMAL(9,2),
    "selfie_file_id" VARCHAR(40),
    "server_timestamp" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "client_timestamp" TIMESTAMPTZ(6) NOT NULL,
    "position_timestamp" TIMESTAMPTZ(6) NOT NULL,
    "device_id" VARCHAR(64) NOT NULL,
    "status" "att_log_status" NOT NULL,
    "failure_reason" VARCHAR(60),
    "flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "offline" BOOLEAN NOT NULL DEFAULT false,
    "geofence_status" VARCHAR(20),
    "site_id" VARCHAR(60),
    "site_name" VARCHAR(120),
    "client_signals" JSONB NOT NULL,
    "ip_hash" VARCHAR(64),
    "reference" VARCHAR(50),
    "request_id" VARCHAR(100),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "att_log_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "att_log_devices" (
    "employee_id" VARCHAR(32) NOT NULL,
    "device_id" VARCHAR(64) NOT NULL,
    "registered_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "att_log_devices_pkey" PRIMARY KEY ("employee_id")
);

-- CreateIndex
CREATE INDEX "att_log_entries_employee_id_created_at_idx" ON "att_log_entries"("employee_id", "created_at");

-- CreateIndex
CREATE INDEX "att_log_entries_employee_id_device_id_idx" ON "att_log_entries"("employee_id", "device_id");

-- CreateIndex
CREATE INDEX "att_log_entries_business_date_status_idx" ON "att_log_entries"("business_date", "status");

-- AddForeignKey
ALTER TABLE "att_log_entries" ADD CONSTRAINT "att_log_entries_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "att_log_devices" ADD CONSTRAINT "att_log_devices_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Attendance logs are append-only (evidence for HR review): reject UPDATE, DELETE and TRUNCATE.
CREATE OR REPLACE FUNCTION reject_att_log_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'att_log_entries is append-only';
END;
$$;

DROP TRIGGER IF EXISTS att_log_entries_append_only ON att_log_entries;
CREATE TRIGGER att_log_entries_append_only
  BEFORE UPDATE OR DELETE ON att_log_entries
  FOR EACH ROW EXECUTE FUNCTION reject_att_log_change();

DROP TRIGGER IF EXISTS att_log_entries_no_truncate ON att_log_entries;
CREATE TRIGGER att_log_entries_no_truncate
  BEFORE TRUNCATE ON att_log_entries
  FOR EACH STATEMENT EXECUTE FUNCTION reject_att_log_change();
