import { PrintButton } from "@/components/features/payslips/print-button";
import { Alert } from "@/components/ui/display";
import { PageHeader } from "@/components/ui/page-header";
import { formatDate, formatMoney } from "@/lib/utils/format";
import { employmentTypeLabels, type Offer } from "@/types/recruitment";

export function OfferLetterSection({ offer, today }: { offer: Offer; today: string }) {
  return (
    <div className="page">
      <PageHeader back={{ href: `/recruitment/candidates/${offer.candidateId}`, label: offer.candidateName }} eyebrow={offer.reference} title="Offer letter" actions={<PrintButton label="Print / Save as PDF" />} />
      {offer.state !== "extended" && offer.state !== "accepted" && (
        <div className="no-print">
          <Alert tone="warning">This offer is not extended yet — the letter is a draft preview.</Alert>
        </div>
      )}
      <article className="card rec-letter" aria-label="Offer letter">
        <header className="rec-letter-head">
          <div>
            <p className="rec-letter-org">GTF Technologies</p>
            <p className="muted small">GTF Technologies (sample entity) · Noida, Uttar Pradesh</p>
          </div>
          <div className="rec-letter-ref">
            <p className="small">Ref: {offer.reference}</p>
            <p className="small">Date: {formatDate(today, "long")}</p>
          </div>
        </header>
        <p>Dear {offer.candidateName},</p>
        <p>
          We are delighted to offer you the position of <strong>{offer.designation}</strong> in our {offer.department} team at {offer.location}, on a {employmentTypeLabels[offer.employmentType].toLowerCase()} basis, reporting to {offer.manager.name} ({offer.manager.designation}).
        </p>
        <dl className="rec-letter-terms">
          <div>
            <dt>Annual cost to company</dt>
            <dd className="num">{formatMoney(offer.ctc, { decimals: false })}</dd>
          </div>
          <div>
            <dt>Date of joining</dt>
            <dd>{formatDate(offer.joiningDate, "long")}</dd>
          </div>
          <div>
            <dt>Work location</dt>
            <dd>{offer.location}</dd>
          </div>
        </dl>
        <p>
          The detailed salary structure, statutory deductions and benefits will be shared in your appointment letter on joining. This offer is subject to satisfactory verification of your documents and references, and to the company&apos;s policies as amended from time to time.
        </p>
        <p>Please confirm your acceptance by replying to the talent team before your joining date.</p>
        <p className="rec-letter-sign">
          For GTF Technologies
          <br />
          <strong>{offer.createdBy.name}</strong>
          <br />
          <span className="muted">{offer.createdBy.designation}</span>
        </p>
        <p className="muted small rec-mock-note">Generated from mock data for preview. Not a legally issued or signed offer.</p>
      </article>
    </div>
  );
}
