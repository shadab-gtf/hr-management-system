"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { AppIcon, type IconName } from "@/components/ui/app-icon";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/display";
import { Sheet } from "@/components/ui/sheet";
import { SheetActions } from "@/components/ui/sheet-actions";
import { useCommand } from "@/hooks/use-command";
import { useDisclosure } from "@/hooks/use-disclosure";
import type { ActionResult } from "@/types/action";

type FormAction = (prev: ActionResult, formData: FormData) => Promise<ActionResult>;

/**
 * Trigger button + sheet + form for one HR admin command. Field values survive
 * validation errors (useCommand); the sheet closes only on success.
 */
export function FormSheet({
  action,
  title,
  description,
  trigger,
  triggerVariant = "primary",
  triggerSize = "md",
  icon,
  submitLabel,
  pendingLabel = "Saving…",
  submitVariant = "primary",
  children,
}: {
  action: FormAction;
  title: string;
  description?: string;
  trigger: string;
  triggerVariant?: "primary" | "secondary" | "ghost";
  triggerSize?: "sm" | "md";
  icon?: IconName;
  submitLabel: string;
  pendingLabel?: string;
  submitVariant?: "primary" | "danger";
  children: (fieldError: (name: string) => string | undefined) => ReactNode;
}) {
  const sheet = useDisclosure();
  const { submit, pending, fieldError, formError } = useCommand(action, { onSuccess: sheet.hide });
  return (
    <>
      <Button variant={triggerVariant} size={triggerSize} onClick={sheet.show}>
        {icon && <AppIcon name={icon} size={triggerSize === "sm" ? 16 : 20} />}
        {trigger}
      </Button>
      <Sheet open={sheet.open} onOpenChange={sheet.setOpen} title={title} {...(description ? { description } : {})} dismissible={!pending}>
        <form onSubmit={submit} className="form" noValidate>
          {children(fieldError)}
          {formError && (
            <Alert tone="danger" live>
              {formError}
            </Alert>
          )}
          <SheetActions onCancel={sheet.hide} pending={pending} label={submitLabel} pendingLabel={pendingLabel} variant={submitVariant} />
        </form>
      </Sheet>
    </>
  );
}

/** Inline settings form (no sheet) with a single save button. */
export function InlineForm({ action, submitLabel, children }: { action: FormAction; submitLabel: string; children: (fieldError: (name: string) => string | undefined) => ReactNode }) {
  const { submit, pending, fieldError, formError } = useCommand(action);
  return (
    <form onSubmit={submit} className="form" noValidate>
      {children(fieldError)}
      {formError && (
        <Alert tone="danger" live>
          {formError}
        </Alert>
      )}
      <div className="sheet-actions">
        <Button type="submit" pending={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}

/** Two-step destructive button: first press arms, second press confirms. */
export function ConfirmButton({ label, confirmLabel = "Confirm", run, disabledReason }: { label: string; confirmLabel?: string; run: () => Promise<ActionResult>; disabledReason?: string }) {
  const [armed, setArmed] = useState(false);
  const [pending, startTransition] = useTransition();
  const timer = useRef<number | null>(null);
  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);
  if (disabledReason)
    return (
      <Button size="sm" variant="ghost" disabled title={disabledReason}>
        {label}
      </Button>
    );
  return (
    <Button
      size="sm"
      variant={armed ? "danger" : "ghost"}
      pending={pending}
      aria-live="polite"
      onClick={() => {
        if (!armed) {
          setArmed(true);
          timer.current = window.setTimeout(() => setArmed(false), 4000);
          return;
        }
        startTransition(async () => {
          const result = await run();
          setArmed(false);
          if (result.status === "success") toast.success(result.message);
          else if (result.status === "error") toast.error(result.message);
        });
      }}
    >
      {armed ? confirmLabel : label}
    </Button>
  );
}
