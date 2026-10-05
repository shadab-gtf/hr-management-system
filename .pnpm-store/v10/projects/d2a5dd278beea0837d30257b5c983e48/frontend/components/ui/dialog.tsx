"use client";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AnimatePresence, m, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import { AppIcon } from "@/components/ui/app-icon";
interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  trigger: ReactNode;
  children: ReactNode;
  onCloseAutoFocus?: (event: Event) => void;
}
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  trigger,
  children,
  onCloseAutoFocus,
}: DialogProps) {
  const reduce = useReducedMotion();
  const transition = { duration: reduce ? 0 : 0.18 };
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger>
      <DialogPrimitive.Portal forceMount>
        <AnimatePresence>
          {open && (
            <>
              <DialogPrimitive.Overlay forceMount asChild>
                <m.div
                  className="dialog-overlay"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={transition}
                />
              </DialogPrimitive.Overlay>
              <DialogPrimitive.Content
                forceMount
                asChild
                onCloseAutoFocus={onCloseAutoFocus}
              >
                <m.div
                  className="dialog-content"
                  initial={{ opacity: 0, y: reduce ? 0 : 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: reduce ? 0 : 4 }}
                  transition={transition}
                >
                  <div className="dialog-heading">
                    <div>
                      <DialogPrimitive.Title>{title}</DialogPrimitive.Title>
                      <DialogPrimitive.Description>
                        {description}
                      </DialogPrimitive.Description>
                    </div>
                    <DialogPrimitive.Close
                      className="button button--ghost icon-button"
                      aria-label="Close dialog"
                    >
                      <AppIcon name="close" />
                    </DialogPrimitive.Close>
                  </div>
                  {children}
                </m.div>
              </DialogPrimitive.Content>
            </>
          )}
        </AnimatePresence>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
