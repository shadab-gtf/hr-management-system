-- Realtime (WebSocket hub, src/modules/realtime). Idempotent; mirrored in migration 20261005130000_realtime_channels.
-- Every payload carries a coarse area or an employee id only: never names, amounts or record content. Clients
-- refetch through the normal authorized APIs. pg_notify is transactional (delivered on commit, dropped on rollback)
-- and collapses identical payloads within one transaction, so bulk imports produce one event per area.

-- gtf_changes: any audited write → {"area": "<module>"} broadcast to every connected session.
CREATE OR REPLACE FUNCTION realtime_area(audit_action text, audit_entity text) RETURNS text
  LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  candidate text;
  area text;
BEGIN
  FOREACH candidate IN ARRAY ARRAY[
    lower(split_part(coalesce(audit_action, ''), '.', 1)),
    lower(split_part(coalesce(audit_entity, ''), '.', 1))
  ] LOOP
    area := CASE
      WHEN candidate ~ '^(access|identity|delegation|audit|security|mfa|role|account)' THEN 'access'
      WHEN candidate ~ '^(pay|salary|compensation|statutory|loan|tax|settlement|expense|bank|reimburse|declaration|gratuity|bonus)'
        OR candidate ~ '^(pt|lwf|esi|ecr|epf|pf)$' THEN 'pay'
      WHEN candidate ~ '^(leave|holiday|time_off|comp_off)' THEN 'leave'
      WHEN candidate ~ '^(attendance|timesheet|roster|time|shift|project|regulari|overtime|punch)' THEN 'time'
      WHEN candidate ~ '^(report|analytics|export)' THEN 'reports'
      WHEN candidate ~ '^(performance|recruitment|candidate|talent|review|goal|okr|feedback|learning|course|skill|referral|job|interview)' THEN 'talent'
      WHEN candidate ~ '^(lifecycle|onboarding|offboarding|exit|separation|resignation|probation|transfer|promotion|confirmation|offer)' THEN 'lifecycle'
      WHEN candidate ~ '^(engage|survey|announcement|event|poll|praise|post|kudos|celebration|feed)' THEN 'engage'
      WHEN candidate ~ '^(employee|directory|profile|people|department|person|team)' THEN 'people'
      WHEN candidate ~ '^(helpdesk|ticket|asset|document|letter|policy|organization|location|notification|approval|import|register|config|workplace|request|service)' THEN 'workplace'
      ELSE NULL
    END;
    IF area IS NOT NULL THEN
      RETURN area;
    END IF;
  END LOOP;
  RETURN 'workplace';
END;
$$;

CREATE OR REPLACE FUNCTION publish_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('gtf_changes', json_build_object('area', realtime_area(NEW.action, NEW.entity))::text);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_log_publish_change ON audit_log;
CREATE TRIGGER audit_log_publish_change
  AFTER INSERT ON audit_log
  FOR EACH ROW EXECUTE FUNCTION publish_change();

-- gtf_access: a person's roles, role scopes, account state, session revocation or employment status changed →
-- {"employeeId": "..."}; the hub re-validates that person's sockets and tells their open pages to refresh.
CREATE OR REPLACE FUNCTION publish_access_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  old_id text;
  new_id text;
BEGIN
  IF TG_TABLE_NAME = 'employees' THEN
    new_id := NEW.id;
  ELSE
    IF TG_OP <> 'INSERT' THEN old_id := OLD.employee_id; END IF;
    IF TG_OP <> 'DELETE' THEN new_id := NEW.employee_id; END IF;
  END IF;
  IF new_id IS NOT NULL THEN
    PERFORM pg_notify('gtf_access', json_build_object('employeeId', new_id)::text);
  END IF;
  IF old_id IS NOT NULL AND old_id IS DISTINCT FROM new_id THEN
    PERFORM pg_notify('gtf_access', json_build_object('employeeId', old_id)::text);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS role_assignments_publish_access ON role_assignments;
CREATE TRIGGER role_assignments_publish_access
  AFTER INSERT OR UPDATE OR DELETE ON role_assignments
  FOR EACH ROW EXECUTE FUNCTION publish_access_change();

DROP TRIGGER IF EXISTS role_scopes_publish_access ON role_scopes;
CREATE TRIGGER role_scopes_publish_access
  AFTER INSERT OR UPDATE OR DELETE ON role_scopes
  FOR EACH ROW EXECUTE FUNCTION publish_access_change();

-- Sign-ins touch last_sign_in_at; only account creation/removal and disable/enable are access changes.
DROP TRIGGER IF EXISTS user_accounts_publish_access ON user_accounts;
CREATE TRIGGER user_accounts_publish_access
  AFTER INSERT OR DELETE ON user_accounts
  FOR EACH ROW EXECUTE FUNCTION publish_access_change();

DROP TRIGGER IF EXISTS user_accounts_publish_access_state ON user_accounts;
CREATE TRIGGER user_accounts_publish_access_state
  AFTER UPDATE OF disabled_at ON user_accounts
  FOR EACH ROW WHEN (OLD.disabled_at IS DISTINCT FROM NEW.disabled_at)
  EXECUTE FUNCTION publish_access_change();

-- "Sign out everywhere" and account disable move revoked_before forward: open sockets must close.
DROP TRIGGER IF EXISTS account_security_publish_access ON account_security;
CREATE TRIGGER account_security_publish_access
  AFTER UPDATE OF revoked_before ON account_security
  FOR EACH ROW WHEN (OLD.revoked_before IS DISTINCT FROM NEW.revoked_before)
  EXECUTE FUNCTION publish_access_change();

DROP TRIGGER IF EXISTS account_security_publish_access_insert ON account_security;
CREATE TRIGGER account_security_publish_access_insert
  AFTER INSERT ON account_security
  FOR EACH ROW WHEN (NEW.revoked_before IS NOT NULL)
  EXECUTE FUNCTION publish_access_change();

-- An exited employee loses access at once.
DROP TRIGGER IF EXISTS employees_publish_access ON employees;
CREATE TRIGGER employees_publish_access
  AFTER UPDATE OF status ON employees
  FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION publish_access_change();
