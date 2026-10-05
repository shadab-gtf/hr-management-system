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
