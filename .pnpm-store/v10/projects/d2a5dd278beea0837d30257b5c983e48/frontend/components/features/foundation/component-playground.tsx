"use client";

import { useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormField, TextInput } from "@/components/ui/field";
import { AppIcon } from "@/components/ui/app-icon";
import { toast } from "sonner";

export function ComponentPlayground({
  departments,
}: {
  departments: readonly string[];
}) {
  const [name, setName] = useState("");
  const [department, setDepartment] = useState(departments[0] ?? "");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [open, setOpen] = useState(false);
  const returnFocus = useRef<HTMLElement | null>(null);
  function changeOpen(next: boolean) {
    if (next && document.activeElement instanceof HTMLElement)
      returnFocus.current = document.activeElement;
    setOpen(next);
  }
  function preview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");
    if (name.trim().length < 2) {
      setError("Enter at least 2 characters to preview a profile.");
      return;
    }
    setError("");
    changeOpen(true);
  }
  function reset() {
    setName("");
    setError("");
    setDepartment(departments[0] ?? "");
    setNotice("Preview fields cleared.");
    toast.success("Preview fields cleared", {
      description: "No HR records were changed.",
    });
  }
  return (
    <>
      <form onSubmit={preview} noValidate className="demo-form">
        <div className="field-grid">
          <FormField
            id="preview-name"
            label="Full name"
            error={error}
            hint="Use a fictional name for this preview."
          >
            <TextInput
              id="preview-name"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setError("");
                setNotice("");
              }}
              placeholder="e.g. Aanya Sharma"
              maxLength={80}
              required
              aria-invalid={Boolean(error)}
              aria-describedby={
                error ? "preview-name-error" : "preview-name-hint"
              }
            />
          </FormField>
          <FormField id="preview-department" label="Department">
            <select
              id="preview-department"
              className="input"
              value={department}
              onChange={(event) => setDepartment(event.target.value)}
            >
              {departments.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </FormField>
        </div>
        <div className="button-row">
          <Button type="submit">
            <AppIcon name="plus" size={16} />
            Preview profile
          </Button>
          <Button variant="secondary" onClick={reset}>
            Reset
          </Button>
          <Button disabled variant="ghost">
            Save to HR{" "}
            <span className="sr-only">
              unavailable in the foundation preview
            </span>
          </Button>
        </div>
        <p className="field-hint">
          Preview only. Nothing is saved or sent to an HR system.
        </p>
        <p className="form-notice" role="status">
          {notice || error}
        </p>
      </form>
      <Dialog
        open={open}
        onOpenChange={changeOpen}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocus.current?.focus();
        }}
        title="Profile preview"
        description="A fictional profile to try the shared dialog. No record will be created."
        trigger={
          <Button variant="ghost" className="dialog-demo-trigger">
            Try an empty dialog <AppIcon name="arrow" size={16} />
          </Button>
        }
      >
        <div className="profile-preview">
          <span className="avatar avatar--magenta" aria-hidden="true">
            {name.trim().slice(0, 2).toUpperCase() || "DE"}
          </span>
          <div>
            <h3>{name.trim() || "Demo profile"}</h3>
            <p className="muted">{department} · Preview only</p>
          </div>
        </div>
        <div className="dialog-actions">
          <Button
            onClick={() => {
              setOpen(false);
              setNotice("Preview closed. No record was saved.");
            }}
          >
            Done <AppIcon name="check" size={16} />
          </Button>
        </div>
      </Dialog>
    </>
  );
}
