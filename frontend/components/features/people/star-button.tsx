"use client";

import { useOptimistic, useTransition } from "react";
import { AppIcon } from "@/components/ui/app-icon";
import { toggleStarAction } from "@/lib/actions/requests";

/** Personal bookmark; harmless preference, so it updates optimistically. */
export function StarButton({ id, name, starred }: { id: string; name: string; starred: boolean }) {
  const [optimistic, setOptimistic] = useOptimistic(starred);
  const [, startTransition] = useTransition();
  return (
    <button
      type="button"
      className="button button--ghost icon-button star-button"
      aria-pressed={optimistic}
      aria-label={optimistic ? `Remove ${name} from starred` : `Star ${name}`}
      onClick={() =>
        startTransition(async () => {
          setOptimistic(!optimistic);
          await toggleStarAction(id);
        })
      }
    >
      <AppIcon name="star" variant={optimistic ? "Bold" : "Linear"} />
    </button>
  );
}
