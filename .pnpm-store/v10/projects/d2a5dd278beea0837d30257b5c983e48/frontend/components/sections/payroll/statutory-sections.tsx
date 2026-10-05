import type { ReactNode } from "react";
import {
  BankVerifyButtons,
  PfSettingsForm,
  PtSlabsSheet,
  RecordChallanSheet,
  StatutoryProfileSheet,
} from "@/components/features/payroll/statutory-controls";
import { AppIcon } from "@/components/ui/app-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Alert, DateText, KeyValueList, MoneyText, PersonCell, StatusBadge, TabsNav, Timeline } from "@/components/ui/display";
import { EmptyState } from "@/components/ui/empty-state";
import { SelectInput } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { formatDate, formatDateTime, formatMoney, formatMoneyCompact, pluralize } from "@/lib/utils/format";
import type { Money, Tone } from "@/types/common";
import type { ChallanStatus, Obligation, StatutoryEmployee, StatutoryEmployees, StatutoryHub, StatutorySetup } from "@/types/statutory";

export function StatutoryTabs({ active }: { active: "hub" | "employees" | "setup" }) {
  return (
    <TabsNav
      label="Statutory compliance"
      tabs={[
        { href: "/payroll/statutory", label: "Returns & challans", active: active === "hub" },
        { href: "/payroll/statutory/employees", label: "Employee statutory ids", active: active === "employees" },
        { href: "/payroll/statutory/setup", label: "Entities & rules", active: active === "setup" },
      ]}
    />
  );
}

const MockNote = ({ children }: { children: ReactNode }) => (
  <p className="notice-strip">
    <AppIcon name="info" size={16} />
    {children}
  </p>
);

const challanStatus: Record<ChallanStatus, { label: string; tone: Tone }> = {
  on_time: { label: "Paid on time", tone: "success" },
  late: { label: "Paid late", tone: "warning" },
  short: { label: "Short paid", tone: "danger" },
  overdue: { label: "Overdue", tone: "danger" },
  due: { label: "Due", tone: "info" },
};

const isZero = (money: Money) => Number(money.amount) === 0;

function FileLink({ href, label, enabled }: { href: string; label: string; enabled: boolean }) {
  if (!enabled)
    return (
      <span className="muted stat-file--off" title="Available after the run is approved">
        {label}
      </span>
    );
  return (
    <a className="button button--ghost button--sm" href={href} download>
      <AppIcon name="download" size={16} />
      {label}
    </a>
  );
}

export function StatutoryHubSection({ hub, today }: { hub: StatutoryHub; today: string }) {
  const final = hub.run?.final ?? true;
  const file = (name: string, entity: string) => `/api/statutory/${name}?month=${hub.month}&entity=${entity}`;
  return (
    <div className="page">
      <PageHeader
        eyebrow={hub.financialYear}
        title="Statutory compliance"
        description="EPF, ESI, professional tax, LWF and TDS for every legal entity — returns, due dates and challans in one place."
        actions={hub.canManage && hub.openObligations.length > 0 ? <RecordChallanSheet options={hub.openObligations.map((item) => ({ ...item, liability: item.liability.amount }))} today={today} /> : undefined}
      />
      <StatutoryTabs active="hub" />
      <Card>
        <form className="toolbar" action="/payroll/statutory" aria-label="Choose wage month">
          <div className="toolbar-field">
            <label htmlFor="stat-month">Wage month</label>
            <SelectInput id="stat-month" name="month" defaultValue={hub.month} options={hub.monthOptions} />
          </div>
          <div className="toolbar-actions">
            <Button type="submit" variant="secondary">
              Show
            </Button>
          </div>
        </form>
      </Card>
      <MockNote>Files are generated from mock payroll data in the published formats. Nothing is filed with EPFO, ESIC, state portals or TRACES.</MockNote>
      {!final && (
        <Alert tone="warning" title={`${hub.periodLabel} payroll is still open`}>
          Figures are provisional. Return files and challans become available after Finance approves the run.
        </Alert>
      )}
      {hub.dueSummary.overdue > 0 && (
        <Alert tone="danger" title={`${pluralize(hub.dueSummary.overdue, "liability", "liabilities")} overdue`}>
          Record the challan below once paid. Late deposits attract interest (and damages for EPF/ESI).
        </Alert>
      )}
      <div className="grid grid-stats">
        <StatCard label="EPF (employee + employer)" value={formatMoneyCompact(sumMoney(hub.totals.epfEmployee, hub.totals.epfEmployer, hub.totals.eps, hub.totals.edliAdmin))} meta={`EPS ${formatMoney(hub.totals.eps)} · EDLI/admin ${formatMoney(hub.totals.edliAdmin)}`} icon="shield" accent="cyan" />
        <StatCard label="TDS u/s 192" value={formatMoneyCompact(hub.totals.tds)} meta={formatMoney(hub.totals.tds)} icon="bank" accent="magenta" />
        <StatCard label="PT + LWF" value={formatMoneyCompact(sumMoney(hub.totals.pt, hub.totals.lwf))} meta={`PT ${formatMoney(hub.totals.pt)} · LWF ${formatMoney(hub.totals.lwf)}`} icon="buildings" accent="yellow" />
        <StatCard label="Challans this FY" value={`${hub.dueSummary.onTime + hub.dueSummary.late}/${hub.obligations.length}`} meta={`${hub.dueSummary.late} late · ${hub.dueSummary.overdue} overdue · ${hub.dueSummary.due} due`} icon="clipboardTick" />
      </div>

      <Card labelledBy="returns-heading">
        <CardHeader id="returns-heading" title={`Returns for ${hub.periodLabel}`} description="Per legal entity and registration" />
        <CardBody className="flush">
          <DataTable
            caption={`Statutory returns for ${hub.periodLabel}`}
            rows={hub.entities}
            rowKey={(row) => row.id}
            columns={[
              { key: "entity", header: "Entity", rowHeader: true, cell: (row) => <span className="person-text"><span className="person-name">{row.name}</span><span className="person-role">TAN {row.tan}</span></span> },
              {
                key: "epf",
                header: "EPF",
                cell: (row) => (
                  <span className="stat-cell">
                    <span>{`${row.pfMembers} members · ${formatMoney(row.pfTotal)}`}</span>
                    <span className="kv-hint">{row.epfCode}{row.pendingUan ? ` · ${row.pendingUan} without UAN (not in ECR)` : ""}</span>
                    <FileLink href={file("ecr.txt", row.id)} label="ECR (.txt)" enabled={final} />
                  </span>
                ),
              },
              {
                key: "esi",
                header: "ESI",
                cell: (row) => (
                  <span className="stat-cell">
                    <span>{`${row.esiMembers} insured · ${formatMoney(row.esiTotal)}`}</span>
                    <span className="kv-hint">{row.esicCode}</span>
                    <FileLink href={file("esi.csv", row.id)} label="ESI (.csv)" enabled={final} />
                  </span>
                ),
              },
              {
                key: "tds",
                header: "TDS",
                cell: (row) => (
                  <span className="stat-cell">
                    <span>{`${row.tdsDeductees} deductees · ${formatMoney(row.tdsTotal)}`}</span>
                    <FileLink href={file("24q.csv", row.id)} label="24Q annexure (.csv)" enabled={final} />
                  </span>
                ),
              },
              {
                key: "state",
                header: "State returns",
                cell: (row) => (
                  <span className="stat-cell">
                    <FileLink href={file("pt.csv", row.id)} label="PT (.csv)" enabled={final} />
                    <FileLink href={file("lwf.csv", row.id)} label="LWF (.csv)" enabled={final} />
                  </span>
                ),
              },
            ]}
          />
        </CardBody>
      </Card>

      <div className="grid grid-2">
        <Card labelledBy="pt-heading">
          <CardHeader id="pt-heading" title="Professional tax by state" description="Slabs are data-driven — edit them under Entities & rules" />
          <CardBody className="flush">
            <DataTable
              caption="Professional tax by state"
              rows={hub.pt}
              rowKey={(row) => `${row.entity}-${row.state}`}
              mobileRow={(row) => ({ title: `${row.stateName} · ${row.entity}`, meta: row.slabs.length ? `${row.employees} employees · due ${row.dueOn ? formatDate(row.dueOn) : "—"}` : `${row.employees} employees · no PT in this state`, trailing: <MoneyText value={row.amount} className="cell-strong" /> })}
              columns={[
                { key: "state", header: "State", rowHeader: true, cell: (row) => <span className="person-text"><span className="person-name">{row.stateName}</span><span className="person-role">{row.entity}{row.registration ? ` · ${row.registration}` : ""}</span></span> },
                { key: "count", header: "Employees", align: "end", cell: (row) => <span className="num">{row.employees}</span> },
                { key: "slabs", header: "Slabs applied", className: "cell-wrap", cell: (row) => (row.slabs.length ? row.slabs.map((slab) => `${slab.label} × ${slab.count}`).join("; ") : <span className="muted">No professional tax</span>) },
                { key: "amount", header: "PT", align: "end", cell: (row) => <MoneyText value={row.amount} className="cell-strong" /> },
                { key: "due", header: "Due", cell: (row) => (row.dueOn ? <DateText value={row.dueOn} /> : "—") },
              ]}
            />
          </CardBody>
        </Card>
        <Card labelledBy="lwf-heading">
          <CardHeader id="lwf-heading" title="Labour welfare fund" description="Deducted per each state's schedule" />
          <CardBody className="flush">
            <DataTable
              caption="Labour welfare fund by state"
              rows={hub.lwf}
              rowKey={(row) => `${row.entity}-${row.state}`}
              mobileRow={(row) => ({ title: `${row.stateName} · ${row.entity}`, meta: row.schedule, trailing: <MoneyText value={row.employee} className="cell-strong" /> })}
              columns={[
                { key: "state", header: "State", rowHeader: true, cell: (row) => <span className="person-text"><span className="person-name">{row.stateName}</span><span className="person-role">{row.entity}</span></span> },
                { key: "schedule", header: "Schedule", className: "cell-wrap", cell: (row) => row.schedule },
                { key: "employee", header: "Employee", align: "end", cell: (row) => <MoneyText value={row.employee} /> },
                { key: "employer", header: "Employer", align: "end", cell: (row) => <MoneyText value={row.employer} /> },
                { key: "due", header: "Due", cell: (row) => (row.dueOn ? <DateText value={row.dueOn} /> : isZero(row.employee) ? "Not this month" : "—") },
              ]}
            />
          </CardBody>
        </Card>
      </div>

      <div className="grid grid-2">
        <Card labelledBy="tds-heading">
          <CardHeader id="tds-heading" title={`TDS · ${hub.tds.quarter}`} description={`24Q return due ${formatDate(hub.tds.returnDueOn)}`} />
          <CardBody className="flush">
            <DataTable
              caption="TDS by month for the quarter"
              rows={hub.tds.months}
              rowKey={(row) => row.month}
              columns={[
                { key: "month", header: "Month", rowHeader: true, cell: (row) => <span>{row.label}{!row.final && <span className="kv-hint">Open run</span>}</span> },
                { key: "deductees", header: "Deductees", align: "end", cell: (row) => <span className="num">{row.deductees}</span> },
                { key: "amount", header: "Deducted", align: "end", cell: (row) => <MoneyText value={row.amount} /> },
                { key: "deposited", header: "Deposited", align: "end", cell: (row) => <MoneyText value={row.deposited} /> },
              ]}
            />
          </CardBody>
        </Card>
        <Card labelledBy="esi-heading">
          <CardHeader id="esi-heading" title="ESI coverage" description="0.75% employee · 3.25% employer" />
          <CardBody>
            <p>{hub.esiNote}</p>
          </CardBody>
        </Card>
      </div>

      <Card labelledBy="register-heading">
        <CardHeader id="register-heading" title="Challan register" description={`${hub.financialYear} · PF/ESI due on the 15th, TDS on the 7th (March: 30 April), PT and LWF per state`} />
        <CardBody className="flush">
          <DataTable<Obligation>
            caption="Challan register"
            rows={hub.obligations}
            rowKey={(row) => row.key}
            mobileRow={(row) => ({
              title: `${row.typeLabel} · ${row.periodLabel}`,
              meta: `${row.entity}${row.state ? ` · ${row.state}` : ""} · due ${formatDate(row.dueOn)}${row.challan ? ` · paid ${formatDate(row.challan.paidOn)}` : ""}`,
              trailing: <StatusBadge status={challanStatus[row.status]} />,
            })}
            empty={<EmptyState compact icon="clipboardTick" title="No liabilities yet" description="Liabilities appear once a payroll run is approved." />}
            columns={[
              { key: "type", header: "Type", rowHeader: true, cell: (row) => <span className="person-text"><span className="person-name">{row.typeLabel}</span><span className="person-role">{row.entity}{row.state ? ` · ${row.state}` : ""}</span></span> },
              { key: "period", header: "Period", cell: (row) => row.periodLabel },
              { key: "liability", header: "Liability", align: "end", cell: (row) => <MoneyText value={row.liability} /> },
              { key: "due", header: "Due", cell: (row) => <DateText value={row.dueOn} /> },
              {
                key: "challan",
                header: "Challan",
                className: "cell-wrap",
                cell: (row) =>
                  row.challan ? (
                    <span className="person-text">
                      <span>{`${formatMoney(row.challan.amount)} · ${formatDate(row.challan.paidOn)}`}</span>
                      <span className="person-role">{`${row.challan.bsrCode ? `BSR ${row.challan.bsrCode} · ` : ""}No. ${row.challan.challanNo}`}</span>
                    </span>
                  ) : hub.canManage ? (
                    <RecordChallanSheet options={hub.openObligations.map((item) => ({ ...item, liability: item.liability.amount }))} today={today} preselect={row.key} />
                  ) : (
                    "—"
                  ),
              },
              { key: "status", header: "Status", cell: (row) => <span className="stat-cell"><StatusBadge status={challanStatus[row.status]} />{row.daysLate > 0 && <span className="kv-hint">{`${row.daysLate} day${row.daysLate === 1 ? "" : "s"} ${row.status === "overdue" ? "overdue" : "late"}`}</span>}</span> },
            ]}
          />
        </CardBody>
      </Card>
    </div>
  );
}

function sumMoney(...values: Money[]): Money {
  const paise = values.reduce((total, value) => total + Math.round(Number(value.amount) * 100), 0);
  return { amount: (paise / 100).toFixed(2), currency: "INR" };
}

/* Employees ---------------------------------------------------------------- */

const pfLabel = { member: { label: "EPF member", tone: "success" }, opted_out: { label: "Opted out", tone: "neutral" }, not_applicable: { label: "Not applicable", tone: "neutral" } } as const;
const bankLabel = { verified: { label: "Verified", tone: "success" }, pending: { label: "Pending verification", tone: "warning" }, failed: { label: "Failed", tone: "danger" } } as const;

export function StatutoryEmployeesSection({ data }: { data: StatutoryEmployees }) {
  return (
    <div className="page">
      <PageHeader title="Statutory compliance" description="UAN, PF membership, ESI, PAN and salary bank accounts for everyone on payroll." />
      <StatutoryTabs active="employees" />
      <div className="grid grid-stats">
        <StatCard label="On payroll" value={data.counts.total} icon="people" />
        <StatCard label="UAN pending" value={data.counts.uanPending} meta="Left out of the ECR until linked" icon="shield" accent="yellow" />
        <StatCard label="PAN missing" value={data.counts.panMissing} meta="TDS at 20% (section 206AA)" icon="card" accent="magenta" />
        <StatCard label="Bank unverified" value={data.counts.bankPending} meta="Excluded from bank advice" icon="bank" accent="cyan" />
      </div>
      <MockNote>Identifiers are synthetic, format-valid placeholders. Bank verification is simulated (no penny drop).</MockNote>
      <Card>
        <CardBody className="flush">
          <DataTable<StatutoryEmployee>
            caption="Employee statutory identifiers"
            rows={data.rows}
            rowKey={(row) => row.employee.id}
            mobileRow={(row) => ({
              title: row.employee.name,
              meta: `UAN ${row.uan ?? "pending"} · PAN ${row.panMasked ?? "missing"} · ${row.bank.name} ${row.bank.accountMasked}`,
              trailing: row.issues.length ? <Badge tone="warning">{row.issues[0] ?? ""}</Badge> : <Badge tone="success">Complete</Badge>,
            })}
            columns={[
              { key: "employee", header: "Employee", rowHeader: true, cell: (row) => <PersonCell person={row.employee} meta={`${row.code} · ${row.entity} · ${row.state}`} /> },
              {
                key: "pf",
                header: "PF",
                cell: (row) => (
                  <span className="stat-cell">
                    <StatusBadge status={pfLabel[row.pfStatus]} />
                    <span className="kv-hint">{row.uan ? `UAN ${row.uan}` : row.pfStatus === "member" ? "UAN pending" : ""}</span>
                    {row.pfMemberId && <span className="kv-hint digest">{row.pfMemberId}</span>}
                    {row.vpfPercent > 0 && <span className="kv-hint">{`VPF ${row.vpfPercent}%`}</span>}
                  </span>
                ),
              },
              { key: "esi", header: "ESI IP", cell: (row) => row.esiIp ?? <span className="muted">Not covered</span> },
              { key: "pan", header: "PAN", cell: (row) => row.panMasked ?? <Badge tone="danger">Missing</Badge> },
              {
                key: "bank",
                header: "Salary account",
                cell: (row) => (
                  <span className="stat-cell">
                    <span>{`${row.bank.name} · ${row.bank.accountMasked}`}</span>
                    <span className="kv-hint">{`IFSC ${row.bank.ifsc}${row.bank.changedAt ? ` · changed ${formatDateTime(row.bank.changedAt)}` : ""}`}</span>
                    <StatusBadge status={bankLabel[row.bank.status]} />
                    {data.canVerifyBank && row.bank.status === "pending" && <BankVerifyButtons employeeId={row.employee.id} />}
                  </span>
                ),
              },
              ...(data.canEdit ? [{ key: "edit", header: "Action", align: "end" as const, cell: (row: StatutoryEmployee) => <StatutoryProfileSheet row={row} /> }] : []),
            ]}
          />
        </CardBody>
      </Card>
    </div>
  );
}

/* Setup -------------------------------------------------------------------- */

const wholeRupees = (money: Money) => String(Math.round(Number(money.amount)));

export function StatutorySetupSection({ data }: { data: StatutorySetup }) {
  return (
    <div className="page">
      <PageHeader title="Statutory compliance" description="Legal entities, registrations, location mapping and the rules the payroll engine applies." />
      <StatutoryTabs active="setup" />
      <MockNote>Registration numbers are synthetic placeholders. Finance must verify real registrations and current rates from official sources before go-live.</MockNote>
      <div className="grid grid-2">
        {data.entities.map((entity) => (
          <Card key={entity.id} labelledBy={`ent-${entity.id}`}>
            <CardHeader id={`ent-${entity.id}`} title={entity.name} description={entity.address} />
            <CardBody className="stack">
              <KeyValueList
                columns={2}
                items={[
                  { label: "PAN", value: entity.pan },
                  { label: "TAN", value: entity.tan },
                  { label: "EPF establishment", value: <span className="digest">{entity.epfCode}</span> },
                  { label: "ESIC employer code", value: <span className="digest">{entity.esicCode}</span> },
                  { label: "Salary debit account", value: entity.debitBank },
                  { label: "Work locations", value: entity.locations.join(", ") || "—" },
                ]}
              />
              <KeyValueList
                columns={1}
                items={[
                  { label: "PT registrations", value: entity.pt.length ? entity.pt.map((item) => `${item.state}: ${item.registration}`).join(" · ") : "None" },
                  { label: "LWF registrations", value: entity.lwf.length ? entity.lwf.map((item) => `${item.state}: ${item.registration}`).join(" · ") : "None" },
                ]}
              />
            </CardBody>
          </Card>
        ))}
      </div>

      <div className="split">
        <Card labelledBy="loc-heading">
          <CardHeader id="loc-heading" title="Work location mapping" description="Decides the entity and the PT/LWF state for each employee" />
          <CardBody className="flush">
            <DataTable
              caption="Work location to entity and state"
              rows={data.locations}
              rowKey={(row) => row.location}
              columns={[
                { key: "location", header: "Location", rowHeader: true, cell: (row) => row.location },
                { key: "entity", header: "Entity", cell: (row) => row.entity },
                { key: "state", header: "PT/LWF state", className: "cell-wrap", cell: (row) => (row.mapped ? row.state : <span className="text-danger">{row.state}</span>) },
                { key: "count", header: "Employees", align: "end", cell: (row) => <span className="num">{row.headcount}</span> },
              ]}
            />
          </CardBody>
        </Card>
        <Card labelledBy="pf-heading">
          <CardHeader id="pf-heading" title="EPF & ESI rules" description={`EPF 12% + 12% (EPS 8.33% capped ₹1,250) · EDLI 0.5% · admin 0.5% · ceiling ${formatMoney(data.pf.ceiling, { decimals: false })}`} />
          <CardBody>
            {data.canManage ? (
              <PfSettingsForm wageBasis={data.pf.wageBasis} esiCeiling={wholeRupees(data.esi.ceiling)} version={data.settingsVersion} />
            ) : (
              <KeyValueList columns={1} items={[{ label: "EPF wage basis", value: data.pf.wageBasis }, { label: "ESI ceiling", value: formatMoney(data.esi.ceiling) }]} />
            )}
          </CardBody>
        </Card>
      </div>

      <Card labelledBy="ptrules-heading">
        <CardHeader id="ptrules-heading" title="Professional tax slabs" description="Monthly gross slabs per state. Annual PT is capped at ₹2,500 (Article 276)." />
        <CardBody className="flush">
          <DataTable
            caption="Professional tax slabs by state"
            rows={data.pt}
            rowKey={(row) => row.state}
            mobileRow={(row) => ({ title: row.stateName, meta: row.slabs.length ? `${row.slabs.length} slabs · ${row.due}` : "No professional tax", trailing: data.canManage ? <PtSlabsSheet state={row.state} stateName={row.stateName} version={data.settingsVersion} slabs={row.slabs.map((slab) => ({ from: wholeRupees(slab.from), to: slab.to ? wholeRupees(slab.to) : "", monthly: wholeRupees(slab.monthly), february: wholeRupees(slab.february) }))} /> : undefined })}
            columns={[
              { key: "state", header: "State", rowHeader: true, cell: (row) => row.stateName },
              {
                key: "slabs",
                header: "Slabs (monthly gross → PT)",
                className: "cell-wrap",
                cell: (row) =>
                  row.slabs.length ? (
                    <ul className="stat-slab-list">
                      {row.slabs.map((slab) => (
                        <li key={slab.from.amount}>
                          {`${formatMoney(slab.from, { decimals: false })} ${slab.to ? `– ${formatMoney(slab.to, { decimals: false })}` : "and above"}: ${formatMoney(slab.monthly, { decimals: false })}${slab.february.amount !== slab.monthly.amount ? ` (February ${formatMoney(slab.february, { decimals: false })})` : ""}`}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="muted">No professional tax</span>
                  ),
              },
              { key: "due", header: "Due", cell: (row) => row.due },
              ...(data.canManage
                ? [{ key: "edit", header: "Action", align: "end" as const, cell: (row: StatutorySetup["pt"][number]) => <PtSlabsSheet state={row.state} stateName={row.stateName} version={data.settingsVersion} slabs={row.slabs.map((slab) => ({ from: wholeRupees(slab.from), to: slab.to ? wholeRupees(slab.to) : "", monthly: wholeRupees(slab.monthly), february: wholeRupees(slab.february) }))} /> }]
                : []),
            ]}
          />
        </CardBody>
      </Card>

      <div className="split">
        <Card labelledBy="lwfrules-heading">
          <CardHeader id="lwfrules-heading" title="Labour welfare fund rules" />
          <CardBody className="flush">
            <DataTable
              caption="Labour welfare fund rules by state"
              rows={data.lwf}
              rowKey={(row) => row.state}
              columns={[
                { key: "state", header: "State", rowHeader: true, cell: (row) => row.stateName },
                { key: "schedule", header: "When", cell: (row) => row.schedule },
                { key: "employee", header: "Employee", className: "cell-wrap", cell: (row) => row.employee },
                { key: "employer", header: "Employer", cell: (row) => row.employer },
                { key: "due", header: "Due", cell: (row) => row.due },
              ]}
            />
          </CardBody>
        </Card>
        <Card labelledBy="saudit-heading">
          <CardHeader id="saudit-heading" title="Change log" />
          <CardBody>
            {data.audit.length ? <Timeline items={data.audit.map((entry, index) => ({ id: String(index), title: entry.event, meta: `${entry.actor} · ${formatDateTime(entry.at)}` }))} /> : <p className="muted">No changes yet.</p>}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
