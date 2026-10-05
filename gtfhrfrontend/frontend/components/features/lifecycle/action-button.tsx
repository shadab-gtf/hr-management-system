"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { AppIcon, type IconName } from "@/components/ui/app-icon";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/types/action";

/** One-press command button for non-destructive id-only actions. */
export function ActionButton({
  label,
  pendingLabel = "Working…",
  run,
  variant = "secondary",
  size = "sm",
  icon,
  disabledReason,
}: {
  label: string;
  pendingLabel?: string;
  run: () => Promise<ActionResult>;
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md";
  icon?: IconName;
  disabledReason?: string | null | undefined;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant={variant}
      size={size}
      pending={pending}
      disabled={Boolean(disabledReason)}
      title={disabledReason ?? undefined}
      onClick={() =>
        startTransition(async () => {
          const result = await run();
          if (result.status === "success") toast.success(result.message, result.reference ? { description: `Reference ${result.reference}` } : undefined);
          else if (result.status === "error") toast.error(result.message);
        })
      }
    >
      {icon && <AppIcon name={icon} size={size === "sm" ? 16 : 20} />}
      {pending ? pendingLabel : label}
    </Button>
  );
}
