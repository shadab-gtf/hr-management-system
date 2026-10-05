-- Selfie + live GPS attendance log. Idempotent; mirrored in migration 20261005150000_attendance_log.
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
