"use client";

import { useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";
import { ConfirmButton, FormSheet, InlineForm } from "@/components/features/admin/form-sheet";
import { Button } from "@/components/ui/button";
import { FormField, SelectInput, TextArea, TextInput, describedBy } from "@/components/ui/field";
import {
  completeExitAction,
  decideServiceAction,
  deleteChecklistTaskAction,
  deleteDepartmentAction,
  deleteEventAction,
  deleteHolidayAction,
  deleteLocationAction,
  deleteSiteAction,
  addLocationAction,
  saveCelebrationsAction,
  saveChecklistTaskAction,
  saveDepartmentAction,
  saveEventAction,
  saveHolidayAction,
  saveLeaveTypeAction,
  saveProbationAction,
  saveShiftAction,
  deleteShiftAction,
  defaultShiftAction,
  assignShiftAction,
  saveOvertimeAction,
  saveLateEarlyAction,
  searchAddressAction,
  saveSiteAction,
  toggleOffboardingTaskAction,
} from "@/lib/actions/hr-admin";
import { DraftNotice } from "@/components/features/drafts/draft-notice";
import { useCommand } from "@/hooks/use-command";
import { useGeolocation } from "@/hooks/use-geolocation";
import { AppIcon } from "@/components/ui/app-icon";
import type {
  CelebrationSettings,
  ChecklistTask,
  CompanyEvent,
  HolidayRecord,
  LateEarlyPolicy,
  LeaveTypeConfig,
  AddressMatch,
  OfficeSite,
  OvertimePolicy,
  ProbationDefaults,
  ServiceRequest,
  ShiftConfig,
} from "@/types/hr-config";
import type { PersonRef } from "@/types/common";

const err = (id: string, error: string | undefined, hint = false) => ({
  "aria-invalid": Boolean(error),
  "aria-describedby": describedBy(id, error, hint),
});

/* Holidays ----------------------------------------------------------------- */

export function HolidaySheet({ holiday, locations }: { holiday?: HolidayRecord; locations: string[] }) {
  const [scope, setScope] = useState(holiday && holiday.locations.length ? "selected" : "all");
  const p = holiday ? `hol-${holiday.id}` : "hol-new";
  return (
    <FormSheet draftKey={holiday ? `holiday.edit:${holiday.id}` : "holiday.new"}
      action={saveHolidayAction}
      title={holiday ? "Edit holiday" : "Add holiday"}
      description="Leave and attendance use this calendar immediately. Optional holidays are not charged or skipped automatically."
      trigger={holiday ? "Edit" : "Add holiday"}
      triggerVariant={holiday ? "ghost" : "primary"}
      triggerSize={holiday ? "sm" : "md"}
      icon={holiday ? undefined : "add"}
      submitLabel={holiday ? "Save holiday" : "Add holiday"}
    >
      {(fieldError) => (
        <>
          {holiday && <input type="hidden" name="id" value={holiday.id} />}
          <FormField id={`${p}-name`} label="Name" required error={fieldError("name")}>
            <TextInput id={`${p}-name`} name="name" defaultValue={holiday?.name} maxLength={80} {...err(`${p}-name`, fieldError("name"))} />
          </FormField>
          <div className="form-row">
            <FormField id={`${p}-date`} label="Date" required error={fieldError("date")}>
              <TextInput id={`${p}-date`} name="date" type="date" defaultValue={holiday?.date} {...err(`${p}-date`, fieldError("date"))} />
            </FormField>
            <FormField id={`${p}-kind`} label="Type" required>
              <SelectInput
                id={`${p}-kind`}
                name="kind"
                defaultValue={holiday?.kind ?? "festival"}
                options={[
                  { value: "national", label: "National (paid, mandatory)" },
                  { value: "festival", label: "Festival (paid)" },
                  { value: "optional", label: "Optional / restricted" },
                ]}
              />
            </FormField>
          </div>
          <FormField id={`${p}-scope`} label="Applies to" required error={fieldError("locations")}>
            <SelectInput
              id={`${p}-scope`}
              name="scope"
              value={scope}
              onChange={(event) => setScope(event.target.value)}
              options={[
                { value: "all", label: "All locations" },
                { value: "selected", label: "Selected locations" },
              ]}
            />
          </FormField>
          {scope === "selected" && (
            <fieldset className="checks">
              <legend>Locations</legend>
              {locations.map((location) => (
                <label key={location} className="check-row">
                  <input type="checkbox" name="locations" value={location} defaultChecked={holiday?.locations.includes(location)} />
                  <span>{location}</span>
                </label>
              ))}
            </fieldset>
          )}
        </>
      )}
    </FormSheet>
  );
}

export function RemoveHolidayButton({ id, past }: { id: string; past: boolean }) {
  return <ConfirmButton label="Remove" run={() => deleteHolidayAction(id)} {...(past ? { disabledReason: "Past holidays are part of attendance history" } : {})} />;
}

/* Events ------------------------------------------------------------------- */

const eventCategories = [
  { value: "town_hall", label: "Town hall" },
  { value: "celebration", label: "Celebration" },
  { value: "training", label: "Training" },
  { value: "offsite", label: "Offsite" },
  { value: "other", label: "Other" },
];

export function EventSheet({ event, departments, today }: { event?: CompanyEvent; departments: string[]; today: string }) {
  const p = event ? `ev-${event.id}` : "ev-new";
  return (
    <FormSheet draftKey={event ? `event.edit:${event.id}` : "event.new"}
      action={saveEventAction}
      title={event ? "Edit event" : "New event"}
      description="Events show on Home for their audience."
      trigger={event ? "Edit" : "New event"}
      triggerVariant={event ? "ghost" : "primary"}
      triggerSize={event ? "sm" : "md"}
      icon={event ? undefined : "add"}
      submitLabel={event ? "Save event" : "Publish event"}
      pendingLabel={event ? "Saving…" : "Publishing…"}
    >
      {(fieldError) => (
        <>
          {event && <input type="hidden" name="id" value={event.id} />}
          <FormField id={`${p}-title`} label="Title" required error={fieldError("title")}>
            <TextInput id={`${p}-title`} name="title" defaultValue={event?.title} maxLength={120} {...err(`${p}-title`, fieldError("title"))} />
          </FormField>
          <div className="form-row">
            <FormField id={`${p}-date`} label="Date" required error={fieldError("date")}>
              <TextInput id={`${p}-date`} name="date" type="date" min={event ? undefined : today} defaultValue={event?.date} {...err(`${p}-date`, fieldError("date"))} />
            </FormField>
            <FormField id={`${p}-category`} label="Category" required>
              <SelectInput id={`${p}-category`} name="category" defaultValue={event?.category ?? "town_hall"} options={eventCategories} />
            </FormField>
          </div>
          <div className="form-row">
            <FormField id={`${p}-start`} label="Starts" error={fieldError("startTime")}>
              <TextInput id={`${p}-start`} name="startTime" type="time" defaultValue={event?.startTime ?? ""} {...err(`${p}-start`, fieldError("startTime"))} />
            </FormField>
            <FormField id={`${p}-end`} label="Ends" error={fieldError("endTime")}>
              <TextInput id={`${p}-end`} name="endTime" type="time" defaultValue={event?.endTime ?? ""} {...err(`${p}-end`, fieldError("endTime"))} />
            </FormField>
          </div>
          <div className="form-row">
            <FormField id={`${p}-venue`} label="Venue" required error={fieldError("venue")}>
              <TextInput id={`${p}-venue`} name="venue" defaultValue={event?.venue} maxLength={120} placeholder="Noida HQ · Auditorium, or Online" {...err(`${p}-venue`, fieldError("venue"))} />
            </FormField>
            <FormField id={`${p}-audience`} label="Audience" required error={fieldError("audience")}>
              <SelectInput id={`${p}-audience`} name="audience" defaultValue={event?.audience ?? "Everyone"} options={[{ value: "Everyone", label: "Everyone" }, ...departments.map((d) => ({ value: d, label: d }))]} />
            </FormField>
          </div>
          <FormField id={`${p}-desc`} label="Description" error={fieldError("description")}>
            <TextArea id={`${p}-desc`} name="description" rows={3} maxLength={1000} defaultValue={event?.description} />
          </FormField>
          {!event && (
            <label className="check-row">
              <input type="checkbox" name="shareToFeed" defaultChecked />
              <span>Also post it in the Engage feed (Events)</span>
            </label>
          )}
        </>
      )}
    </FormSheet>
  );
}

export function CancelEventButton({ id }: { id: string }) {
  return <ConfirmButton label="Cancel event" confirmLabel="Confirm cancel" run={() => deleteEventAction(id)} />;
}

export function CelebrationSettingsForm({ settings }: { settings: CelebrationSettings }) {
  return (
    <InlineForm draftKey={"settings.celebrations"} action={saveCelebrationsAction} submitLabel="Save settings">
      {() => (
        <fieldset className="checks">
          <legend className="sr-only">Show on Home</legend>
          <label className="check-row">
            <input type="checkbox" name="showWorkAnniversaries" defaultChecked={settings.showWorkAnniversaries} />
            <span>Work anniversaries (next 30 days)</span>
          </label>
          <label className="check-row">
            <input type="checkbox" name="showNewJoiners" defaultChecked={settings.showNewJoiners} />
            <span>New joiners (last 21 days)</span>
          </label>
          <label className="check-row">
            <input type="checkbox" disabled />
            <span>
              Birthdays <span className="muted">— off: birth dates are private and need employee consent first</span>
            </span>
          </label>
        </fieldset>
      )}
    </InlineForm>
  );
}

/* Leave policy ------------------------------------------------------------- */

export function LeaveTypeSheet({ type }: { type?: LeaveTypeConfig }) {
  const [unlimited, setUnlimited] = useState(type ? type.entitledDays === null : false);
  const [encashable, setEncashable] = useState(type?.encashable ?? false);
  const p = type ? `lt-${type.id}` : "lt-new";
  return (
    <FormSheet draftKey={type ? `leave-type.edit:${type.id}` : "leave-type.new"}
      action={saveLeaveTypeAction}
      title={type ? `Edit ${type.name}` : "Add leave type"}
      description="Saving creates a new policy version. Balances recalculate from the new entitlement; past requests keep their original units."
      trigger={type ? "Edit" : "Add leave type"}
      triggerVariant={type ? "ghost" : "primary"}
      triggerSize={type ? "sm" : "md"}
      icon={type ? undefined : "add"}
      submitLabel={type ? "Save new version" : "Add leave type"}
    >
      {(fieldError) => (
        <>
          {type && <input type="hidden" name="id" value={type.id} />}
          <div className="form-row">
            <FormField id={`${p}-name`} label="Name" required error={fieldError("name")}>
              <TextInput id={`${p}-name`} name="name" defaultValue={type?.name} maxLength={60} {...err(`${p}-name`, fieldError("name"))} />
            </FormField>
            <FormField id={`${p}-code`} label="Code" required error={fieldError("code")} hint="2–4 letters">
              <TextInput id={`${p}-code`} name="code" defaultValue={type?.code} maxLength={4} {...err(`${p}-code`, fieldError("code"), true)} />
            </FormField>
          </div>
          <FormField id={`${p}-desc`} label="Description" error={fieldError("description")}>
            <TextInput id={`${p}-desc`} name="description" defaultValue={type?.description} maxLength={200} />
          </FormField>
          <label className="check-row">
            <input type="checkbox" name="unlimited" checked={unlimited} onChange={(event) => setUnlimited(event.target.checked)} />
            <span>Unlimited (e.g. unpaid leave — no balance)</span>
          </label>
          <div className="form-row">
            <FormField id={`${p}-days`} label="Days per year" required={!unlimited} error={fieldError("entitledDays")} hint="Whole or half days">
              <TextInput id={`${p}-days`} name="entitledDays" inputMode="decimal" disabled={unlimited} defaultValue={type?.entitledDays ?? ""} {...err(`${p}-days`, fieldError("entitledDays"), true)} />
            </FormField>
            <FormField id={`${p}-cf`} label="Carry forward (days)" error={fieldError("carryForwardDays")} hint="Max days moving to next year">
              <TextInput id={`${p}-cf`} name="carryForwardDays" inputMode="decimal" defaultValue={type?.carryForwardDays ?? "0"} {...err(`${p}-cf`, fieldError("carryForwardDays"), true)} />
            </FormField>
          </div>
          <label className="check-row">
            <input type="checkbox" name="allowHalfDay" defaultChecked={type?.allowHalfDay ?? true} />
            <span>Allow half days</span>
          </label>
          <label className="check-row">
            <input type="checkbox" name="countsAsPresent" defaultChecked={type?.countsAsPresent ?? false} />
            <span>Counts as working day (e.g. work from home) — not shown as absent</span>
          </label>
          <label className="check-row">
            <input type="checkbox" name="active" defaultChecked={type?.active ?? true} />
            <span>Employees can apply for it</span>
          </label>

          <fieldset className="checks">
            <legend>Accrual & limits</legend>
            <FormField id={`${p}-accrual`} label="Accrual" error={fieldError("accrual")}>
              <SelectInput
                id={`${p}-accrual`}
                name="accrual"
                defaultValue={type?.accrual ?? "annual_upfront"}
                options={[
                  { value: "annual_upfront", label: "Yearly, credited upfront (prorated for joiners)" },
                  { value: "monthly", label: "Monthly credit on the 1st" },
                  { value: "none", label: "No accrual (earned, e.g. comp-off)" },
                ]}
              />
            </FormField>
            <div className="form-row">
              <FormField id={`${p}-notice`} label="Notice (days)" error={fieldError("minNoticeDays")} hint="Days before the start">
                <TextInput id={`${p}-notice`} name="minNoticeDays" type="number" min={0} max={90} defaultValue={type?.minNoticeDays ?? 0} {...err(`${p}-notice`, fieldError("minNoticeDays"), true)} />
              </FormField>
              <FormField id={`${p}-back`} label="Backdate (days)" error={fieldError("backdateDays")} hint="Apply after the fact">
                <TextInput id={`${p}-back`} name="backdateDays" type="number" min={0} max={30} defaultValue={type?.backdateDays ?? 0} {...err(`${p}-back`, fieldError("backdateDays"), true)} />
              </FormField>
            </div>
            <div className="form-row">
              <FormField id={`${p}-max`} label="Max consecutive days" error={fieldError("maxConsecutiveDays")} hint="Empty = no limit">
                <TextInput id={`${p}-max`} name="maxConsecutiveDays" type="number" min={1} max={365} defaultValue={type?.maxConsecutiveDays ?? ""} {...err(`${p}-max`, fieldError("maxConsecutiveDays"), true)} />
              </FormField>
              <FormField id={`${p}-neg`} label="Negative balance (days)" error={fieldError("negativeDays")} hint="0 = not allowed">
                <TextInput id={`${p}-neg`} name="negativeDays" inputMode="decimal" defaultValue={type?.negativeDays ?? "0"} {...err(`${p}-neg`, fieldError("negativeDays"), true)} />
              </FormField>
            </div>
            <label className="check-row">
              <input type="checkbox" name="sandwich" defaultChecked={type?.sandwich ?? false} />
              <span>Sandwich rule — count weekends/holidays between leave days</span>
            </label>
            <div className="form-row">
              <FormField id={`${p}-doc`} label="Document after (days)" error={fieldError("documentAfterDays")} hint="Empty = never; 0 = always">
                <TextInput id={`${p}-doc`} name="documentAfterDays" type="number" min={0} max={60} defaultValue={type?.documentAfterDays ?? ""} {...err(`${p}-doc`, fieldError("documentAfterDays"), true)} />
              </FormField>
              <FormField id={`${p}-exp`} label="Credit expiry (days)" error={fieldError("expiryDays")} hint="Comp-off style; empty = none">
                <TextInput id={`${p}-exp`} name="expiryDays" type="number" min={0} max={365} defaultValue={type?.expiryDays ?? ""} {...err(`${p}-exp`, fieldError("expiryDays"), true)} />
              </FormField>
            </div>
          </fieldset>

          <fieldset className="checks">
            <legend>Encashment</legend>
            <label className="check-row">
              <input type="checkbox" name="encashable" checked={encashable} onChange={(event) => setEncashable(event.target.checked)} />
              <span>Encashable</span>
            </label>
            <div className="form-row">
              <FormField id={`${p}-enc`} label="Max encash / year (days)" error={fieldError("maxEncashDays")}>
                <TextInput id={`${p}-enc`} name="maxEncashDays" inputMode="decimal" disabled={!encashable} defaultValue={type?.maxEncashDays ?? "0"} {...err(`${p}-enc`, fieldError("maxEncashDays"))} />
              </FormField>
              <FormField id={`${p}-ret`} label="Keep at least (days)" error={fieldError("minRetainDays")}>
                <TextInput id={`${p}-ret`} name="minRetainDays" inputMode="decimal" disabled={!encashable} defaultValue={type?.minRetainDays ?? "0"} {...err(`${p}-ret`, fieldError("minRetainDays"))} />
              </FormField>
            </div>
          </fieldset>

          <fieldset className="checks">
            <legend>Applicability</legend>
            <input type="hidden" name="employmentTypesPresent" value="1" />
            <FormField id={`${p}-gender`} label="Gender" error={fieldError("gender")}>
              <SelectInput
                id={`${p}-gender`}
                name="gender"
                defaultValue={type?.gender ?? "any"}
                options={[
                  { value: "any", label: "Everyone" },
                  { value: "female", label: "Women (e.g. maternity)" },
                  { value: "male", label: "Men (e.g. paternity)" },
                ]}
              />
            </FormField>
            {(["full_time", "contract", "intern"] as const).map((kind) => (
              <label key={kind} className="check-row">
                <input type="checkbox" name="employmentTypes" value={kind} defaultChecked={type ? type.employmentTypes.includes(kind) : true} />
                <span>{kind === "full_time" ? "Full-time" : kind === "contract" ? "Contract" : "Intern"}</span>
              </label>
            ))}
            {fieldError("employmentTypes") && <p className="small text-danger">{fieldError("employmentTypes")}</p>}
            <label className="check-row">
              <input type="checkbox" name="afterProbationOnly" defaultChecked={type?.afterProbationOnly ?? false} />
              <span>Only after probation</span>
            </label>
            <FormField id={`${p}-svc`} label="Minimum service (days)" error={fieldError("minServiceDays")} hint="e.g. 80 for maternity">
              <TextInput id={`${p}-svc`} name="minServiceDays" type="number" min={0} max={365} defaultValue={type?.minServiceDays ?? 0} {...err(`${p}-svc`, fieldError("minServiceDays"), true)} />
            </FormField>
          </fieldset>
        </>
      )}
    </FormSheet>
  );
}

/* Attendance rules --------------------------------------------------------- */

/** Common office timings; HR can still type any start/end. */
const shiftPresets = [
  { label: "9:00 AM – 5:00 PM", start: "09:00", end: "17:00" },
  { label: "9:00 AM – 6:00 PM", start: "09:00", end: "18:00" },
  { label: "9:30 AM – 6:30 PM", start: "09:30", end: "18:30" },
  { label: "9:30 AM – 7:00 PM", start: "09:30", end: "19:00" },
  { label: "10:00 AM – 7:00 PM", start: "10:00", end: "19:00" },
];

export function ShiftSheet({ shift }: { shift?: ShiftConfig }) {
  const [start, setStart] = useState(shift?.start ?? "09:30");
  const [end, setEnd] = useState(shift?.end ?? "18:30");
  const [breakMinutes, setBreak] = useState(String(shift?.breakMinutes ?? 60));
  const p = shift ? `sh-${shift.id}` : "sh-new";
  const toMin = (value: string) => {
    const [h = 0, m = 0] = value.split(":").map(Number);
    return h * 60 + m;
  };
  const net = toMin(end) - toMin(start) - Number(breakMinutes || 0);
  return (
    <FormSheet draftKey={shift ? `shift.edit:${shift.id}` : "shift.new"}
      action={saveShiftAction}
      title={shift ? `Edit ${shift.name}` : "Add shift"}
      description="Late marks use the start time plus grace. Overtime counts after the end time."
      trigger={shift ? "Edit" : "Add shift"}
      triggerVariant={shift ? "ghost" : "secondary"}
      triggerSize="sm"
      icon={shift ? undefined : "add"}
      submitLabel={shift ? "Save shift" : "Add shift"}
    >
      {(fieldError) => (
        <>
          {shift && <input type="hidden" name="id" value={shift.id} />}
          <fieldset className="checks">
            <legend>Quick timings</legend>
            <div className="chip-row">
              {shiftPresets.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  className={`chip${preset.start === start && preset.end === end ? " chip--active" : ""}`}
                  aria-pressed={preset.start === start && preset.end === end}
                  onClick={() => {
                    setStart(preset.start);
                    setEnd(preset.end);
                  }}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </fieldset>
          <FormField id={`${p}-name`} label="Shift name" required error={fieldError("name")}>
            <TextInput id={`${p}-name`} name="name" defaultValue={shift?.name} maxLength={60} placeholder="e.g. General shift" {...err(`${p}-name`, fieldError("name"))} />
          </FormField>
          <div className="form-row">
            <FormField id={`${p}-start`} label="Starts" required error={fieldError("start")}>
              <TextInput id={`${p}-start`} name="start" type="time" value={start} onChange={(event) => setStart(event.target.value)} {...err(`${p}-start`, fieldError("start"))} />
            </FormField>
            <FormField id={`${p}-end`} label="Ends" required error={fieldError("end")}>
              <TextInput id={`${p}-end`} name="end" type="time" value={end} onChange={(event) => setEnd(event.target.value)} {...err(`${p}-end`, fieldError("end"))} />
            </FormField>
          </div>
          <div className="form-row">
            <FormField id={`${p}-grace`} label="Late grace (minutes)" required error={fieldError("graceMinutes")}>
              <TextInput id={`${p}-grace`} name="graceMinutes" type="number" min={0} max={120} defaultValue={shift?.graceMinutes ?? 15} {...err(`${p}-grace`, fieldError("graceMinutes"))} />
            </FormField>
            <FormField id={`${p}-break`} label="Break (minutes)" required error={fieldError("breakMinutes")}>
              <TextInput id={`${p}-break`} name="breakMinutes" type="number" min={0} max={180} value={breakMinutes} onChange={(event) => setBreak(event.target.value)} {...err(`${p}-break`, fieldError("breakMinutes"))} />
            </FormField>
          </div>
          <p className="small muted" aria-live="polite">
            {net > 0 ? `Working time: ${Math.floor(net / 60)} h ${net % 60 ? `${net % 60} min` : ""} after break` : "End must be after start."}
          </p>
        </>
      )}
    </FormSheet>
  );
}

export function ShiftRowActions({ id, isDefault, assigned }: { id: string; isDefault: boolean; assigned: boolean }) {
  const [pending, startTransition] = useTransition();
  return (
    <>
      {!isDefault && (
        <Button
          size="sm"
          variant="ghost"
          pending={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await defaultShiftAction(id);
              if (result.status === "success") toast.success(result.message);
              else if (result.status === "error") toast.error(result.message);
            })
          }
        >
          Make default
        </Button>
      )}
      <ConfirmButton label="Remove" run={() => deleteShiftAction(id)} {...(isDefault ? { disabledReason: "The default shift can't be removed" } : assigned ? { disabledReason: "Assigned to a department" } : {})} />
    </>
  );
}

/** Saves on change: each department picks one shift. */
export function DepartmentShiftSelect({ department, shiftId, shifts }: { department: string; shiftId: string; shifts: ShiftConfig[] }) {
  const [value, setValue] = useState(shiftId);
  const [pending, startTransition] = useTransition();
  const id = `dshift-${department.replace(/\W/g, "")}`;
  return (
    <>
      <label htmlFor={id} className="sr-only">
        Shift for {department}
      </label>
      <SelectInput
        id={id}
        value={value}
        disabled={pending}
        aria-busy={pending || undefined}
        onChange={(event) => {
          const next = event.target.value;
          const previous = value;
          setValue(next);
          startTransition(async () => {
            const result = await assignShiftAction(department, next);
            if (result.status === "success") toast.success(result.message);
            else if (result.status === "error") {
              setValue(previous);
              toast.error(result.message);
            }
          });
        }}
        options={shifts.map((item) => ({ value: item.id, label: `${item.name} (${item.start}–${item.end})` }))}
      />
    </>
  );
}

export function OvertimeForm({ policy }: { policy: OvertimePolicy }) {
  const [enabled, setEnabled] = useState(policy.enabled);
  return (
    <InlineForm draftKey={"settings.overtime"} action={saveOvertimeAction} submitLabel="Save overtime policy">
      {(fieldError) => (
        <>
          <label className="check-row">
            <input type="checkbox" name="enabled" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
            <span>Track overtime</span>
          </label>
          <fieldset className="checks" disabled={!enabled}>
            <legend className="sr-only">Overtime rules</legend>
            <div className="form-row">
              <FormField id="ot-after" label="Starts after shift end (min)" required error={fieldError("startsAfterMinutes")} hint="Buffer before overtime counts">
                <TextInput id="ot-after" name="startsAfterMinutes" type="number" min={0} max={180} defaultValue={policy.startsAfterMinutes} {...err("ot-after", fieldError("startsAfterMinutes"), true)} />
              </FormField>
              <FormField id="ot-block" label="Count in blocks of (min)" required error={fieldError("blockMinutes")} hint="e.g. 30 → 45 min counts as 30">
                <TextInput id="ot-block" name="blockMinutes" type="number" min={15} max={120} defaultValue={policy.blockMinutes} {...err("ot-block", fieldError("blockMinutes"), true)} />
              </FormField>
            </div>
            <div className="form-row">
              <FormField id="ot-cap" label="Daily cap (min)" required error={fieldError("dailyCapMinutes")}>
                <TextInput id="ot-cap" name="dailyCapMinutes" type="number" min={30} max={480} defaultValue={policy.dailyCapMinutes} {...err("ot-cap", fieldError("dailyCapMinutes"))} />
              </FormField>
              <FormField id="ot-comp" label="Compensated as" required>
                <SelectInput
                  id="ot-comp"
                  name="compensation"
                  defaultValue={policy.compensation}
                  options={[
                    { value: "comp_off", label: "Comp-off credit" },
                    { value: "paid", label: "Paid (payroll input)" },
                  ]}
                />
              </FormField>
            </div>
            <label className="check-row">
              <input type="checkbox" name="requiresApproval" defaultChecked={policy.requiresApproval} />
              <span>Manager approves overtime before it is credited or paid</span>
            </label>
          </fieldset>
          {!enabled && (
            <>
              <input type="hidden" name="startsAfterMinutes" value={policy.startsAfterMinutes} />
              <input type="hidden" name="blockMinutes" value={policy.blockMinutes} />
              <input type="hidden" name="dailyCapMinutes" value={policy.dailyCapMinutes} />
              <input type="hidden" name="compensation" value={policy.compensation} />
            </>
          )}
        </>
      )}
    </InlineForm>
  );
}

export function LateEarlyForm({ policy }: { policy: LateEarlyPolicy }) {
  const [enabled, setEnabled] = useState(policy.enabled);
  return (
    <InlineForm draftKey={"settings.late-early"} action={saveLateEarlyAction} submitLabel="Save late/early policy">
      {(fieldError) => (
        <>
          <label className="check-row">
            <input type="checkbox" name="enabled" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
            <span>Apply late-coming / early-going deductions</span>
          </label>
          <fieldset className="checks" disabled={!enabled}>
            <legend className="sr-only">Late and early rules</legend>
            <div className="form-row">
              <FormField id="le-marks" label="Marks per half-day deduction" required error={fieldError("marksPerHalfDay")} hint="e.g. every 3rd late">
                <TextInput id="le-marks" name="marksPerHalfDay" type="number" min={1} max={10} defaultValue={policy.marksPerHalfDay} {...err("le-marks", fieldError("marksPerHalfDay"), true)} />
              </FormField>
              <FormField id="le-early" label="Early-going grace (minutes)" required error={fieldError("earlyGraceMinutes")} hint="Before shift end">
                <TextInput id="le-early" name="earlyGraceMinutes" type="number" min={0} max={120} defaultValue={policy.earlyGraceMinutes} {...err("le-early", fieldError("earlyGraceMinutes"), true)} />
              </FormField>
            </div>
            <label className="check-row">
              <input type="checkbox" name="countEarlyGoing" defaultChecked={policy.countEarlyGoing} />
              <span>Early going counts as a mark too</span>
            </label>
          </fieldset>
          <p className="small muted">Late grace comes from each shift. Marks reset every month.</p>
        </>
      )}
    </InlineForm>
  );
}

export function SiteSheet({ site }: { site?: OfficeSite }) {
  const p = site ? `site-${site.id}` : "site-new";
  const [name, setName] = useState(site?.name ?? "");
  const [latitude, setLatitude] = useState(site ? String(site.latitude) : "");
  const [longitude, setLongitude] = useState(site ? String(site.longitude) : "");
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<AddressMatch[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [searching, startSearch] = useTransition();
  const geo = useGeolocation();
  const place = (lat: number, lon: number) => {
    setLatitude(lat.toFixed(6));
    setLongitude(lon.toFixed(6));
  };
  return (
    <FormSheet draftKey={site ? `site.edit:${site.id}` : "site.new"}
      action={saveSiteAction}
      title={site ? `Edit ${site.name}` : "Add office site"}
      description="Find the office by address (OpenStreetMap), or stand at the office and use your current location. Check-ins within the radius (plus the phone's reported accuracy) are verified."
      trigger={site ? "Edit" : "Add site"}
      triggerVariant={site ? "ghost" : "secondary"}
      triggerSize="sm"
      icon={site ? undefined : "add"}
      submitLabel={site ? "Save site" : "Add site"}
    >
      {(fieldError) => (
        <>
          {site && <input type="hidden" name="id" value={site.id} />}
          <div className="stack">
            <label htmlFor={`${p}-q`} className="field-label">
              Search address
            </label>
            <div className="inline-add">
              <TextInput id={`${p}-q`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="e.g. Sector 62, Noida" maxLength={160} onKeyDown={(event) => event.key === "Enter" && event.preventDefault()} />
              <Button
                variant="secondary"
                pending={searching}
                onClick={() =>
                  startSearch(async () => {
                    const result = await searchAddressAction(query);
                    if (result.status === "ok") {
                      setMatches(result.matches);
                      setNote(result.matches.length ? null : "No match — try a nearby landmark or area name.");
                    } else {
                      setMatches([]);
                      setNote(result.message);
                    }
                  })
                }
              >
                {searching ? "Searching…" : "Search"}
              </Button>
            </div>
            {note && <p className="small muted" role="status">{note}</p>}
            {matches.length > 0 && (
              <ul className="match-list" aria-label="Address matches">
                {matches.map((match) => (
                  <li key={`${match.latitude},${match.longitude}`}>
                    <button
                      type="button"
                      className="match-option"
                      onClick={() => {
                        place(match.latitude, match.longitude);
                        if (!name) setName(match.label.split(",")[0] ?? "");
                        setMatches([]);
                        setNote(`Placed at ${match.label}`);
                      }}
                    >
                      {match.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <Button
              variant="ghost"
              size="sm"
              pending={geo.status === "locating"}
              onClick={() =>
                geo
                  .locate()
                  .then((reading) => {
                    place(reading.latitude, reading.longitude);
                    setNote(`Using your current location (±${reading.accuracy} m)`);
                  })
                  .catch(() => setNote("Location is blocked or unavailable on this device."))
              }
            >
              <AppIcon name="location" size={16} />
              {geo.status === "locating" ? "Getting location…" : "Use my current location"}
            </Button>
            <p className="location-credit">Address search © OpenStreetMap contributors (Nominatim)</p>
          </div>
          <FormField id={`${p}-name`} label="Site name" required error={fieldError("name")}>
            <TextInput id={`${p}-name`} name="name" value={name} onChange={(event) => setName(event.target.value)} maxLength={60} {...err(`${p}-name`, fieldError("name"))} />
          </FormField>
          <div className="form-row">
            <FormField id={`${p}-lat`} label="Latitude" required error={fieldError("latitude")}>
              <TextInput id={`${p}-lat`} name="latitude" inputMode="decimal" value={latitude} onChange={(event) => setLatitude(event.target.value)} {...err(`${p}-lat`, fieldError("latitude"))} />
            </FormField>
            <FormField id={`${p}-lng`} label="Longitude" required error={fieldError("longitude")}>
              <TextInput id={`${p}-lng`} name="longitude" inputMode="decimal" value={longitude} onChange={(event) => setLongitude(event.target.value)} {...err(`${p}-lng`, fieldError("longitude"))} />
            </FormField>
          </div>
          <FormField id={`${p}-radius`} label="Radius (metres)" required error={fieldError("radiusMeters")} hint="50 m to 5 km">
            <TextInput id={`${p}-radius`} name="radiusMeters" type="number" min={50} max={5000} defaultValue={site?.radiusMeters ?? 200} {...err(`${p}-radius`, fieldError("radiusMeters"), true)} />
          </FormField>
        </>
      )}
    </FormSheet>
  );
}

export function RemoveSiteButton({ id }: { id: string }) {
  return <ConfirmButton label="Remove" run={() => deleteSiteAction(id)} />;
}

/* Organization ------------------------------------------------------------- */

export function DepartmentSheet({ department, people }: { department?: { name: string; costCenter: string; head: PersonRef | null }; people: PersonRef[] }) {
  const p = department ? `dep-${department.name.replace(/\W/g, "")}` : "dep-new";
  return (
    <FormSheet draftKey={department ? `department.edit:${department.name}` : "department.new"}
      action={saveDepartmentAction}
      title={department ? `Edit ${department.name}` : "Add department"}
      description={department ? "Renaming moves everyone in the department with it." : undefined}
      trigger={department ? "Edit" : "Add department"}
      triggerVariant={department ? "ghost" : "primary"}
      triggerSize={department ? "sm" : "md"}
      icon={department ? undefined : "add"}
      submitLabel={department ? "Save department" : "Add department"}
    >
      {(fieldError) => (
        <>
          {department && <input type="hidden" name="originalName" value={department.name} />}
          <FormField id={`${p}-name`} label="Name" required error={fieldError("name")}>
            <TextInput id={`${p}-name`} name="name" defaultValue={department?.name} maxLength={60} {...err(`${p}-name`, fieldError("name"))} />
          </FormField>
          <FormField id={`${p}-cc`} label="Cost center" required error={fieldError("costCenter")} hint="e.g. CC-260 Studio">
            <TextInput id={`${p}-cc`} name="costCenter" defaultValue={department?.costCenter} maxLength={48} {...err(`${p}-cc`, fieldError("costCenter"), true)} />
          </FormField>
          <FormField id={`${p}-head`} label="Department head" error={fieldError("headId")}>
            <SelectInput id={`${p}-head`} name="headId" defaultValue={department?.head?.id ?? ""} placeholder="Not assigned" options={people.map((person) => ({ value: person.id, label: `${person.name} · ${person.designation}` }))} />
          </FormField>
        </>
      )}
    </FormSheet>
  );
}

export function RemoveDepartmentButton({ name, headcount }: { name: string; headcount: number }) {
  return <ConfirmButton label="Remove" run={() => deleteDepartmentAction(name)} {...(headcount ? { disabledReason: "Move its employees first" } : {})} />;
}

export function AddLocationForm() {
  const { formRef, draft, submit, pending, fieldError, formError } = useCommand(addLocationAction, { draftKey: "location.new", onSuccess: () => undefined });
  return (
    <form ref={formRef} onSubmit={submit} className="inline-add" noValidate>
      <DraftNotice draft={draft} />
      <FormField id="loc-name" label="New location" error={fieldError("name") ?? formError}>
        <TextInput id="loc-name" name="name" maxLength={60} placeholder="e.g. Bengaluru" {...err("loc-name", fieldError("name") ?? formError)} />
      </FormField>
      <Button type="submit" variant="secondary" pending={pending}>
        {pending ? "Adding…" : "Add"}
      </Button>
    </form>
  );
}

export function RemoveLocationButton({ name, headcount }: { name: string; headcount: number }) {
  return <ConfirmButton label="Remove" run={() => deleteLocationAction(name)} {...(headcount ? { disabledReason: "Move its employees first" } : {})} />;
}

const monthOptions = [0, 1, 2, 3, 4, 5, 6].map((m) => ({ value: String(m), label: m === 0 ? "No probation" : `${m} month${m === 1 ? "" : "s"}` }));

export function ProbationForm({ defaults }: { defaults: ProbationDefaults }) {
  return (
    <InlineForm draftKey={"settings.probation"} action={saveProbationAction} submitLabel="Save probation rules">
      {(fieldError) => (
        <div className="form-row form-row--3">
          {(
            [
              ["full_time", "Full-time"],
              ["contract", "Contract"],
              ["intern", "Intern"],
            ] as const
          ).map(([key, label]) => (
            <FormField key={key} id={`prob-${key}`} label={label} required error={fieldError(key)}>
              <SelectInput id={`prob-${key}`} name={key} defaultValue={String(defaults[key])} options={monthOptions} />
            </FormField>
          ))}
        </div>
      )}
    </InlineForm>
  );
}

export { monthOptions as probationMonthOptions };

/* Checklists --------------------------------------------------------------- */

const owners = ["HR", "IT", "Finance", "Manager", "Employee"].map((value) => ({ value, label: value }));

export function ChecklistTaskSheet({ list, task }: { list: "onboarding" | "offboarding"; task?: ChecklistTask }) {
  const p = task ? `ck-${list}-${task.id}` : `ck-${list}-new`;
  return (
    <FormSheet draftKey={task ? `checklist.edit:${list}:${task.id}` : `checklist.new:${list}`}
      action={saveChecklistTaskAction}
      title={task ? "Edit task" : list === "onboarding" ? "Add onboarding task" : "Add exit task"}
      description="Changes apply to every open case using this checklist."
      trigger={task ? "Edit" : "Add task"}
      triggerVariant={task ? "ghost" : "secondary"}
      triggerSize="sm"
      icon={task ? undefined : "add"}
      submitLabel={task ? "Save task" : "Add task"}
    >
      {(fieldError) => (
        <>
          <input type="hidden" name="list" value={list} />
          {task && <input type="hidden" name="id" value={task.id} />}
          <FormField id={`${p}-title`} label="Task" required error={fieldError("title")}>
            <TextInput id={`${p}-title`} name="title" defaultValue={task?.title} maxLength={80} {...err(`${p}-title`, fieldError("title"))} />
          </FormField>
          <div className="form-row">
            <FormField id={`${p}-owner`} label="Owner" required>
              <SelectInput id={`${p}-owner`} name="owner" defaultValue={task?.owner ?? "HR"} options={owners} />
            </FormField>
            <FormField
              id={`${p}-offset`}
              label={list === "onboarding" ? "Due (days after joining)" : "Due (days before last day)"}
              required
              error={fieldError("offsetDays")}
            >
              <TextInput id={`${p}-offset`} name="offsetDays" type="number" min={-60} max={60} defaultValue={task?.offsetDays ?? 0} {...err(`${p}-offset`, fieldError("offsetDays"))} />
            </FormField>
          </div>
          <label className="check-row">
            <input type="checkbox" name="blocking" defaultChecked={task?.blocking ?? false} />
            <span>{list === "onboarding" ? "Blocking — must finish before payroll eligibility" : "Blocking — must finish before the exit can close"}</span>
          </label>
        </>
      )}
    </FormSheet>
  );
}

export function RemoveChecklistTaskButton({ list, id }: { list: "onboarding" | "offboarding"; id: string }) {
  return <ConfirmButton label="Remove" run={() => deleteChecklistTaskAction(list, id)} />;
}

/* Offboarding -------------------------------------------------------------- */

export function OffboardingTaskToggle({ employeeId, taskId, title, done }: { employeeId: string; taskId: string; title: string; done: boolean }) {
  const [checked, setChecked] = useOptimistic(done);
  const [pending, startTransition] = useTransition();
  return (
    <label className="check-row task-row" data-done={checked || undefined}>
      <input
        type="checkbox"
        checked={checked}
        disabled={pending}
        onChange={(event) => {
          const next = event.target.checked;
          startTransition(async () => {
            setChecked(next);
            const result = await toggleOffboardingTaskAction(employeeId, taskId, next);
            if (result.status === "error") toast.error(result.message);
          });
        }}
      />
      <span>{title}</span>
    </label>
  );
}

export function CompleteExitButton({ employeeId, disabledReason }: { employeeId: string; disabledReason?: string | undefined }) {
  return <ConfirmButton label="Complete exit" confirmLabel="Confirm — close record" run={() => completeExitAction(employeeId)} {...(disabledReason ? { disabledReason } : {})} />;
}

/* Service requests --------------------------------------------------------- */

export function ServiceDecision({ request }: { request: ServiceRequest }) {
  const [mode, setMode] = useState<"idle" | "reject">("idle");
  const { formRef, draft, submit, pending, fieldError, formError } = useCommand(decideServiceAction, { draftKey: `service.decide:${request.id}` });
  const p = `sr-${request.id}`;
  const approveLabel = request.kind === "letter" ? "Issue letter" : request.kind === "loan" ? "Approve loan" : "Verify & apply";
  return (
    <form ref={formRef} onSubmit={submit} className="decision-form stack" noValidate>
      <DraftNotice draft={draft} />
      <input type="hidden" name="requestId" value={request.id} />
      <input type="hidden" name="kind" value={request.kind} />
      {mode === "reject" && (
        <FormField id={`${p}-note`} label="Reason for rejecting" required error={fieldError("note")}>
          <TextArea id={`${p}-note`} name="note" rows={2} maxLength={300} autoFocus {...err(`${p}-note`, fieldError("note"))} />
        </FormField>
      )}
      {formError && <p className="field-error" role="alert">{formError}</p>}
      <div className="sheet-actions">
        {mode === "reject" ? (
          <>
            <Button variant="secondary" onClick={() => setMode("idle")} disabled={pending}>
              Back
            </Button>
            <Button type="submit" name="decision" value="reject" variant="danger" pending={pending}>
              {pending ? "Rejecting…" : "Confirm reject"}
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={() => setMode("reject")} disabled={pending}>
              Reject
            </Button>
            {request.kind === "letter" && request.state === "pending" && (
              <Button type="submit" name="decision" value="start" variant="secondary" pending={pending}>
                Start drafting
              </Button>
            )}
            <Button type="submit" name="decision" value="approve" pending={pending}>
              {pending ? "Saving…" : approveLabel}
            </Button>
          </>
        )}
      </div>
    </form>
  );
}
