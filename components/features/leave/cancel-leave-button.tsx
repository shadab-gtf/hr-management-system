"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/display";
import { Sheet } from "@/components/ui/sheet";
import { useCommand } from "@/hooks/use-command";
import { cancelLeaveAction } from "@/lib/actions/leave";

export function CancelLeaveButton({ id, version, label }: { id: string; version: number; label: string }) {
  const [open, setOpen] = useState(false);
  const { submit, pending, formError } = useCommand(cancelLeaveAction, { onSuccess: () => setOpen(false) });
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} aria-label={`Cancel ${label}`}>
        Cancel
      </Button>
      <Sheet open={open} onOpenChange={setOpen} title="Cancel this request?" description={label} dismissible={!pending}>
        <form onSubmit={submit} className="form">
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="version" value={version} />
          <p className="text-block">Any reserved balance is released once the cancellation is confirmed.</p>
          {formError && (
            <Alert tone="danger" live>
              {formError}
            </Alert>
          )}
          <div className="sheet-actions">
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
              Keep request
            </Button>
            <Button type="submit" variant="danger" pending={pending}>
              {pending ? "Cancelling…" : "Cancel request"}
            </Button>
          </div>
        </form>
      </Sheet>
    </>
  );
}
