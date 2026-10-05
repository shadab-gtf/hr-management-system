/**
 * Form drafts — DOM side: read persistable values out of a <form> and write them back in a way that
 * updates both uncontrolled controls and React-controlled ones (native value setter + input/change
 * events, `click()` for checkbox/radio so React's onChange fires).
 */
import { isPersistableField, type DraftFields } from "@/lib/drafts/draft-core";

type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

function isControl(element: Element): element is Control {
  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLSelectElement ||
    element instanceof HTMLTextAreaElement
  );
}

function persistable(control: Control): boolean {
  return isPersistableField({
    name: control.name,
    type: control.type,
    autocomplete: control.getAttribute("autocomplete"),
    noDraft: control.closest("[data-no-draft]") !== null,
  });
}

/** Persistable controls of a form (including ones associated via `form="id"`), in DOM order. */
export function draftControls(form: HTMLFormElement): Control[] {
  return Array.from(form.elements).filter(isControl).filter(persistable);
}

const isChoice = (control: Control): control is HTMLInputElement =>
  control instanceof HTMLInputElement &&
  (control.type === "checkbox" || control.type === "radio");

/** Snapshot of the form's persistable values (`FormData.getAll` semantics, see draft-core). */
export function collectFields(form: HTMLFormElement): DraftFields {
  const fields: DraftFields = {};
  for (const control of draftControls(form)) {
    const values = (fields[control.name] ??= []);
    if (isChoice(control)) {
      if (control.checked) values.push(control.value);
    } else if (control instanceof HTMLSelectElement && control.multiple) {
      for (const option of Array.from(control.selectedOptions))
        values.push(option.value);
    } else {
      values.push(control.value);
    }
  }
  return fields;
}

function setNativeValue(
  control: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: string,
) {
  const prototype = Object.getPrototypeOf(control) as object;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (setter) setter.call(control, value);
  else control.value = value;
}

function fire(control: Element, type: "input" | "change") {
  control.dispatchEvent(new Event(type, { bubbles: true }));
}

/**
 * Writes `fields` into the form. Controls whose name is absent from `fields` are left alone.
 * Returns the number of names that could not be applied yet (e.g. a select whose options render
 * only after another field changes), so callers can retry once React has re-rendered.
 */
export function applyFields(
  form: HTMLFormElement,
  fields: DraftFields,
): number {
  const position = new Map<string, number>();
  const unresolved = new Set<string>();
  for (const control of draftControls(form)) {
    const values = fields[control.name];
    if (!values || control.disabled) continue;
    if (isChoice(control)) {
      const wanted = values.includes(control.value);
      // click() toggles and dispatches the click/input/change events React listens to.
      if (control.checked !== wanted && (control.type === "checkbox" || wanted))
        control.click();
      continue;
    }
    if (control instanceof HTMLSelectElement && control.multiple) {
      let changed = false;
      for (const option of Array.from(control.options)) {
        const wanted = values.includes(option.value);
        if (option.selected !== wanted) {
          option.selected = wanted;
          changed = true;
        }
      }
      if (
        values.some(
          (value) =>
            !Array.from(control.options).some(
              (option) => option.value === value,
            ),
        )
      )
        unresolved.add(control.name);
      if (changed) fire(control, "change");
      continue;
    }
    const index = position.get(control.name) ?? 0;
    position.set(control.name, index + 1);
    const value = values[index];
    if (value === undefined || control.value === value) continue;
    if (control instanceof HTMLSelectElement) {
      if (
        !Array.from(control.options).some((option) => option.value === value)
      ) {
        unresolved.add(control.name);
        continue;
      }
      setNativeValue(control, value);
      fire(control, "change");
      continue;
    }
    setNativeValue(control, value);
    fire(control, "input");
    fire(control, "change");
  }
  return unresolved.size;
}
