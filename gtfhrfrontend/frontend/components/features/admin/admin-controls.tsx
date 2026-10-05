"use client";

import { useOptimistic, useRef, useTransition } from "react";
import { toast } from "sonner";
import { AppIcon } from "@/components/ui/app-icon";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/display";
import { FormField, SelectInput, TextArea, TextInput, describedBy } from "@/components/ui/field";
import { FormSheet } from "@/components/features/admin/form-sheet";
import { DraftNotice } from "@/components/features/drafts/draft-notice";
import { useCommand } from "@/hooks/use-command";
import { archiveAnnouncementAction, publishAnnouncementAction, toggleOnboardingTaskAction } from "@/lib/actions/admin";
import type { Announcement } from "@/types/workplace";

/** Checklist toggle; reverts automatically if the server rejects it. */
export function OnboardingTaskToggle({ employeeId, taskId, title, done }: { employeeId: string; taskId: string; title: string; done: boolean }) {
  const [checked, setChecked] = useOptimistic(done);
  const [pending, startTransition] = useTransition();
  return (
    <label className="check-row task-row" data-done={checked || undefined}>
      <input
        type="checkbox"
        checked={checked}
        disabled={pending}
        onChange={(event) => {
          const next = event.target.checked;
          startTransition(async () => {
            setChecked(next);
            const result = await toggleOnboardingTaskAction(employeeId, taskId, next);
            if (result.status === "error") toast.error(result.message);
          });
        }}
      />
      <span>{title}</span>
    </label>
  );
}

const categories = [
  { value: "general", label: "General" },
  { value: "policy", label: "Policy" },
  { value: "event", label: "Event" },
  { value: "celebration", label: "Celebration" },
  { value: "it", label: "IT" },
];

function AnnouncementFields({ prefix, departments, fieldError, announcement }: { prefix: string; departments: string[]; fieldError: (name: string) => string | undefined; announcement?: Announcement }) {
  const scheduled = announcement?.status === "scheduled";
  return (
    <>
      {announcement && <input type="hidden" name="id" value={announcement.id} />}
      <FormField id={`${prefix}-title`} label="Title" required error={fieldError("title")}>
        <TextInput id={`${prefix}-title`} name="title" defaultValue={announcement?.title} maxLength={120} aria-invalid={Boolean(fieldError("title"))} aria-describedby={describedBy(`${prefix}-title`, fieldError("title"))} />
      </FormField>
      <FormField id={`${prefix}-body`} label="Message" required error={fieldError("body")} hint="Visible to the chosen audience.">
        <TextArea id={`${prefix}-body`} name="body" rows={5} maxLength={2000} defaultValue={announcement?.body} aria-invalid={Boolean(fieldError("body"))} aria-describedby={describedBy(`${prefix}-body`, fieldError("body"), true)} />
      </FormField>
      <div className="form-row">
        <FormField id={`${prefix}-category`} label="Category" required>
          <SelectInput id={`${prefix}-category`} name="category" defaultValue={announcement?.category ?? "general"} options={categories} />
        </FormField>
        <FormField id={`${prefix}-audience`} label="Audience" required error={fieldError("audience")}>
          <SelectInput id={`${prefix}-audience`} name="audience" defaultValue={announcement?.audience ?? "Everyone"} options={[{ value: "Everyone", label: "Everyone" }, ...departments.map((d) => ({ value: d, label: d }))]} />
        </FormField>
      </div>
      {(!announcement || scheduled) && (
        <FormField id={`${prefix}-at`} label="Publish at" error={fieldError("publishAt")} hint="Leave empty to publish now. Time is India Standard Time.">
          <TextInput id={`${prefix}-at`} name="publishAt" type="datetime-local" defaultValue={scheduled && announcement ? toLocalInput(announcement.publishedAt) : ""} aria-invalid={Boolean(fieldError("publishAt"))} aria-describedby={describedBy(`${prefix}-at`, fieldError("publishAt"), true)} />
        </FormField>
      )}
      <label className="check-row pin-check">
        <input type="checkbox" name="pinned" defaultChecked={announcement?.pinned} />
        <span>Pin to the top of Home</span>
      </label>
    </>
  );
}

/** ISO instant → "YYYY-MM-DDTHH:MM" in India Standard Time for datetime-local. */
function toLocalInput(instant: string) {
  const shifted = new Date(new Date(instant).getTime() + 330 * 60_000);
  return shifted.toISOString().slice(0, 16);
}

export function AnnouncementComposer({ departments }: { departments: string[] }) {
  const form = useRef<HTMLFormElement>(null);
  const { formRef, draft, submit, pending, fieldError, formError } = useCommand(publishAnnouncementAction, { draftKey: "announcement.new", form, onSuccess: () => form.current?.reset() });
  return (
    <form ref={formRef} onSubmit={submit} className="form" noValidate>
      <DraftNotice draft={draft} />
      <AnnouncementFields prefix="an" departments={departments} fieldError={fieldError} />
      {formError && <Alert tone="danger" live>{formError}</Alert>}
      <div className="sheet-actions">
        <Button type="submit" pending={pending}>
          <AppIcon name="megaphone" size={20} />
          {pending ? "Saving…" : "Publish announcement"}
        </Button>
      </div>
    </form>
  );
}

export function EditAnnouncementSheet({ announcement, departments }: { announcement: Announcement; departments: string[] }) {
  return (
    <FormSheet draftKey={`announcement.edit:${announcement.id}`} action={publishAnnouncementAction} title="Edit announcement" description={announcement.status === "scheduled" ? "Scheduled — you can still change the time." : "Published items keep their original publish time."} trigger="Edit" triggerVariant="ghost" triggerSize="sm" submitLabel="Save changes">
      {(fieldError) => <AnnouncementFields prefix={`an-${announcement.id}`} departments={departments} fieldError={fieldError} announcement={announcement} />}
    </FormSheet>
  );
}

export function ArchiveAnnouncementButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="ghost"
      pending={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await archiveAnnouncementAction(id);
          if (result.status === "success") toast.success(result.message);
          else if (result.status === "error") toast.error(result.message);
        })
      }
    >
      Archive
    </Button>
  );
}
