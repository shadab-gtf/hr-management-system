import type { Tone } from "@/types/common";
import type { AttendanceDayState, TodayState } from "@/types/attendance";
import type { EmploymentStatus } from "@/types/employee";
import type { LeaveState } from "@/types/leave";
import type { PayrollRunState } from "@/types/payroll";
import type {
  ExpenseState,
  ScanState,
  TicketState,
} from "@/types/workplace";

/** Status → semantic tone + explicit label. Colour is never the only cue. */
type StatusMap<K extends string> = Record<K, { label: string; tone: Tone }>;

export const employmentStatus: StatusMap<EmploymentStatus> = {
  active: { label: "Active", tone: "success" },
  on_leave: { label: "On leave", tone: "warning" },
  onboarding: { label: "Onboarding", tone: "info" },
  notice: { label: "Notice period", tone: "warning" },
  exited: { label: "Exited", tone: "neutral" },
};

export const leaveStatus: StatusMap<LeaveState> = {
  pending: { label: "Pending approval", tone: "warning" },
  approved: { label: "Approved", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export const attendanceDayStatus: StatusMap<AttendanceDayState> = {
  present: { label: "Present", tone: "success" },
  late: { label: "Late", tone: "warning" },
  half_day: { label: "Half day", tone: "info" },
  absent: { label: "Absent", tone: "danger" },
  leave: { label: "On leave", tone: "info" },
  holiday: { label: "Holiday", tone: "neutral" },
  weekly_off: { label: "Weekly off", tone: "neutral" },
  needs_review: { label: "Needs review", tone: "danger" },
  upcoming: { label: "Upcoming", tone: "neutral" },
};

export const todayStatus: StatusMap<TodayState> = {
  not_recorded: { label: "Not recorded", tone: "neutral" },
  checked_in: { label: "Checked in", tone: "success" },
  checked_out: { label: "Checked out", tone: "info" },
  needs_review: { label: "Needs review", tone: "danger" },
  unavailable: { label: "Unavailable", tone: "neutral" },
};

export const payrollStatus: StatusMap<PayrollRunState> = {
  draft: { label: "Draft", tone: "neutral" },
  calculating: { label: "Calculating", tone: "info" },
  calculated: { label: "Calculated", tone: "info" },
  in_review: { label: "In review", tone: "warning" },
  approved: { label: "Approved", tone: "success" },
  published: { label: "Published", tone: "success" },
  paid: { label: "Paid", tone: "success" },
  rejected: { label: "Returned", tone: "danger" },
};

export const scanStatus: StatusMap<ScanState> = {
  scanning: { label: "Scanning", tone: "info" },
  clean: { label: "Verified", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
};

export const ticketStatus: StatusMap<TicketState> = {
  open: { label: "Open", tone: "info" },
  in_progress: { label: "In progress", tone: "info" },
  awaiting_you: { label: "Awaiting you", tone: "warning" },
  resolved: { label: "Resolved", tone: "success" },
  closed: { label: "Closed", tone: "neutral" },
};

export const expenseStatus: StatusMap<ExpenseState> = {
  draft: { label: "Draft", tone: "neutral" },
  submitted: { label: "Awaiting manager", tone: "warning" },
  manager_approved: { label: "Awaiting finance", tone: "warning" },
  finance_approved: { label: "Approved", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
  reimbursed: { label: "Reimbursed", tone: "success" },
};
