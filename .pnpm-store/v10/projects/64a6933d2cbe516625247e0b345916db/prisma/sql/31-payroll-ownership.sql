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
