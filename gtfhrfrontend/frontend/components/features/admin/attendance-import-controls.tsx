"use client";

import { ConfirmButton } from "@/components/features/admin/form-sheet";
import { FileDropZone } from "@/components/features/imports/file-drop-zone";
import { AppIcon } from "@/components/ui/app-icon";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/display";
import { useCommand } from "@/hooks/use-command";
import { commitAttendanceAction, discardAttendanceAction, uploadAttendanceAction } from "@/lib/actions/imports";

/** Step 1: upload. The server parses and validates; nothing is imported yet. */
export function AttendanceUploadForm() {
  const { submit, pending, fieldError, formError } = useCommand(uploadAttendanceAction, { toast: false });
  const error = fieldError("file");
  return (
    <form onSubmit={submit} className="form" noValidate>
      <FileDropZone
        name="file"
        label="Attendance file"
        hint="Face-device export · CSV or Excel (.xlsx) · up to 5 MB"
        accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        error={error}
        errorId="import-file-error"
      />
      {error && (
        <p id="import-file-error" className="field-error">
          {error}
        </p>
      )}
      {formError && (
        <Alert tone="danger" live>
          {formError}
        </Alert>
      )}
      <div className="sheet-actions">
        <Button type="submit" pending={pending}>
          <AppIcon name="upload" size={20} />
          {pending ? "Checking file…" : "Upload & check"}
        </Button>
      </div>
    </form>
  );
}

/** Step 2: commit a reviewed preview (idempotent) or discard it. */
export function ImportCommitBar({ batchId, importable }: { batchId: string; importable: number }) {
  const { submit, pending, formError } = useCommand(commitAttendanceAction);
  return (
    <form onSubmit={submit} className="stack" noValidate>
      <input type="hidden" name="batchId" value={batchId} />
      {formError && (
        <Alert tone="danger" live>
          {formError}
        </Alert>
      )}
      <div className="sheet-actions">
        <ConfirmButton label="Discard" confirmLabel="Confirm discard" run={() => discardAttendanceAction(batchId)} />
        <Button type="submit" pending={pending} disabled={importable === 0}>
          {pending ? "Importing…" : `Import ${importable} day${importable === 1 ? "" : "s"}`}
        </Button>
      </div>
    </form>
  );
}
