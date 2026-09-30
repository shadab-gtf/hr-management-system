"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AnimatePresence, m, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import { AppIcon } from "@/components/ui/app-icon";
import { cn } from "@/lib/utils/cn";

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** "side" = right panel on desktop / bottom sheet on mobile; "left" = navigation drawer. */
  placement?: "side" | "left";
  size?: "md" | "lg";
  /** Block overlay/Escape dismissal while a command is pending. */
  dismissible?: boolean;
}

/** Controlled sheet. Focus trap, Escape and focus return come from Radix. */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  placement = "side",
  size = "md",
  dismissible = true,
}: SheetProps) {
  const reduce = useReducedMotion();
  const offset = reduce ? 0 : 16;
  const from = placement === "left" ? { x: -offset } : { y: offset };
  const guard = (event: Event) => {
    if (!dismissible) event.preventDefault();
  };
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal forceMount>
        <AnimatePresence>
          {open && (
            <>
              <DialogPrimitive.Overlay forceMount asChild>
                <m.div
                  className="sheet-overlay"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: reduce ? 0 : 0.18 }}
                />
              </DialogPrimitive.Overlay>
              <DialogPrimitive.Content
                forceMount
                asChild
                onEscapeKeyDown={guard}
                onPointerDownOutside={guard}
                onInteractOutside={guard}
                {...(description ? {} : { "aria-describedby": undefined })}
              >
                <m.div
                  className={cn("sheet", `sheet--${placement}`, `sheet--${size}`)}
                  initial={{ opacity: 0, ...from }}
                  animate={{ opacity: 1, x: 0, y: 0 }}
                  exit={{ opacity: 0, ...from }}
                  transition={{ duration: reduce ? 0 : 0.22, ease: [0.2, 0, 0, 1] }}
                >
                  <span className="sheet-grabber" aria-hidden="true" />
                  <div className="sheet-header">
                    <div>
                      <DialogPrimitive.Title className="sheet-title">{title}</DialogPrimitive.Title>
                      {description && (
                        <DialogPrimitive.Description className="sheet-description">
                          {description}
                        </DialogPrimitive.Description>
                      )}
                    </div>
                    <DialogPrimitive.Close
                      className="button button--ghost icon-button"
                      aria-label="Close"
                      disabled={!dismissible}
                    >
                      <AppIcon name="close" />
                    </DialogPrimitive.Close>
                  </div>
                  <div className="sheet-body">{children}</div>
                  {footer && <div className="sheet-footer">{footer}</div>}
                </m.div>
              </DialogPrimitive.Content>
            </>
          )}
        </AnimatePresence>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
