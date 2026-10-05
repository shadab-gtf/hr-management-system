"use client";

import { Button } from "@/components/ui/button";
import { Timeline } from "@/components/ui/display";
import { Sheet } from "@/components/ui/sheet";
import { useDisclosure } from "@/hooks/use-disclosure";
import { formatDateTime } from "@/lib/utils/format";
import type { TsAuditEntry } from "@/types/timesheets";

/** Audit trail (who / when / what) for a project or a timesheet week. */
export function AuditHistorySheet({ title, entries, triggerLabel, trigger = "History" }: { title: string; entries: TsAuditEntry[]; triggerLabel: string; trigger?: string }) {
  const sheet = useDisclosure();
  return (
    <>
      <Button size="sm" variant="ghost" onClick={sheet.show} aria-label={triggerLabel}>
        {trigger}
      </Button>
      <Sheet open={sheet.open} onOpenChange={sheet.setOpen} title={title} description="Every change, newest first.">
        {entries.length === 0 ? (
          <p className="muted">No changes recorded yet.</p>
        ) : (
          <Timeline items={entries.map((entry) => ({ id: entry.id, title: entry.event, meta: `${entry.actor} · ${formatDateTime(entry.at)}` }))} />
        )}
      </Sheet>
    </>
  );
}
