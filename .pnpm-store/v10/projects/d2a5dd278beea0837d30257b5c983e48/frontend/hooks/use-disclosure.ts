"use client";

import { useCallback, useState } from "react";

/** Open/close state for sheets, dialogs and menus. */
export function useDisclosure(initial = false) {
  const [open, setOpen] = useState(initial);
  const show = useCallback(() => setOpen(true), []);
  const hide = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((value) => !value), []);
  return { open, setOpen, show, hide, toggle };
}
