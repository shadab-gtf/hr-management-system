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
