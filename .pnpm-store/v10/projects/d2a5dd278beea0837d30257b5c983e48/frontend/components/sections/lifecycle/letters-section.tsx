import Link from "next/link";
import type { ReactNode } from "react";
import { PrintButton } from "@/components/features/payslips/print-button";
import { GenerateLetterForm, LetterPicker, TemplateSheet } from "@/components/features/lifecycle/letter-controls";
import { AppIcon } from "@/components/ui/app-icon";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Alert, ListRow } from "@/components/ui/display";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { formatDateTime, formatRelative } from "@/lib/utils/format";
import { letterKindLabels } from "@/components/sections/lifecycle/labels";
import type { IssuedLetter, LetterStudio } from "@/types/lifecycle";

export function LetterStudioSection({ studio, selection, tabs }: { studio: LetterStudio; selection: { templateId: string; employeeId: string; purpose: string; addressedTo: string }; tabs: ReactNode }) {
  const active = studio.templates.filter((template) => template.active);
  const preview = studio.preview;
  const person = studio.people.find((item) => item.id === selection.employeeId);
  const disabledReason = !preview ? "Choose a template and an employee." : preview.missing.length ? `Missing values: ${preview.missing.join(", ")}.` : null;
  return (
    <div className="page">
      <PageHeader eyebrow="HR admin" title="Letter templates" description="Templates with placeholders, a live preview for any employee, and issue straight to their Document center. Letter requests from employees use the same templates." actions={<TemplateSheet placeholders={studio.placeholders} />} />
      {tabs}
      <div className="split split--wide-aside">
        <Card labelledBy="lt-preview">
          <CardHeader id="lt-preview" title="Generate a letter" description="The preview updates as you choose; values come from the employee record." />
          <CardBody className="stack">
            <LetterPicker
              templates={active.map((template) => ({ value: template.id, label: template.name }))}
              people={studio.people.map((item) => ({ value: item.id, label: `${item.name} · ${item.code}${item.status === "exited" ? " (exited)" : item.status === "notice" ? " (notice)" : ""}` }))}
              {...selection}
            />
            {preview ? (
              <>
                {preview.missing.length > 0 && <Alert tone="warning" title="Some values are missing">{preview.missing.join(", ")} — highlighted in brackets below.</Alert>}
                <article className="lc-paper lc-paper--preview" aria-label="Letter preview">
                  <p className="lc-paper-org">GTF Technologies</p>
                  <h3 className="lc-paper-subject">{preview.subject}</h3>
                  <div className="lc-letter-body">{preview.body}</div>
                </article>
                <GenerateLetterForm {...selection} disabledReason={person?.id ? disabledReason : "Choose an employee."} />
              </>
            ) : (
              <EmptyState compact icon="document" title="Nothing to preview" description="Pick a template and an employee." />
            )}
          </CardBody>
        </Card>
        <Card labelledBy="lt-templates">
          <CardHeader id="lt-templates" title="Templates" description={`${active.length} active of ${studio.templates.length}`} />
          <ul className="list">
            {studio.templates.map((template) => (
              <ListRow
                key={template.id}
                leading={<span className="icon-tile avatar--neutral"><AppIcon name="document" size={20} /></span>}
                title={template.name}
                meta={`${letterKindLabels[template.kind]} · v${template.version} · ${template.issuedCount} issued · edited ${formatRelative(template.updatedAt)} by ${template.updatedBy}`}
                trailing={
                  <>
                    {!template.active && <Badge>Inactive</Badge>}
                    <TemplateSheet template={template} placeholders={studio.placeholders} />
                  </>
                }
              />
            ))}
          </ul>
        </Card>
      </div>
      <Card labelledBy="lt-issued">
        <CardHeader id="lt-issued" title="Recently issued" />
        <CardBody className="flush">
          <DataTable
            caption="Issued letters"
            rows={studio.issued}
            rowKey={(row) => row.id}
            empty={<EmptyState compact icon="mail" title="No letters issued" description="Generated letters appear here and in the employee's documents." />}
            mobileRow={(row) => ({ title: `${row.title} · ${row.person.name}`, meta: `${row.reference} · ${formatRelative(row.issuedAt)}`, href: row.href })}
            columns={[
              { key: "ref", header: "Reference", rowHeader: true, cell: (row) => <Link className="inline-link" href={row.href}>{row.reference}</Link> },
              { key: "title", header: "Letter", cell: (row) => row.title },
              { key: "person", header: "Employee", cell: (row) => `${row.person.name} (${row.employeeCode})` },
              { key: "by", header: "Issued by", cell: (row) => row.issuedBy },
              { key: "at", header: "Issued", cell: (row) => formatDateTime(row.issuedAt) },
            ]}
          />
        </CardBody>
      </Card>
    </div>
  );
}

export function IssuedLetterView({ letter, backHref }: { letter: IssuedLetter; backHref: string }) {
  return (
    <div className="page">
      <div className="no-print button-row">
        <ButtonLink href={backHref} variant="ghost">
          <AppIcon name="back" size={20} />
          Back
        </ButtonLink>
        <PrintButton label="Print / Save as PDF" />
      </div>
      <article className="lc-paper" aria-labelledby="letter-subject">
        <header className="lc-paper-head">
          <p className="lc-paper-org">GTF Technologies</p>
          <h1 id="letter-subject" className="lc-paper-subject">{letter.subject}</h1>
        </header>
        <div className="lc-letter-body">{letter.body}</div>
        <footer className="small muted lc-paper-foot">
          {letter.reference} · issued {formatDateTime(letter.issuedAt)} by {letter.issuedBy}
          {letter.templateName ? ` · template “${letter.templateName}”` : ""}. Generated from mock data; not digitally signed.
        </footer>
      </article>
    </div>
  );
}
