import { TabsNav } from "@/components/ui/display";

export type TimesheetArea = "mine" | "team" | "projects";

/** Sub-navigation across the timesheet pages the viewer can open. */
export function TimesheetTabs({ active, allowed }: { active: TimesheetArea; allowed: Record<TimesheetArea, boolean> }) {
  const tabs = [
    { key: "mine" as const, href: "/timesheets", label: "My timesheet" },
    { key: "team" as const, href: "/timesheets/team", label: "Team" },
    { key: "projects" as const, href: "/timesheets/projects", label: "Projects" },
  ].filter((tab) => allowed[tab.key]);
  if (tabs.length < 2) return null;
  return <TabsNav label="Timesheets" tabs={tabs.map((tab) => ({ href: tab.href, label: tab.label, active: tab.key === active }))} />;
}
