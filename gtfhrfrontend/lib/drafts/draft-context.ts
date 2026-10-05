"use client";

import { createContext, useContext } from "react";

/** Signed-in employee id that scopes form drafts; null outside the workspace (drafts disabled). */
export const DraftScopeContext = createContext<string | null>(null);

export function useDraftOwner(): string | null {
  return useContext(DraftScopeContext);
}
