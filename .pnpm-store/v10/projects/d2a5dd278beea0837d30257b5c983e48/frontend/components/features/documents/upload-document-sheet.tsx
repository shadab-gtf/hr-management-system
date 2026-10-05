"use client";

import { useState } from "react";
import { AppIcon } from "@/components/ui/app-icon";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/display";
import { FormField, SelectInput } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { SheetActions } from "@/components/ui/sheet-actions";
import { DraftNotice } from "@/components/features/drafts/draft-notice";
import { useCommand } from "@/hooks/use-command";
import { uploadDocumentAction } from "@/lib/actions/documents";



export function UploadDocumentSheet() {
  const [open, setOpen] = useState(false);
  const { formRef, draft, submit, pending, fieldError, formError } = useCommand(uploadDocumentAction, { draftKey: "document.upload", onSuccess: () => setOpen(false) });
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <AppIcon name="upload" size={20} />
        Upload
      </Button>
      <Sheet open={open} onOpenChange={setOpen} title="Upload a document" description="Files are scanned before anyone can open them." dismissible={!pending}>
        <form ref={formRef} onSubmit={submit} className="form" noValidate>
          <DraftNotice draft={draft} />
          <FormField id="d-category" label="Document type" required>
            <SelectInput
              id="d-category"
              name="category"
              defaultValue="identity"
              options={[
                { value: "identity", label: "Identity proof" },
                { value: "employment", label: "Employment document" },
                { value: "payroll", label: "Tax / payroll proof" },
                { value: "other", label: "Other" },
              ]}
            />
          </FormField>
          <label className="file-drop">
            <AppIcon name="upload" size={24} />
            <span>PDF, JPEG or PNG · up to 10 MB</span>
            <input type="file" name="file" accept="application/pdf,image/jpeg,image/png" aria-invalid={Boolean(fieldError("file"))} />
          </label>
          {fieldError("file") && <p className="field-error">{fieldError("file")}</p>}
          {formError && <Alert tone="danger" live>{formError}</Alert>}
          <SheetActions onCancel={() => setOpen(false)} pending={pending} label="Upload" pendingLabel="Uploading…" />
        </form>
      </Sheet>
    </>
  );
}
