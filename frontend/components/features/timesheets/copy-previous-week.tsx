"use client";

import { AppIcon } from "@/components/ui/app-icon";
import { Button } from "@/components/ui/button";
import { useCommand } from "@/hooks/use-command";
import { copyPreviousWeekAction } from "@/lib/actions/timesheets";

/** Copies last week's rows into this (empty) week; working days only, server-side. */
export function CopyPreviousWeekButton({ weekStart, version }: { weekStart: string; version: number }) {
  const { submit, pending, state } = useCommand(copyPreviousWeekAction);
  return (
    <form onSubmit={submit} className="ts-inline-form">
      <input type="hidden" name="weekStart" value={weekStart} />
      <input type="hidden" name="version" value={version} />
      <Button type="submit" variant="secondary" pending={pending}>
        <AppIcon name="repeat" size={20} />
        {pending ? "Copying…" : "Copy previous week"}
      </Button>
      {state.status === "error" && (
        <span className="field-error" role="alert">
          {state.message}
        </span>
      )}
    </form>
  );
}
