"use client";

import { AnimatePresence, m, useReducedMotion } from "framer-motion";
import Image from "next/image";
import { useEffect, useState } from "react";
import { AppIcon } from "@/components/ui/app-icon";
import { Button } from "@/components/ui/button";
import { useInstallPrompt } from "@/hooks/use-install-prompt";

const DISMISS_KEY = "gtf-install-dismissed-at";
const SNOOZE_MS = 14 * 86_400_000;
const PHONE_QUERY = "(max-width: 639px)";

function snoozed() {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    return Date.now() - at < SNOOZE_MS;
  } catch {
    return false;
  }
}

/**
 * Small non-blocking install card: bottom-right on desktop, top of the screen
 * on phones. Android/Chrome/Edge use the real install prompt; iOS shows
 * Add-to-Home-Screen steps. Snoozes for 14 days when dismissed
 * (a non-sensitive device preference).
 */
export function InstallPrompt({ delayMs = 4000 }: { delayMs?: number }) {
  const { platform, canPrompt, install } = useInstallPrompt();
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState(false);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!(canPrompt || platform === "ios") || snoozed()) return;
    const timer = window.setTimeout(() => setOpen(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [canPrompt, platform, delayMs]);

  useEffect(() => {
    const query = window.matchMedia(PHONE_QUERY);
    const sync = () => setPhone(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* storage blocked: just close */
    }
    setOpen(false);
  };

  // Slide in from the edge the card is pinned to.
  const offset = reduce ? 0 : phone ? -16 : 16;

  return (
    <AnimatePresence>
      {open && (
        <m.aside
          className="install-toast"
          role="dialog"
          aria-modal="false"
          aria-labelledby="install-toast-title"
          aria-describedby="install-toast-description"
          onKeyDown={(event) => {
            if (event.key === "Escape") dismiss();
          }}
          initial={{ opacity: 0, y: offset }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: offset }}
          transition={{ duration: reduce ? 0 : 0.22, ease: [0.2, 0, 0, 1] }}
        >
          <div className="install-toast-head">
            <Image src="/icons/icon-192.png" alt="" width={44} height={44} className="install-icon" />
            <div className="install-toast-copy">
              <p id="install-toast-title" className="install-toast-title">
                Install GTF HR
              </p>
              <p id="install-toast-description" className="install-toast-description">
                One-tap check-in, approval and payslip alerts. No HR data stored offline.
              </p>
            </div>
            <button type="button" className="button button--ghost icon-button install-toast-close" aria-label="Close" onClick={dismiss}>
              <AppIcon name="close" size={16} />
            </button>
          </div>
          {platform === "ios" ? (
            <ol className="install-steps">
              <li>Tap <strong>Share</strong> in Safari’s toolbar.</li>
              <li>Choose <strong>Add to Home Screen</strong>, then <strong>Add</strong>.</li>
            </ol>
          ) : null}
          <div className="install-toast-actions">
            <Button variant="secondary" size="sm" onClick={dismiss}>
              Not now
            </Button>
            {canPrompt && (
              <Button
                size="sm"
                onClick={async () => {
                  await install();
                  setOpen(false);
                }}
              >
                <AppIcon name="download" size={16} />
                Install
              </Button>
            )}
          </div>
        </m.aside>
      )}
    </AnimatePresence>
  );
}

/** Settings entry: always available, independent of the snooze. */
export function InstallButton() {
  const { platform, canPrompt, install } = useInstallPrompt();
  const [iosHelp, setIosHelp] = useState(false);
  if (platform === "installed") return <p className="notice-strip"><AppIcon name="check" size={16} /> GTF HR is installed on this device.</p>;
  if (platform === "ios")
    return (
      <>
        <Button variant="secondary" onClick={() => setIosHelp((value) => !value)} aria-expanded={iosHelp}>
          <AppIcon name="download" size={20} />
          Add to Home Screen
        </Button>
        {iosHelp && <p className="small muted">In Safari, tap Share, then “Add to Home Screen”.</p>}
      </>
    );
  if (!canPrompt) return <p className="small muted">Open GTF HR in Chrome, Edge or Safari on your phone to install it.</p>;
  return (
    <Button onClick={() => void install()}>
      <AppIcon name="download" size={20} />
      Install app
    </Button>
  );
}
