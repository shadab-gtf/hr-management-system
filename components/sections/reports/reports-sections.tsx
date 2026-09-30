import Link from "next/link";
import type { ReactNode } from "react";
import { AppIcon, type IconName } from "@/components/ui/app-icon";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Alert, IconTile, PersonCell } from "@/components/ui/display";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { ColumnChart, PairedChart, SplitBars } from "@/components/sections/reports/report-charts";
import { addMonths } from "@/lib/utils/date";
import { formatDate, formatDateTime } from "@/lib/utils/format";
import type { ExportLogEntry, ReportAnalytics, ReportCategory, ReportLibrary, StandardReport } from "@/types/reports";

const categories: { id: ReportCategory; title: string; description: string; icon: IconName }[] = [
  { id: "people", title: "People", description: "Headcount, movements, probation and celebrations", icon: "people" },
  { id: "time", title: "Time & leave", description: "Attendance, late coming and leave", icon: "attendance" },
  { id: "payroll", title: "Payroll", description: "Salary figures — payroll and Finance only", icon: "payroll" },
];

export const statusOptions = [
  { value: "", label: "Current employees" },
  { value: "active", label: "Active" },
  { value: "on_leave", label: "On long leave" },
  { value: "onboarding", label: "Onboarding" },
  { value: "notice", label: "Serving notice" },
  { value: "exited", label: "Exited" },
];

function Select({ id, name, label, options, defaultValue = "" }: { id: string; name: string; label: string; options: { value: string; label: string }[]; defaultValue?: string }) {
  return (
    <div className="form-field">
      <label htmlFor={id}>{label}</label>
      <select id={id} name={name} className="input select" defaultValue={defaultValue}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function StandardReportItem({ report, library }: { report: StandardReport; library: ReportLibrary }) {
  const id = `rpt-${report.key}`;
  const defaultMonth = report.key === "salary_register" ? addMonths(library.currentMonth, -1) : library.currentMonth;
  const fields: ReactNode[] = [];
  for (const filter of report.filters) {
    if (filter === "month")
      fields.push(
        <div key="month" className="form-field">
          <label htmlFor={`${id}-month`}>{report.key === "attrition" ? "12 months ending" : "Month"}</label>
          <input id={`${id}-month`} className="input" type="month" name="month" defaultValue={defaultMonth} max={library.currentMonth} required />
        </div>,
      );
    if (filter === "range")
      fields.push(
        <div key="from" className="form-field">
          <label htmlFor={`${id}-from`}>From</label>
          <input id={`${id}-from`} className="input" type="date" name="from" max={library.today} aria-describedby={`${id}-range-hint`} />
        </div>,
        <div key="to" className="form-field">
          <label htmlFor={`${id}-to`}>To</label>
          <input id={`${id}-to`} className="input" type="date" name="to" max={library.today} aria-describedby={`${id}-range-hint`} />
        </div>,
      );
    if (filter === "department") fields.push(<Select key="department" id={`${id}-department`} name="department" label="Department" options={[{ value: "", label: "All departments" }, ...library.departments.map((name) => ({ value: name, label: name }))]} />);
    if (filter === "location") fields.push(<Select key="location" id={`${id}-location`} name="location" label="Location" options={[{ value: "", label: "All locations" }, ...library.locations.map((name) => ({ value: name, label: name }))]} />);
    if (filter === "status") fields.push(<Select key="status" id={`${id}-status`} name="status" label="Status" options={statusOptions} />);
  }
  return (
    <li className="rpt-item">
      <details>
        <summary>
          <span className="rpt-item-text">
            <strong>{report.title}</strong>
            <span className="small muted">{report.description}</span>
          </span>
          <AppIcon name="chevron" size={16} className="rpt-item-chevron" />
        </summary>
        <form className="rpt-form" action={`/api/reports/standard/${report.key}`} method="get" aria-label={`${report.title} download`}>
          <div className="rpt-fields">
            {fields}
            <Select id={`${id}-format`} name="format" label="Format" options={[{ value: "csv", label: "CSV" }, { value: "xls", label: "Excel (.xls)" }]} />
          </div>
          {report.filters.includes("range") && (
            <p id={`${id}-range-hint`} className="field-hint">
              {report.key === "leave_availed" ? "Leave blank for 1 January to today." : "Leave blank for the last 90 days."}
            </p>
          )}
          <button type="submit" className="button button--primary">
            <AppIcon name="download" size={20} />
            Download {report.title}
          </button>
        </form>
      </details>
    </li>
  );
}

export function ReportLibrarySection({ library }: { library: ReportLibrary }) {
  return (
    <section aria-labelledby="library-heading" className="stack">
      <div className="section-head">
        <div>
          <h2 id="library-heading">Standard reports</h2>
          <p>Pick filters and download. Every download rechecks your access and is recorded in the export log.</p>
        </div>
      </div>
      <div className="grid grid-2 rpt-library">
        {categories.map((category) => {
          const reports = library.reports.filter((report) => report.category === category.id);
          if (category.id === "payroll" && !library.salaryAccess) return null;
          return (
            <Card key={category.id} labelledBy={`cat-${category.id}`}>
              <CardHeader id={`cat-${category.id}`} title={category.title} description={category.description} action={<IconTile icon={category.icon} accent="neutral" />} />
              <ul className="rpt-items">
                {reports.map((report) => (
                  <StandardReportItem key={report.key} report={report} library={library} />
                ))}
              </ul>
            </Card>
          );
        })}
        <Card labelledBy="cat-compliance">
          <CardHeader id="cat-compliance" title="Compliance" description="PF, ESI, professional tax, LWF and TDS returns" action={<IconTile icon="security" accent="neutral" />} />
          <CardBody className="stack">
            {library.statutoryAccess ? (
              <>
                <p className="text-block">Statutory summaries, ECR and challan files are prepared in Statutory compliance, where each filing keeps its own maker/checker trail.</p>
                <ButtonLink href="/payroll/statutory" variant="secondary" size="sm">
                  Open statutory compliance
                  <AppIcon name="chevronRight" size={16} />
                </ButtonLink>
              </>
            ) : (
              <p className="text-block muted">Statutory returns are owned by Payroll and Finance. Ask a payroll operator for the PF/ESI/PT summary.</p>
            )}
            {!library.salaryAccess && <Alert tone="info">Salary reports are hidden for your role. They need payroll or compensation access.</Alert>}
          </CardBody>
        </Card>
      </div>
    </section>
  );
}

export function AnalyticsSection({ analytics }: { analytics: ReportAnalytics }) {
  const joiners = analytics.trend.reduce((sum, row) => sum + row.joiners, 0);
  const first = analytics.trend[0];
  const last = analytics.trend.at(-1);
  const genderTotal = analytics.byGender.reduce((sum, row) => sum + row.count, 0);
  return (
    <section aria-labelledby="analytics-heading" className="stack">
      <div className="section-head">
        <div>
          <h2 id="analytics-heading">Workforce analytics</h2>
          <p>As of {formatDate(analytics.asOf)}. Current employees; history includes synthetic former employees.</p>
        </div>
      </div>
      <div className="grid grid-stats">
        <StatCard label="Headcount" value={analytics.headcount} meta="Current employees" icon="people" accent="cyan" />
        <StatCard label="Joiners (12 months)" value={joiners} meta="New employees" icon="userAdd" accent="magenta" />
        <StatCard label="Leavers (12 months)" value={analytics.attrition.leavers} meta={`${analytics.attrition.voluntary} voluntary`} icon="userRemove" accent="yellow" />
        <StatCard label="Attrition (annual)" value={`${analytics.attrition.annualizedPct}%`} meta={`Avg headcount ${analytics.attrition.averageHeadcount}`} icon="chart" />
      </div>
      <div className="grid grid-2">
        <Card labelledBy="an-trend">
          <CardHeader id="an-trend" title="Headcount trend" description="Closing headcount, last 12 months" />
          <CardBody>
            <ColumnChart
              caption="Monthly closing headcount"
              summary={first && last ? `From ${first.headcount} in ${first.label} to ${last.headcount} in ${last.label}.` : "No data."}
              rows={analytics.trend.map((row) => ({ label: row.label, value: row.headcount }))}
              valueLabel="Headcount"
            />
          </CardBody>
        </Card>
        <Card labelledBy="an-moves">
          <CardHeader id="an-moves" title="Joiners vs leavers" description="Per month, last 12 months" />
          <CardBody>
            <PairedChart
              caption="Joiners and leavers per month"
              summary={`${joiners} joined and ${analytics.attrition.leavers} left in the last 12 months.`}
              rows={analytics.trend.map((row) => ({ label: row.label, a: row.joiners, b: row.leavers }))}
              labels={["Joiners", "Leavers"]}
            />
          </CardBody>
        </Card>
        <Card labelledBy="an-dept">
          <CardHeader id="an-dept" title="By department" />
          <CardBody>
            <SplitBars rows={analytics.byDepartment} total={analytics.headcount} />
          </CardBody>
        </Card>
        <Card labelledBy="an-loc">
          <CardHeader id="an-loc" title="By location" />
          <CardBody>
            <SplitBars rows={analytics.byLocation} tone="primary" total={analytics.headcount} />
          </CardBody>
        </Card>
        <Card labelledBy="an-gender">
          <CardHeader id="an-gender" title="Gender and employment type" description="Self-declared gender (synthetic demo data)" />
          <CardBody className="stack">
            <SplitBars rows={analytics.byGender} total={genderTotal} />
            <SplitBars rows={analytics.byType} tone="primary" total={analytics.headcount} />
          </CardBody>
        </Card>
        <Card labelledBy="an-tenure">
          <CardHeader id="an-tenure" title="Tenure bands" />
          <CardBody>
            <SplitBars rows={analytics.tenure} total={analytics.headcount} />
          </CardBody>
        </Card>
      </div>
      <Card labelledBy="an-attr">
        <CardHeader id="an-attr" title="Monthly attrition" description="Leavers ÷ average headcount, annualized (× 12)" />
        <CardBody className="flush">
          <DataTable
            caption="Monthly attrition, annualized"
            rows={analytics.trend}
            rowKey={(row) => row.month}
            columns={[
              { key: "m", header: "Month", rowHeader: true, cell: (row) => row.label },
              { key: "h", header: "Headcount", align: "end", cell: (row) => <span className="num">{row.headcount}</span> },
              { key: "j", header: "Joiners", align: "end", cell: (row) => <span className="num">{row.joiners}</span> },
              { key: "l", header: "Leavers", align: "end", cell: (row) => <span className="num">{row.leavers}</span> },
              { key: "a", header: "Attrition (annualized)", align: "end", cell: (row) => <span className="num">{row.attritionPct}%</span> },
            ]}
            mobileRow={(row) => ({ title: row.label, meta: `${row.headcount} people · +${row.joiners} / −${row.leavers}`, trailing: <span className="num">{row.attritionPct}%</span> })}
          />
        </CardBody>
      </Card>
    </section>
  );
}

const sourceLabel: Record<ExportLogEntry["source"], string> = { standard: "Standard", custom: "Custom", saved: "Saved report", schedule: "Schedule (mock)" };

export function ExportLogCard({ entries }: { entries: ExportLogEntry[] }) {
  return (
    <Card labelledBy="export-log">
      <CardHeader id="export-log" title="Export audit log" description="Who downloaded which report, when, and how many rows. Latest 50." />
      <CardBody className="flush">
        <DataTable
          caption="Report export audit log"
          rows={entries}
          rowKey={(row) => row.id}
          empty={<EmptyState compact icon="archive" title="No exports yet" description="Downloads and scheduled runs are recorded here." />}
          columns={[
            { key: "at", header: "When", cell: (row) => formatDateTime(row.at) },
            { key: "who", header: "Who", cell: (row) => <PersonCell person={row.actor} /> },
            { key: "report", header: "Report", rowHeader: true, cell: (row) => row.report },
            { key: "source", header: "Source", cell: (row) => `${sourceLabel[row.source]} · ${row.format.toUpperCase()}` },
            { key: "filters", header: "Filters", hideOnMobile: true, cell: (row) => <span className="small muted">{row.filters}</span> },
            { key: "rows", header: "Rows", align: "end", cell: (row) => <span className="num">{row.rowCount}</span> },
          ]}
          mobileRow={(row) => ({ title: row.report, meta: `${row.actor.name} · ${formatDateTime(row.at)} · ${sourceLabel[row.source]}`, trailing: <span className="num">{row.rowCount} rows</span> })}
        />
      </CardBody>
    </Card>
  );
}

export function ReportsPageSection({
  library,
  analytics,
  exports,
  canBuild,
  tabs,
}: {
  library: ReportLibrary;
  analytics: ReportAnalytics;
  exports: ExportLogEntry[];
  canBuild: boolean;
  tabs: ReactNode;
}) {
  return (
    <div className="page">
      <PageHeader
        eyebrow="HR admin"
        title="Reports"
        description="Standard reports, workforce analytics and the export audit log."
        actions={
          <>
            {canBuild && (
              <ButtonLink href="/admin/reports/builder" variant="primary">
                <AppIcon name="diagram" size={20} />
                Report builder
              </ButtonLink>
            )}
            <ButtonLink href="/api/reports/employees.csv" variant="secondary" prefetch={false}>
              <AppIcon name="download" size={20} />
              Employees CSV
            </ButtonLink>
          </>
        }
      />
      {tabs}
      <AnalyticsSection analytics={analytics} />
      <ReportLibrarySection library={library} />
      <ExportLogCard entries={exports} />
      <p className="small muted">
        Files are generated from mock data. Looking for a report that isn’t here?{" "}
        {canBuild ? (
          <Link href="/admin/reports/builder" className="inline-link">
            Build a custom report
          </Link>
        ) : (
          "Ask HR for a custom report."
        )}
      </p>
    </div>
  );
}
