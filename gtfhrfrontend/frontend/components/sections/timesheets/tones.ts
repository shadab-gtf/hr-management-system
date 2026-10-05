import type { ProjectStatus, TimesheetStatus } from "@/types/timesheets";
import type { Tone } from "@/types/common";

/** Timesheet module status labels and tones (kept local to the module). */
export const timesheetStatus: Record<TimesheetStatus, { label: string; tone: Tone }> = {
  not_started: { label: "Not started", tone: "neutral" },
  draft: { label: "Draft", tone: "info" },
  submitted: { label: "Submitted", tone: "warning" },
  approved: { label: "Approved", tone: "success" },
  rejected: { label: "Sent back", tone: "danger" },
};

export const projectStatus: Record<ProjectStatus, { label: string; tone: Tone }> = {
  active: { label: "Active", tone: "success" },
  on_hold: { label: "On hold", tone: "warning" },
  closed: { label: "Closed", tone: "neutral" },
};
