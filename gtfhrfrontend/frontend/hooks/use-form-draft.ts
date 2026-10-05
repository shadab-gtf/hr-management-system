"use client";

import { useCallback, useMemo, useRef, useState, type RefObject } from "react";
import {
  DRAFT_DEBOUNCE_MS,
  hasContent,
  isValidDraftKey,
  readDraft,
  removeDraft,
  safely,
  sameFields,
  writeDraft,
  type DraftFields,
} from "@/lib/drafts/draft-core";
import { applyFields, collectFields } from "@/lib/drafts/draft-dom";
import { useDraftOwner } from "@/lib/drafts/draft-context";

/**
 * Enterprise form drafts: typed input survives a refresh, an accidental navigation or closing a sheet.
 *
 * Usage: `const draft = useFormDraft("leave.apply")` then `<form ref={draft.ref}>` and
 * `<DraftNotice draft={draft} />`. `useCommand(action, { draftKey })` wires this up and clears the draft
 * after a successful submit. Pass a record id for edit forms (`"employee.edit:" + id`) so drafts never
 * bleed between records; pass null to disable.
 *
 * Storage: localStorage `gtf-draft:v1:<employeeId>:<draftKey>` → `{savedAt, fields}`, saved ~400 ms after
 * the last input, kept 7 days, scoped to the signed-in employee (DraftScope) and wiped on sign-out or
 * when another employee signs in. Without a DraftScope (public pages) drafts are disabled.
 *
 * NEVER persisted (see SENSITIVE_FIELD_PATTERN / isPersistableField in lib/drafts/draft-core.ts):
 * - inputs of type password, file, hidden (and submit/reset/button/image);
 * - the `idempotencyKey` field;
 * - any control marked `data-no-draft`, or inside an element marked `data-no-draft`;
 * - autocomplete one-time-code / current-password / new-password / cc-*;
 * - names matching /password|otp|code|token|secret|pin|cvv|account.?(no|number)|ifsc|pan|aadhaar|bank|salary|ctc|uan|esic/i.
 * Identity, access, MFA, password and login forms must not use drafts at all.
 *
 * Restore runs when the form element mounts: values go into uncontrolled and React-controlled
 * controls alike (native setter + input/change events). Discard restores the values the form had
 * before the draft was applied. Cancel / close keeps the draft.
 */
export interface FormDraft {
  /** Callback ref for the <form>. */
  ref: (form: HTMLFormElement | null) => void | (() => void);
  /** savedAt (epoch ms) of the draft restored into the form, or null. */
  restoredAt: number | null;
  /** Drops the draft and puts back the form's original values. */
  discard: () => void;
  /** Drops the draft (after a successful submit). */
  clear: () => void;
  enabled: boolean;
}

const RESTORE_RETRIES = 3;
const RESTORE_RETRY_MS = 50;

export function useFormDraft(
  draftKey: string | null | undefined,
  /** A component's own form ref (e.g. for `form.current.reset()`); kept in sync by `ref`. */
  elementRef?: RefObject<HTMLFormElement | null>,
): FormDraft {
  const owner = useDraftOwner();
  const key = owner && draftKey && isValidDraftKey(draftKey) ? draftKey : null;
  const [restoredAt, setRestoredAt] = useState<number | null>(null);
  const form = useRef<HTMLFormElement | null>(null);
  const pristine = useRef<DraftFields | null>(null);
  const timer = useRef<number | null>(null);
  const applying = useRef(false);

  const cancelPending = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const save = useCallback(() => {
    const element = form.current;
    if (!owner || !key || !element) return;
    const fields = collectFields(element);
    safely((storage) => {
      // Nothing changed from what the form started with (or everything was emptied): no draft.
      if (
        (pristine.current && sameFields(fields, pristine.current)) ||
        !hasContent(fields)
      )
        removeDraft(storage, owner, key);
      else writeDraft(storage, owner, key, fields, Date.now());
    }, undefined);
  }, [owner, key]);

  const apply = useCallback(
    (element: HTMLFormElement, fields: DraftFields, done?: () => void) => {
      applying.current = true;
      let attempts = 0;
      const pass = () => {
        attempts += 1;
        const unresolved = element.isConnected
          ? applyFields(element, fields)
          : 0;
        if (unresolved > 0 && attempts < RESTORE_RETRIES) {
          window.setTimeout(pass, RESTORE_RETRY_MS);
          return;
        }
        // Let React flush the change events before edits are tracked again.
        window.setTimeout(() => {
          applying.current = false;
          done?.();
        }, 0);
      };
      // Defer past the commit so React has attached its listeners and children have rendered.
      window.setTimeout(pass, 0);
    },
    [],
  );

  const ref = useCallback(
    (element: HTMLFormElement | null) => {
      if (elementRef) elementRef.current = element;
      if (!element || !owner || !key) return;
      form.current = element;
      pristine.current = collectFields(element);

      const record = safely(
        (storage) => readDraft(storage, owner, key, Date.now()),
        null,
      );
      if (
        record &&
        hasContent(record.fields) &&
        !sameFields(record.fields, pristine.current)
      ) {
        const savedAt = record.savedAt;
        apply(element, record.fields, () => setRestoredAt(savedAt));
      }

      const flush = () => {
        if (timer.current === null) return;
        cancelPending();
        save();
      };
      const onEdit = () => {
        if (applying.current) return;
        cancelPending();
        timer.current = window.setTimeout(() => {
          timer.current = null;
          save();
        }, DRAFT_DEBOUNCE_MS);
      };
      const onHidden = () => {
        if (document.visibilityState === "hidden") flush();
      };
      element.addEventListener("input", onEdit);
      element.addEventListener("change", onEdit);
      window.addEventListener("pagehide", flush);
      document.addEventListener("visibilitychange", onHidden);
      return () => {
        element.removeEventListener("input", onEdit);
        element.removeEventListener("change", onEdit);
        window.removeEventListener("pagehide", flush);
        document.removeEventListener("visibilitychange", onHidden);
        // Closing a sheet or navigating away keeps what was typed.
        flush();
        if (form.current === element) form.current = null;
        if (elementRef && elementRef.current === element)
          elementRef.current = null;
      };
    },
    [owner, key, apply, save, cancelPending, elementRef],
  );

  const clear = useCallback(() => {
    cancelPending();
    if (owner && key)
      safely((storage) => removeDraft(storage, owner, key), undefined);
    pristine.current = null;
    setRestoredAt(null);
  }, [owner, key, cancelPending]);

  const discard = useCallback(() => {
    const element = form.current;
    const original = pristine.current;
    cancelPending();
    if (owner && key)
      safely((storage) => removeDraft(storage, owner, key), undefined);
    setRestoredAt(null);
    if (element && original) apply(element, original);
  }, [owner, key, apply, cancelPending]);

  return useMemo(
    () => ({ ref, restoredAt, discard, clear, enabled: key !== null }),
    [ref, restoredAt, discard, clear, key],
  );
}
