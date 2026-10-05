import Link from "next/link";
import { LetterRequestSheet } from "@/components/features/documents/letter-request-sheet";
import { letterOptions } from "@/lib/labels";
import { UploadDocumentSheet } from "@/components/features/documents/upload-document-sheet";
import { AppIcon, type IconName } from "@/components/ui/app-icon";
import { Card, CardHeader } from "@/components/ui/card";
import { ListRow, StatusBadge, TabsNav } from "@/components/ui/display";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { formatBytes, formatDate, formatDateTime, formatRelative } from "@/lib/utils/format";
import { scanStatus } from "@/lib/utils/tones";
import { MyPoliciesPanel } from "@/components/sections/lifecycle/policies-section";
import { Alert } from "@/components/ui/display";
import type { MyPolicy } from "@/types/lifecycle";
import type { LetterRequest } from "@/types/requests";
import type { HrDocument } from "@/types/workplace";

const categories: { key: HrDocument["category"]; label: string; icon: IconName; accent: "magenta" | "cyan" | "yellow" | "neutral" }[] = [
  { key: "employment", label: "Employment letters", icon: "document", accent: "cyan" },
  { key: "payroll", label: "Form 16 & tax", icon: "payslip", accent: "magenta" },
  { key: "policy", label: "Company policies", icon: "shield", accent: "yellow" },
  { key: "identity", label: "Identity proofs", icon: "profile", accent: "neutral" },
  { key: "other", label: "Other", icon: "documents", accent: "neutral" },
];

const letterStatus = {
  pending: { label: "Pending", tone: "warning" },
  in_progress: { label: "In progress", tone: "info" },
  issued: { label: "Issued", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
} as const;

export function DocumentsSection({
  documents,
  letters,
  tab,
  category,
  payslipCount,
  policies = [],
}: {
  documents: HrDocument[];
  letters: LetterRequest[];
  policies?: MyPolicy[];
  tab: "all" | "letters" | "policies";
  category: HrDocument["category"] | undefined;
  payslipCount: number;
}) {
  const pending = letters.filter((letter) => letter.state === "pending" || letter.state === "in_progress").length;
  const shown = category ? documents.filter((doc) => doc.category === category) : documents;
  const toAcknowledge = policies.filter((policy) => !policy.acknowledgedAt);
  return (
    <div className="page">
      <PageHeader
        title="Document center"
        description="All your documents in one place. Files open only after a successful security scan."
        actions={tab === "letters" ? <LetterRequestSheet /> : <UploadDocumentSheet />}
      />
      <div className="grid doc-tiles">
        {categories.map((item) => {
          const count = documents.filter((doc) => doc.category === item.key).length;
          return (
            <Link key={item.key} href={`/documents?category=${item.key}`} className="stat stat--link doc-tile" aria-current={category === item.key ? "page" : undefined}>
              <span className={`icon-tile avatar--${item.accent}`}>
                <AppIcon name={item.icon} />
              </span>
              <span className="doc-tile-text">
                <strong>{item.label}</strong>
                <span className="small muted">{count} file{count === 1 ? "" : "s"}</span>
              </span>
            </Link>
          );
        })}
        <Link href="/me/payslips" className="stat stat--link doc-tile">
          <span className="icon-tile avatar--cyan">
            <AppIcon name="wallet" />
          </span>
          <span className="doc-tile-text">
            <strong>Payslips</strong>
            <span className="small muted">{payslipCount} published</span>
          </span>
        </Link>
        <Link href="/documents?tab=letters" className="stat stat--link doc-tile" aria-current={tab === "letters" ? "page" : undefined}>
          <span className="icon-tile avatar--magenta">
            <AppIcon name="mail" />
          </span>
          <span className="doc-tile-text">
            <strong>Letters</strong>
            <span className="small muted">
              {pending} pending · {letters.length - pending} closed
            </span>
          </span>
        </Link>
      </div>

      {toAcknowledge.length > 0 && tab !== "policies" && (
        <Alert tone="warning" title={`${toAcknowledge.length} polic${toAcknowledge.length === 1 ? "y" : "ies"} to acknowledge`} action={<Link href="/documents?tab=policies" className="button button--secondary button--sm">Review</Link>}>
          {toAcknowledge.map((policy) => `${policy.title} ${policy.version} (due ${formatDate(policy.dueOn, "short")})`).join(" · ")}
        </Alert>
      )}

      <TabsNav
        label="Document views"
        tabs={[
          { href: "/documents", label: "Documents", active: tab === "all", count: documents.length },
          { href: "/documents?tab=letters", label: "Letter requests", active: tab === "letters", count: letters.length },
          { href: "/documents?tab=policies", label: "Acknowledgements", active: tab === "policies", count: toAcknowledge.length },
        ]}
      />

      {tab === "policies" ? (
        <MyPoliciesPanel policies={policies} />
      ) : tab === "letters" ? (
        <Card>
          {letters.length ? (
            <ul className="list">
              {letters.map((letter) => (
                <ListRow
                  key={letter.id}
                  leading={<span className="icon-tile avatar--neutral"><AppIcon name="mail" size={20} /></span>}
                  title={letterOptions.find((option) => option.value === letter.type)?.label ?? letter.type}
                  meta={`${letter.reference} · ${letter.purpose} · ${letter.issuedAt ? `Issued ${formatRelative(letter.issuedAt)}` : `Requested ${formatRelative(letter.requestedAt)}`}`}
                  trailing={<StatusBadge status={letterStatus[letter.state]} />}
                />
              ))}
            </ul>
          ) : (
            <EmptyState icon="mail" title="No letter requests" description="Can’t find the document you need? Request a letter from HR." action={<LetterRequestSheet />} />
          )}
        </Card>
      ) : (
        <Card labelledBy="docs-heading">
          <CardHeader
            id="docs-heading"
            title={category ? (categories.find((item) => item.key === category)?.label ?? "Documents") : "All documents"}
            description={`${shown.length} file${shown.length === 1 ? "" : "s"}`}
            action={category ? <Link href="/documents" className="inline-link small">Show all</Link> : undefined}
          />
          {shown.length ? (
            <ul className="list">
              {shown.map((doc) => (
                <ListRow
                  key={doc.id}
                  leading={<span className="file-icon">{doc.mime === "application/pdf" ? "PDF" : "IMG"}</span>}
                  title={doc.name}
                  meta={`${formatBytes(doc.sizeBytes)} · ${doc.uploadedBy} · ${formatDateTime(doc.uploadedAt)}`}
                  trailing={
                    doc.href ? (
                      <Link href={doc.href} className="button button--ghost button--sm">
                        <AppIcon name="eye" size={16} />
                        <span className="sr-only">Open {doc.name}</span>
                      </Link>
                    ) : doc.scanState === "clean" ? (
                      <span className="button button--ghost button--sm" aria-disabled="true" title="Secure download is available when connected to the HR service">
                        <AppIcon name="download" size={16} />
                        <span className="sr-only">Download {doc.name}</span>
                      </span>
                    ) : (
                      <StatusBadge status={scanStatus[doc.scanState]} />
                    )
                  }
                />
              ))}
            </ul>
          ) : (
            <EmptyState icon="documents" title="No documents here" description="Uploaded and issued documents will appear here." />
          )}
        </Card>
      )}
    </div>
  );
}
