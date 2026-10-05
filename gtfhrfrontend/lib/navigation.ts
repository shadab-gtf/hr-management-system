import type { IconName } from "@/components/ui/app-icon";
import type { Capability } from "@/types/session";

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  badge?: number;
}
/** A top-level entry: a direct link, or an expandable group of links. */
export interface NavEntry extends NavItem {
  children?: { href: string; label: string; badge?: number }[];
}
/** Kept for the mobile "More" hub, which lists entries as sections. */
export interface NavGroup {
  label: string;
  items: NavItem[];
}

/** Any one of these opens the HR admin area; each page checks its own. */
export const adminCapabilities: Capability[] = [
  "onboarding.manage",
  "announcement.publish",
  "event.manage",
  "policy.publish",
  "employee.update",
  "letter.issue",
  "loan.approve",
  "import.commit",
  "report.read",
  "report.build",
  "asset.manage",
  "performance.manage",
  "survey.manage",
  "settlement.prepare",
  "settlement.approve",
];

interface Rule {
  anyOf: Capability[];
}
type ChildDef = { href: string; label: string } & Rule;
type EntryDef = NavItem & Rule & { children?: ChildDef[] };

const entries: EntryDef[] = [
  { href: "/dashboard", label: "Home", icon: "home", anyOf: ["profile.read.self"] },
  {
    href: "/engage",
    label: "Engage",
    icon: "megaphone",
    anyOf: ["directory.read"],
    children: [
      { href: "/engage", label: "Feed", anyOf: ["directory.read"] },
      { href: "/engage/polls", label: "Polls & surveys", anyOf: ["directory.read"] },
      { href: "/engage/praise", label: "Praise wall", anyOf: ["directory.read"] },
    ],
  },
  {
    href: "/me/payslips",
    label: "Salary",
    icon: "wallet",
    anyOf: ["payslip.read.self"],
    children: [
      { href: "/me/payslips", label: "Payslips", anyOf: ["payslip.read.self"] },
      { href: "/salary/ytd", label: "YTD reports", anyOf: ["payslip.read.self"] },
      { href: "/salary/tax-statement", label: "IT statement", anyOf: ["payslip.read.self"] },
      { href: "/salary/tax-declaration", label: "IT declaration", anyOf: ["tax.declare.self"] },
      { href: "/salary/form-16", label: "Form 16", anyOf: ["payslip.read.self"] },
      { href: "/salary/loans", label: "Loans & advances", anyOf: ["loan.request.self"] },
      { href: "/expenses", label: "Reimbursement", anyOf: ["expense.submit.self"] },
      { href: "/salary/revision", label: "Salary revision", anyOf: ["payslip.read.self"] },
    ],
  },
  {
    href: "/leave",
    label: "Leave",
    icon: "calendar",
    anyOf: ["leave.request.self"],
    children: [
      { href: "/leave", label: "Apply & balances", anyOf: ["leave.request.self"] },
      { href: "/leave/calendar", label: "Leave calendar", anyOf: ["leave.request.self"] },
      { href: "/leave/comp-off", label: "Comp-off & encashment", anyOf: ["leave.request.self"] },
      { href: "/leave/holidays", label: "Holiday calendar", anyOf: ["leave.request.self"] },
    ],
  },
  {
    href: "/attendance",
    label: "Attendance",
    icon: "attendance",
    anyOf: ["attendance.read.self"],
    children: [
      { href: "/attendance", label: "Attendance info", anyOf: ["attendance.read.self"] },
      { href: "/attendance/requests", label: "Regularization & permission", anyOf: ["attendance.regularize.request"] },
      { href: "/attendance/roster", label: "Shift roster", anyOf: ["attendance.read.self"] },
    ],
  },
  {
    href: "/timesheets",
    label: "Timesheets",
    icon: "task",
    anyOf: ["timesheet.submit.self", "timesheet.approve", "project.manage"],
    children: [
      { href: "/timesheets", label: "My timesheet", anyOf: ["timesheet.submit.self"] },
      { href: "/timesheets/team", label: "Team timesheets", anyOf: ["timesheet.approve"] },
      { href: "/timesheets/projects", label: "Projects", anyOf: ["project.manage"] },
    ],
  },
  {
    href: "/performance",
    label: "Performance",
    icon: "ranking",
    anyOf: ["performance.self", "performance.review"],
    children: [
      { href: "/performance", label: "Goals & reviews", anyOf: ["performance.self"] },
      { href: "/performance/feedback", label: "Feedback", anyOf: ["performance.self"] },
      { href: "/performance/team", label: "Team reviews", anyOf: ["performance.review"] },
    ],
  },
  { href: "/documents", label: "Document center", icon: "documents", anyOf: ["document.read"] },
  { href: "/employees", label: "People", icon: "people", anyOf: ["directory.read"] },
  { href: "/helpdesk", label: "Helpdesk", icon: "helpdesk", anyOf: ["helpdesk.request.self", "helpdesk.queue"] },
  {
    href: "/requests",
    label: "Requests",
    icon: "layers",
    anyOf: ["profile.read.self"],
    children: [
      { href: "/requests", label: "Request hub", anyOf: ["profile.read.self"] },
      { href: "/me/assets", label: "My assets", anyOf: ["asset.read.self"] },
      { href: "/me/resignation", label: "Resignation", anyOf: ["exit.request.self"] },
    ],
  },
  { href: "/approvals", label: "Approvals", icon: "approvals", anyOf: ["approval.decide"] },
  { href: "/delegates", label: "Workflow delegates", icon: "team", anyOf: ["delegation.manage"] },
  {
    href: "/recruitment",
    label: "Recruitment",
    icon: "userSearch",
    anyOf: ["recruitment.manage", "candidate.interview"],
    children: [
      { href: "/recruitment", label: "Job openings", anyOf: ["recruitment.manage"] },
      { href: "/recruitment/candidates", label: "Candidates", anyOf: ["recruitment.manage"] },
      { href: "/recruitment/interviews", label: "My interviews", anyOf: ["candidate.interview"] },
    ],
  },
  {
    href: "/payroll",
    label: "Payroll",
    icon: "payroll",
    anyOf: ["payroll.prepare", "payroll.approve"],
    children: [
      { href: "/payroll", label: "Payroll runs", anyOf: ["payroll.prepare", "payroll.approve"] },
      { href: "/payroll/compensation", label: "Salary import", anyOf: ["compensation.manage", "payroll.approve"] },
      { href: "/payroll/structures", label: "Salary structures", anyOf: ["compensation.manage", "payroll.approve"] },
      { href: "/payroll/statutory", label: "Statutory compliance", anyOf: ["statutory.manage"] },
    ],
  },
  {
    href: "/admin/onboarding",
    label: "HR admin",
    icon: "briefcase",
    anyOf: adminCapabilities,
    children: [
      { href: "/admin/onboarding", label: "Onboarding", anyOf: ["onboarding.manage"] },
      { href: "/admin/offboarding", label: "Offboarding", anyOf: ["onboarding.manage"] },
      { href: "/admin/settlements", label: "F&F settlements", anyOf: ["settlement.prepare", "settlement.approve"] },
      { href: "/admin/assets", label: "Assets", anyOf: ["asset.manage"] },
      { href: "/admin/requests", label: "Service requests", anyOf: ["employee.update", "letter.issue", "loan.approve"] },
      { href: "/admin/announcements", label: "Announcements", anyOf: ["announcement.publish"] },
      { href: "/admin/surveys", label: "Polls & surveys", anyOf: ["survey.manage"] },
      { href: "/admin/letters", label: "Letter templates", anyOf: ["letter.issue"] },
      { href: "/admin/policies", label: "Policy acknowledgements", anyOf: ["policy.publish"] },
      { href: "/admin/performance", label: "Performance cycles", anyOf: ["performance.manage"] },
      { href: "/admin/events", label: "Events & celebrations", anyOf: ["event.manage"] },
      { href: "/admin/holidays", label: "Holidays", anyOf: ["policy.publish"] },
      { href: "/admin/leave-policy", label: "Leave policy", anyOf: ["policy.publish"] },
      { href: "/admin/attendance-rules", label: "Attendance rules", anyOf: ["policy.publish"] },
      { href: "/admin/attendance-import", label: "Attendance import", anyOf: ["import.commit"] },
      { href: "/admin/organization", label: "Organization", anyOf: ["policy.publish"] },
      { href: "/admin/reports", label: "Reports", anyOf: ["report.read"] },
      { href: "/admin/reports/builder", label: "Report builder", anyOf: ["report.build"] },
    ],
  },
];

const allowed = (rule: Rule, capabilities: Capability[]) => rule.anyOf.some((key) => capabilities.includes(key));

/** Usability projection of server permissions. Every route still checks access. */
export function navigationFor(capabilities: Capability[], badges: Partial<Record<string, number>> = {}): NavEntry[] {
  return entries
    .filter((entry) => allowed(entry, capabilities))
    .map(({ anyOf: _anyOf, children, ...entry }) => {
      const visible = children?.filter((child) => allowed(child, capabilities)).map(({ anyOf: _rule, ...child }) => child);
      const first = visible?.[0];
      const badge = badges[entry.href];
      return {
        ...entry,
        // A group opens on its first permitted child.
        href: first?.href ?? entry.href,
        ...(badge ? { badge } : {}),
        ...(visible && visible.length > 1 ? { children: visible } : {}),
      };
    });
}

/** "More" hub sections: groups keep their children; singles gather under "Workspace". */
export function moreSectionsFor(capabilities: Capability[], badges: Partial<Record<string, number>> = {}): NavGroup[] {
  const nav = navigationFor(capabilities, badges);
  const singles = nav.filter((entry) => !entry.children);
  return [
    { label: "Workspace", items: singles.map(({ children: _c, ...item }) => item) },
    ...nav
      .filter((entry) => entry.children)
      .map((entry) => ({ label: entry.label, items: (entry.children ?? []).map((child) => ({ ...child, icon: entry.icon })) })),
  ];
}

/** Four essential destinations + More, per ui-specification.md (mobile). */
export function bottomNavigationFor(capabilities: Capability[]): NavItem[] {
  const items: NavItem[] = [
    { href: "/dashboard", label: "Home", icon: "home" },
    { href: "/attendance", label: "Time", icon: "attendance" },
    { href: "/leave", label: "Leave", icon: "calendar" },
  ];
  items.push(
    capabilities.includes("approval.decide")
      ? { href: "/approvals", label: "Approvals", icon: "approvals" }
      : { href: "/me/payslips", label: "Pay", icon: "payslip" },
  );
  items.push({ href: "/more", label: "More", icon: "grid" });
  return items;
}

export function isActivePath(pathname: string, href: string): boolean {
  const base = href.split("?")[0] ?? href;
  if (base === "/dashboard") return pathname === "/dashboard";
  return pathname === base || pathname.startsWith(`${base}/`);
}

/** Most specific child match wins, so "/leave" isn't active on "/leave/calendar". */
export function activeChild(pathname: string, children: { href: string }[]): string | null {
  const matches = children.filter((child) => isActivePath(pathname, child.href));
  return matches.sort((a, b) => b.href.length - a.href.length)[0]?.href ?? null;
}

export const quickLinks: { href: string; label: string; anyOf: Capability[] }[] = [
  { href: "/leave?new=1", label: "Apply leave", anyOf: ["leave.request.self"] },
  { href: "/attendance/requests", label: "Regularize attendance", anyOf: ["attendance.regularize.request"] },
  { href: "/attendance/requests?new=permission", label: "Request permission", anyOf: ["attendance.regularize.request"] },
  { href: "/me/payslips", label: "Latest payslip", anyOf: ["payslip.read.self"] },
  { href: "/salary/tax-declaration", label: "IT declaration", anyOf: ["tax.declare.self"] },
  { href: "/documents?tab=letters", label: "Request a letter", anyOf: ["letter.request.self"] },
  { href: "/helpdesk?new=1", label: "Raise a helpdesk request", anyOf: ["helpdesk.request.self"] },
];
export function quickLinksFor(capabilities: Capability[]) {
  return quickLinks.filter((link) => allowed(link, capabilities)).map(({ anyOf: _anyOf, ...link }) => link);
}
