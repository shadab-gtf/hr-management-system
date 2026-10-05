"use client";

import { AppIcon } from "@/components/ui/app-icon";
import { Button } from "@/components/ui/button";
import type { FormDraft } from "@/hooks/use-form-draft";
import { formatDateTime } from "@/lib/utils/format";

/** Subtle "Draft restored · Discard" line shown inside a form after unsaved input was restored. */
export function DraftNotice({ draft }: { draft: FormDraft }) {
  if (draft.restoredAt === null) return null;
  return (
    <div className="cluster field-hint muted draft-notice" role="status">
      <AppIcon name="note" size={16} />
      <span>
        Draft restored · saved{" "}
        <time dateTime={new Date(draft.restoredAt).toISOString()}>
          {formatDateTime(new Date(draft.restoredAt).toISOString())}
        </time>
      </span>
      <Button
        variant="ghost"
        size="sm"
        onClick={draft.discard}
        aria-label="Discard restored draft"
      >
        Discard
      </Button>
    </div>
  );
}
