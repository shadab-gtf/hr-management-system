"use client";

import { FormSheet } from "@/components/features/admin/form-sheet";
import { AppIcon } from "@/components/ui/app-icon";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/display";
import { FormField, TextArea, TextInput, describedBy } from "@/components/ui/field";
import { useCommand } from "@/hooks/use-command";
import { applyAction, referAction } from "@/lib/actions/recruitment";

const err = (id: string, error: string | undefined, hint = false) => ({
  "aria-invalid": Boolean(error),
  "aria-describedby": describedBy(id, error, hint),
});
const resumeAccept = ".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Public application form. Values survive validation errors; success replaces the form. */
export function ApplyForm({ jobId, jobTitle }: { jobId: string; jobTitle: string }) {
  const { submit, pending, fieldError, formError, state } = useCommand(applyAction, { toast: false });
  if (state.status === "success")
    return (
      <Alert tone="success" title="Application received" live>
        Thanks for applying for {jobTitle}. Your reference is <strong>{state.reference}</strong>. Our talent team reviews every application and will contact you by email.
      </Alert>
    );
  return (
    <form onSubmit={submit} className="form" noValidate aria-label={`Apply for ${jobTitle}`}>
      <input type="hidden" name="jobId" value={jobId} />
      {/* Honeypot for bots; hidden from people and assistive technology. */}
      <div className="rec-honeypot" aria-hidden="true">
        <label htmlFor="ap-website">Website</label>
        <input id="ap-website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <FormField id="ap-name" label="Full name" required error={fieldError("name")}>
        <TextInput id="ap-name" name="name" autoComplete="name" maxLength={80} {...err("ap-name", fieldError("name"))} />
      </FormField>
      <div className="form-row">
        <FormField id="ap-email" label="Email" required error={fieldError("email")}>
          <TextInput id="ap-email" name="email" type="email" autoComplete="email" {...err("ap-email", fieldError("email"))} />
        </FormField>
        <FormField id="ap-phone" label="Mobile" required error={fieldError("phone")}>
          <TextInput id="ap-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="98100 12345" {...err("ap-phone", fieldError("phone"))} />
        </FormField>
      </div>
      <div className="form-row">
        <FormField id="ap-exp" label="Total experience (years)" required error={fieldError("experienceYears")}>
          <TextInput id="ap-exp" name="experienceYears" inputMode="decimal" placeholder="3.5" {...err("ap-exp", fieldError("experienceYears"))} />
        </FormField>
        <FormField id="ap-notice" label="Notice period (days)" error={fieldError("noticePeriodDays")}>
          <TextInput id="ap-notice" name="noticePeriodDays" type="number" min={0} max={180} inputMode="numeric" {...err("ap-notice", fieldError("noticePeriodDays"))} />
        </FormField>
      </div>
      <FormField id="ap-company" label="Current company" error={fieldError("currentCompany")}>
        <TextInput id="ap-company" name="currentCompany" autoComplete="organization" maxLength={80} {...err("ap-company", fieldError("currentCompany"))} />
      </FormField>
      <FormField id="ap-resume" label="Resume" required hint="PDF or Word, up to 5 MB." error={fieldError("resume")}>
        <input id="ap-resume" name="resume" type="file" className="input" accept={resumeAccept} {...err("ap-resume", fieldError("resume"), true)} />
      </FormField>
      <label className="check-row">
        <input type="checkbox" name="consent" aria-invalid={Boolean(fieldError("consent"))} aria-describedby={fieldError("consent") ? "ap-consent-error" : undefined} />
        <span>I agree that GTF Technologies may process my details to assess this application and keep them for up to 12 months for similar roles. I can ask for erasure at any time.</span>
      </label>
      {fieldError("consent") && (
        <p id="ap-consent-error" className="field-error">
          {fieldError("consent")}
        </p>
      )}
      {formError && (
        <Alert tone="danger" live>
          {formError}
        </Alert>
      )}
      <Button type="submit" pending={pending}>
        <AppIcon name="send" size={20} />
        {pending ? "Submitting…" : "Submit application"}
      </Button>
      <p className="muted small">Demo: the resume file itself isn&apos;t uploaded or stored — only its name and size are recorded.</p>
    </form>
  );
}

export function ReferralSheet({ jobId, jobTitle }: { jobId: string; jobTitle: string }) {
  return (
    <FormSheet action={referAction} title={`Refer for ${jobTitle}`} description="HR contacts them. You'll see a simple status here — never interview feedback or pay." trigger="Refer someone" triggerVariant="secondary" icon="share" submitLabel="Submit referral" pendingLabel="Submitting…">
      {(fieldError) => (
        <>
          <input type="hidden" name="jobId" value={jobId} />
          <FormField id="rf-name" label="Their full name" required error={fieldError("name")}>
            <TextInput id="rf-name" name="name" maxLength={80} {...err("rf-name", fieldError("name"))} />
          </FormField>
          <div className="form-row">
            <FormField id="rf-email" label="Their email" required error={fieldError("email")}>
              <TextInput id="rf-email" name="email" type="email" {...err("rf-email", fieldError("email"))} />
            </FormField>
            <FormField id="rf-phone" label="Their mobile" required error={fieldError("phone")}>
              <TextInput id="rf-phone" name="phone" type="tel" inputMode="tel" {...err("rf-phone", fieldError("phone"))} />
            </FormField>
          </div>
          <FormField id="rf-exp" label="Experience (years)" required error={fieldError("experienceYears")}>
            <TextInput id="rf-exp" name="experienceYears" inputMode="decimal" {...err("rf-exp", fieldError("experienceYears"))} />
          </FormField>
          <FormField id="rf-rel" label="How do you know them?" required error={fieldError("relationship")}>
            <TextArea id="rf-rel" name="relationship" rows={3} maxLength={300} {...err("rf-rel", fieldError("relationship"))} />
          </FormField>
          <FormField id="rf-resume" label="Resume (optional)" hint="PDF or Word, up to 5 MB." error={fieldError("resume")}>
            <input id="rf-resume" name="resume" type="file" className="input" accept={resumeAccept} {...err("rf-resume", fieldError("resume"), true)} />
          </FormField>
          <label className="check-row">
            <input type="checkbox" name="consent" aria-invalid={Boolean(fieldError("consent"))} />
            <span>They agreed to be referred and to GTF contacting them about this role.</span>
          </label>
          {fieldError("consent") && <p className="field-error">{fieldError("consent")}</p>}
        </>
      )}
    </FormSheet>
  );
}
