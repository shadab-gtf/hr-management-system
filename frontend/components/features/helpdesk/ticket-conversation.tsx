"use client";

import { useRef, useTransition } from "react";
import { toast } from "sonner";
import { AppIcon } from "@/components/ui/app-icon";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/display";
import { TextArea } from "@/components/ui/field";
import { useCommand } from "@/hooks/use-command";
import { closeTicketAction, replyTicketAction } from "@/lib/actions/helpdesk";

export function TicketReplyForm({ ticketId, placeholder }: { ticketId: string; placeholder: string }) {
  const form = useRef<HTMLFormElement>(null);
  const { submit, pending, fieldError, formError } = useCommand(replyTicketAction, { onSuccess: () => form.current?.reset() });
  const error = fieldError("body") ?? formError;
  return (
    <form ref={form} onSubmit={submit} className="reply-form" noValidate>
      <input type="hidden" name="ticketId" value={ticketId} />
      <label className="sr-only" htmlFor="reply-body">
        Reply
      </label>
      <TextArea id="reply-body" name="body" rows={3} maxLength={2000} placeholder={placeholder} aria-invalid={Boolean(fieldError("body"))} />
      {error && <Alert tone="danger" live>{error}</Alert>}
      <div className="sheet-actions">
        <Button type="submit" pending={pending}>
          <AppIcon name="send" size={16} />
          {pending ? "Sending…" : "Send reply"}
        </Button>
      </div>
    </form>
  );
}

export function CloseTicketButton({ ticketId }: { ticketId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="secondary"
      pending={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await closeTicketAction(ticketId);
          if (result.status === "success") toast.success(result.message);
          else if (result.status === "error") toast.error(result.message);
        })
      }
    >
      <AppIcon name="check" size={20} />
      {pending ? "Closing…" : "Mark resolved & close"}
    </Button>
  );
}
