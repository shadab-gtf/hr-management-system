"use client";

import { useEffect, type ReactNode } from "react";
import { claimDraftOwner, safely } from "@/lib/drafts/draft-core";
import { DraftScopeContext } from "@/lib/drafts/draft-context";

/**
 * Scopes form drafts to the signed-in employee. On mount it records the owner (wiping every draft if a
 * different employee signed in on this browser) and sweeps expired drafts.
 */
export function DraftScope({
  employeeId,
  children,
}: {
  employeeId: string;
  children: ReactNode;
}) {
  useEffect(() => {
    safely(
      (storage) => claimDraftOwner(storage, employeeId, Date.now()),
      undefined,
    );
  }, [employeeId]);
  return (
    <DraftScopeContext.Provider value={employeeId}>
      {children}
    </DraftScopeContext.Provider>
  );
}
