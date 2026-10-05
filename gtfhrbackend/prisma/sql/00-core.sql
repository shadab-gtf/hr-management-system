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
