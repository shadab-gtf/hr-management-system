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
