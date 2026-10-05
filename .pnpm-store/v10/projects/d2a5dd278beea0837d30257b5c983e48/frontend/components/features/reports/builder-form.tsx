"use client";

import Form from "next/form";
import { useMemo, useState } from "react";
import { AppIcon } from "@/components/ui/app-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/display";
import type { Dataset, ReportDataset, ReportSpec } from "@/types/reports";

const statusOptions = [
  { value: "", label: "Current employees" },
  { value: "active", label: "Active" },
  { value: "on_leave", label: "On long leave" },
  { value: "onboarding", label: "Onboarding" },
  { value: "notice", label: "Serving notice" },
  { value: "exited", label: "Exited" },
];
const leaveStates = [
  { value: "", label: "Any state" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "cancelled", label: "Cancelled" },
];

function previousMonth(month: string) {
  const [y, m] = month.split("-").map(Number);
  const date = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 2, 1));
  return date.toISOString().slice(0, 7);
}

/**
 * Report builder controls. Submits as a GET form so the server renders the
 * preview from the URL (shareable, back-button friendly, no client fetch).
 */
export function BuilderForm({
  datasets,
  departments,
  locations,
  currentMonth,
  initial,
  savedId,
  errors,
}: {
  datasets: Dataset[];
  departments: string[];
  locations: string[];
  currentMonth: string;
  initial: ReportSpec | null;
  savedId: string | null;
  errors: Record<string, string>;
}) {
  const [datasetId, setDatasetId] = useState<ReportDataset>(initial?.dataset ?? datasets[0]?.id ?? "employees");
  const dataset = datasets.find((item) => item.id === datasetId) ?? datasets[0];
  const fromInitial = initial && initial.dataset === datasetId;
  const [columns, setColumns] = useState<string[]>(initial?.columns ?? dataset?.defaultColumns ?? []);
  const [grouped, setGrouped] = useState(Boolean(initial?.groupBy));
  const [aggFn, setAggFn] = useState(initial?.aggregate?.fn ?? "count");

  const groupable = useMemo(() => (dataset?.columns ?? []).filter((column) => column.kind === "text" && !column.pii && !["name", "code", "reference"].includes(column.key)), [dataset]);
  const numeric = useMemo(() => (dataset?.columns ?? []).filter((column) => column.kind === "number" || column.kind === "money"), [dataset]);
  if (!dataset) return <Alert tone="warning">No datasets are available for your role.</Alert>;

  const changeDataset = (value: string) => {
    const next = datasets.find((item) => item.id === value);
    if (!next) return;
    setDatasetId(next.id);
    setColumns(next.defaultColumns);
    setGrouped(false);
    setAggFn("count");
  };
  const toggle = (key: string, on: boolean) => setColumns((current) => (on ? [...current, key] : current.filter((item) => item !== key)));
  const filters = fromInitial ? initial.filters : null;
  const monthDefault = filters?.month || (datasetId === "payroll_register" ? previousMonth(currentMonth) : currentMonth);
  const error = (key: string) => errors[key];

  return (
    <Form action="/admin/reports/builder" className="form rpt-builder">
      {savedId && <input type="hidden" name="saved" value={savedId} />}
      <div className="form-field">
        <label htmlFor="rb-dataset">Dataset</label>
        <select id="rb-dataset" name="dataset" className="input select" value={datasetId} onChange={(event) => changeDataset(event.target.value)} aria-describedby="rb-dataset-hint">
          {datasets.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
        <p id="rb-dataset-hint" className="field-hint">
          {dataset.description}
        </p>
      </div>

      <fieldset className="rpt-fieldset" aria-describedby={error("columns") ? "rb-columns-error" : undefined}>
        <legend>Columns</legend>
        <div className="rpt-columns">
          {dataset.columns.map((column) => (
            <label key={column.key} className="check-row rpt-column">
              <input type="checkbox" name="col" value={column.key} checked={columns.includes(column.key)} onChange={(event) => toggle(column.key, event.target.checked)} />
              <span>{column.label}</span>
              {column.salary && <Badge tone="warning">Salary</Badge>}
              {column.pii && <Badge tone="info">Masked</Badge>}
            </label>
          ))}
        </div>
        {error("columns") && (
          <p id="rb-columns-error" className="field-error">
            {error("columns")}
          </p>
        )}
      </fieldset>

      <fieldset className="rpt-fieldset" key={`filters-${datasetId}`}>
        <legend>Filters</legend>
        <div className="rpt-fields">
          {dataset.filters.includes("month") && (
            <div className="form-field">
              <label htmlFor="rb-month">Month</label>
              <input id="rb-month" className="input" type="month" name="month" defaultValue={monthDefault} max={currentMonth} required aria-invalid={Boolean(error("month"))} />
              {error("month") && <p className="field-error">{error("month")}</p>}
            </div>
          )}
          {dataset.filters.includes("range") && (
            <>
              <div className="form-field">
                <label htmlFor="rb-from">From</label>
                <input id="rb-from" className="input" type="date" name="from" defaultValue={filters?.from ?? ""} />
              </div>
              <div className="form-field">
                <label htmlFor="rb-to">To</label>
                <input id="rb-to" className="input" type="date" name="to" defaultValue={filters?.to ?? ""} aria-invalid={Boolean(error("to"))} aria-describedby={error("to") ? "rb-to-error" : undefined} />
                {error("to") && (
                  <p id="rb-to-error" className="field-error">
                    {error("to")}
                  </p>
                )}
              </div>
            </>
          )}
          {dataset.filters.includes("leaveState") && (
            <div className="form-field">
              <label htmlFor="rb-leave-state">Leave state</label>
              <select id="rb-leave-state" name="leaveState" className="input select" defaultValue={filters?.leaveState ?? ""}>
                {leaveStates.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          )}
          {dataset.filters.includes("department") && (
            <div className="form-field">
              <label htmlFor="rb-department">Department</label>
              <select id="rb-department" name="department" className="input select" defaultValue={filters?.department ?? ""}>
                <option value="">All departments</option>
                {departments.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {dataset.filters.includes("location") && (
            <div className="form-field">
              <label htmlFor="rb-location">Location</label>
              <select id="rb-location" name="location" className="input select" defaultValue={filters?.location ?? ""}>
                <option value="">All locations</option>
                {locations.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {dataset.filters.includes("status") && (
            <div className="form-field">
              <label htmlFor="rb-status">Employee status</label>
              <select id="rb-status" name="status" className="input select" defaultValue={filters?.status ?? ""}>
                {statusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </fieldset>

      <fieldset className="rpt-fieldset" key={`sort-${datasetId}`}>
        <legend>Sort and group</legend>
        <div className="rpt-fields">
          <div className="form-field">
            <label htmlFor="rb-sort">Sort by</label>
            <select id="rb-sort" name="sort" className="input select" defaultValue={fromInitial ? (initial.sort?.column ?? "") : ""}>
              <option value="">Default order</option>
              {grouped && <option value="count">Count</option>}
              {dataset.columns.map((column) => (
                <option key={column.key} value={column.key}>
                  {column.label}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="rb-dir">Direction</label>
            <select id="rb-dir" name="dir" className="input select" defaultValue={fromInitial ? (initial.sort?.direction ?? "asc") : "asc"}>
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
          </div>
        </div>
        <label className="check-row">
          <input type="checkbox" checked={grouped} onChange={(event) => setGrouped(event.target.checked)} />
          <span>Group rows and summarize</span>
        </label>
        {grouped && (
          <div className="rpt-fields">
            <div className="form-field">
              <label htmlFor="rb-group">Group by</label>
              <select id="rb-group" name="group" className="input select" defaultValue={fromInitial ? (initial.groupBy ?? groupable[0]?.key) : groupable[0]?.key} aria-invalid={Boolean(error("groupBy"))}>
                {groupable.map((column) => (
                  <option key={column.key} value={column.key}>
                    {column.label}
                  </option>
                ))}
              </select>
              {error("groupBy") && <p className="field-error">{error("groupBy")}</p>}
            </div>
            <div className="form-field">
              <label htmlFor="rb-agg">Summary</label>
              <select id="rb-agg" name="agg" className="input select" value={aggFn} onChange={(event) => setAggFn(event.target.value === "sum" || event.target.value === "avg" ? event.target.value : "count")}>
                <option value="count">Count only</option>
                <option value="sum" disabled={numeric.length === 0}>
                  Count and sum
                </option>
                <option value="avg" disabled={numeric.length === 0}>
                  Count and average
                </option>
              </select>
            </div>
            {aggFn !== "count" && (
              <div className="form-field">
                <label htmlFor="rb-agg-col">Of column</label>
                <select id="rb-agg-col" name="aggCol" className="input select" defaultValue={fromInitial ? (initial.aggregate?.column ?? numeric[0]?.key) : numeric[0]?.key} aria-invalid={Boolean(error("aggCol"))}>
                  {numeric.map((column) => (
                    <option key={column.key} value={column.key}>
                      {column.label}
                    </option>
                  ))}
                </select>
                {error("aggCol") && <p className="field-error">{error("aggCol")}</p>}
              </div>
            )}
          </div>
        )}
      </fieldset>
      {error("form") && <Alert tone="danger">{error("form")}</Alert>}
      <div className="sheet-actions">
        <Button type="submit">
          <AppIcon name="eye" size={20} />
          Run preview
        </Button>
      </div>
    </Form>
  );
}
