"use client";

import type { ReactNode } from "react";
import { clearAllDrafts, safely } from "@/lib/drafts/draft-core";

/** Sign-out form that wipes every local form draft (gtf-draft:*) before the server action runs. */
export function SignOutForm({
  action,
  children,
}: {
  action: () => Promise<void>;
  children: ReactNode;
}) {
  return (
    <form action={action} onSubmit={() => safely(clearAllDrafts, undefined)}>
      {children}
    </form>
  );
}
