import { AssignmentSheet, ProposeTemplateSheet, StructureDecisionSheet } from "@/components/features/payroll/structure-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Alert, KeyValueList, MoneyText, PersonCell, StatusBadge } from "@/components/ui/display";
import { EmptyState } from "@/components/ui/empty-state";
import { SelectInput, TextInput } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { formatDateTime, formatMoney } from "@/lib/utils/format";
import type { Tone } from "@/types/common";
import type { StructureChange, Structures } from "@/types/statutory";

const changeStatus: Record<StructureChange["state"], { label: string; tone: Tone }> = {
  pending: { label: "Awaiting approval", tone: "warning" },
  approved: { label: "Approved · published", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
  withdrawn: { label: "Withdrawn", tone: "neutral" },
};

const whole = (amount: string) => String(Math.round(Number(amount)));

export function StructuresSection({ data }: { data: Structures }) {
  const pending = data.changes.filter((change) => change.state === "pending");
  const calc = data.calculator;
  return (
    <div className="page">
      <PageHeader
        eyebrow="Payroll"
        title="Salary structures"
        description="Templates turn an annual CTC into components. Payroll prepares changes; Finance approves before a new version is published."
        back={{ href: "/payroll", label: "Payroll" }}
      />
      {pending.length > 0 && (
        <Card labelledBy="pending-heading">
          <CardHeader id="pending-heading" title="Changes awaiting approval" description="Maker/checker: the preparer can't approve their own change" />
          <CardBody className="stack">
            {pending.map((change) => (
              <ChangeCard key={change.id} change={change} />
            ))}
          </CardBody>
        </Card>
      )}

      <div className="grid grid-2">
        {data.templates.map((template) => (
          <Card key={template.id} labelledBy={`tpl-${template.id}`}>
            <CardHeader
              id={`tpl-${template.id}`}
              title={template.name}
              description={`${template.description} · v${template.version}, published ${formatDateTime(template.publishedAt)} by ${template.publishedBy}`}
              action={template.pending ? <Badge tone="warning">Change pending</Badge> : data.canPrepare && !template.stipend ? <ProposeTemplateSheet template={{ ...template, conveyance: whole(template.conveyance.amount), lta: whole(template.lta.amount) }} /> : undefined}
            />
            <CardBody className="stack">
              {template.stipend ? (
                <p className="muted">Single stipend component. Not wages for EPF/ESI; TDS and PT still apply.</p>
              ) : (
                <dl className="lines">
                  <div className="line"><dt>Basic</dt><dd>{`${template.basicPctOfCtc}% of CTC`}</dd></div>
                  <div className="line"><dt>House rent allowance</dt><dd>{`${template.hraPctOfBasic}% of basic`}</dd></div>
                  <div className="line"><dt>Conveyance</dt><dd>{`${formatMoney(template.conveyance, { decimals: false })} / month`}</dd></div>
                  <div className="line"><dt>Leave travel allowance</dt><dd>{`${formatMoney(template.lta, { decimals: false })} / month`}</dd></div>
                  <div className="line"><dt>Special allowance</dt><dd>Balancing figure</dd></div>
                  <div className="line"><dt>Employer PF</dt><dd>{template.pf ? "12% of PF wages (in CTC)" : "Not in CTC"}</dd></div>
                  <div className="line"><dt>Gratuity provision</dt><dd>{template.gratuity ? "4.81% of basic" : "None"}</dd></div>
                </dl>
              )}
              <p className="field-hint">{`${template.employees} employee${template.employees === 1 ? "" : "s"} · ${template.groups.join(", ") || "Not assigned"}`}</p>
            </CardBody>
          </Card>
        ))}
      </div>

      <Card labelledBy="assign-heading">
        <CardHeader id="assign-heading" title="Template assignment" description="By employee type first, then by grade (derived from CTC band)" />
        <CardBody className="flush">
          <DataTable
            caption="Structure template by grade and employee type"
            rows={data.assignments}
            rowKey={(row) => row.key}
            mobileRow={(row) => ({ title: row.label, meta: `${row.templateName} · ${row.employees} employees`, trailing: row.pending ? <Badge tone="warning">Pending</Badge> : data.canPrepare ? <AssignmentSheet groupKey={row.key} label={row.label} current={row.templateId} templates={data.templates.map((item) => ({ id: item.id, name: item.name }))} /> : undefined })}
            columns={[
              { key: "group", header: "Grade / type", rowHeader: true, cell: (row) => row.label },
              { key: "template", header: "Template", cell: (row) => row.templateName },
              { key: "count", header: "Employees", align: "end", cell: (row) => <span className="num">{row.employees}</span> },
              {
                key: "action",
                header: "Action",
                align: "end",
                cell: (row) => (row.pending ? <Badge tone="warning">Change pending</Badge> : data.canPrepare ? <AssignmentSheet groupKey={row.key} label={row.label} current={row.templateId} templates={data.templates.map((item) => ({ id: item.id, name: item.name }))} /> : "—"),
              },
            ]}
          />
        </CardBody>
      </Card>

      <Card labelledBy="calc-heading">
        <CardHeader id="calc-heading" title="CTC breakup calculator" description="Enter an annual CTC to see the monthly and annual structure, employer costs and take-home" />
        <form className="toolbar" action="/payroll/structures" aria-label="CTC breakup calculator">
          <div className="toolbar-field">
            <label htmlFor="calc-ctc">Annual CTC (₹)</label>
            <TextInput id="calc-ctc" name="ctc" inputMode="numeric" defaultValue={data.calculatorInput.ctc} placeholder="1200000" pattern="\d{5,9}" required />
          </div>
          <div className="toolbar-field">
            <label htmlFor="calc-template">Template</label>
            <SelectInput id="calc-template" name="template" defaultValue={data.calculatorInput.templateId} options={data.templates.map((item) => ({ value: item.id, label: item.name }))} />
          </div>
          <div className="toolbar-field">
            <label htmlFor="calc-state">Work state</label>
            <SelectInput id="calc-state" name="state" defaultValue={data.calculatorInput.state} options={data.stateOptions} />
          </div>
          <div className="toolbar-field">
            <label htmlFor="calc-regime">Tax regime</label>
            <SelectInput id="calc-regime" name="regime" defaultValue={data.calculatorInput.regime} options={[{ value: "new", label: "New regime" }, { value: "old", label: "Old regime" }]} />
          </div>
          <div className="toolbar-actions">
            <Button type="submit">Calculate</Button>
          </div>
        </form>
        {calc ? (
          <CardBody className="stack">
            <KeyValueList
              columns={3}
              items={[
                { label: "Annual CTC", value: <MoneyText value={calc.annualCtc} className="cell-strong" /> },
                { label: "Monthly gross", value: <MoneyText value={calc.gross.monthly} /> },
                { label: "Estimated take-home / month", value: <MoneyText value={calc.takeHome.monthly} className="cell-strong" />, hint: `${formatMoney(calc.takeHome.annual)} a year` },
              ]}
            />
            <DataTable
              caption={`CTC breakup for ${formatMoney(calc.annualCtc)}`}
              rows={[
                ...calc.rows.filter((row) => row.kind === "earning"),
                { code: "GROSS", name: "Gross salary", kind: "earning" as const, monthly: calc.gross.monthly, annual: calc.gross.annual, note: null },
                ...calc.rows.filter((row) => row.kind === "employer"),
                { code: "CTC", name: "Cost to company", kind: "employer" as const, monthly: { amount: (Number(calc.annualCtc.amount) / 12).toFixed(2), currency: "INR" as const }, annual: calc.annualCtc, note: null },
                ...calc.rows.filter((row) => row.kind === "deduction"),
                { code: "NET", name: "Estimated take-home", kind: "deduction" as const, monthly: calc.takeHome.monthly, annual: calc.takeHome.annual, note: "Gross less employee deductions" },
              ]}
              rowKey={(row) => row.code}
              columns={[
                { key: "name", header: "Component", rowHeader: true, cell: (row) => <span className={["GROSS", "CTC", "NET"].includes(row.code) ? "cell-strong" : undefined}>{row.name}{row.note && <span className="kv-hint">{row.note}</span>}</span> },
                { key: "kind", header: "Type", cell: (row) => (row.kind === "earning" ? "Earning" : row.kind === "employer" ? "Employer cost" : "Deduction") },
                { key: "monthly", header: "Monthly", align: "end", cell: (row) => <MoneyText value={row.monthly} /> },
                { key: "annual", header: "Annual", align: "end", cell: (row) => <MoneyText value={row.annual} className="cell-strong" /> },
              ]}
            />
            {calc.warnings.map((warning) => (
              <p key={warning} className="field-hint">{warning}</p>
            ))}
            <p className="field-hint">{`Estimate for ${calc.stateName}, ${calc.regime} regime, no declarations. Mock calculation — not an offer or tax advice.`}</p>
          </CardBody>
        ) : (
          <EmptyState compact icon="calculator" title="Enter a CTC" description="Try ₹12,00,000 on the Standard template." />
        )}
      </Card>

      <Card labelledBy="history-heading">
        <CardHeader id="history-heading" title="Change history" />
        <CardBody className="stack">
          {data.changes.filter((change) => change.state !== "pending").length ? (
            data.changes.filter((change) => change.state !== "pending").map((change) => <ChangeCard key={change.id} change={change} />)
          ) : (
            <p className="muted">No decided changes yet.</p>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function ChangeCard({ change }: { change: StructureChange }) {
  return (
    <article className="stat-change" aria-label={`${change.reference} ${change.summary}`}>
      <div className="cluster">
        <strong>{change.reference}</strong>
        <span>{change.summary}</span>
        <StatusBadge status={changeStatus[change.state]} />
      </div>
      <PersonCell person={change.preparedBy} meta={`Prepared ${formatDateTime(change.preparedAt)}`} />
      <p>{change.reason}</p>
      {change.diff.length > 0 && (
        <dl className="lines">
          {change.diff.map((row) => (
            <div key={row.label} className="line">
              <dt>{row.label}</dt>
              <dd>{`${row.from} → ${row.to}`}</dd>
            </div>
          ))}
        </dl>
      )}
      <p className="field-hint">{`Impact: ${change.impact.employees} employee${change.impact.employees === 1 ? "" : "s"} · monthly gross change ${formatMoney(change.impact.monthlyGrossDelta)} (special allowance rebalances, CTC unchanged)`}</p>
      {change.decidedBy && <p className="field-hint">{`${changeStatus[change.state].label} by ${change.decidedBy}${change.decidedAt ? ` · ${formatDateTime(change.decidedAt)}` : ""}${change.decisionNote ? ` — ${change.decisionNote}` : ""}`}</p>}
      {change.state === "pending" && (
        <div className="cluster">
          {change.canDecide && <StructureDecisionSheet changeId={change.id} reference={change.reference} decision="approve" />}
          {change.canDecide && <StructureDecisionSheet changeId={change.id} reference={change.reference} decision="reject" />}
          {change.canWithdraw && <StructureDecisionSheet changeId={change.id} reference={change.reference} decision="withdraw" />}
          {change.blockedReason && (
            <Alert tone="info">{change.blockedReason}</Alert>
          )}
        </div>
      )}
    </article>
  );
}
