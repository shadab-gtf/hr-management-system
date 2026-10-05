import { getSession, hasCapability } from "@/lib/api/session/session.service";
import { AdminTabs, type AdminArea } from "@/components/sections/admin/admin-sections";

/** Tabs for the admin group the page belongs to, limited to permitted pages. */
export async function AdminTabsFor({ active }: { active: AdminArea }) {
  const session = await getSession();
  if (!session) return null;
  const can = (...keys: Parameters<typeof hasCapability>[1][]) => hasCapability(session, ...keys);
  return (
    <AdminTabs
      active={active}
      can={{
        onboarding: can("onboarding.manage"),
        offboarding: can("onboarding.manage"),
        requests: can("employee.update", "letter.issue", "loan.approve"),
        announcements: can("announcement.publish"),
        events: can("event.manage"),
        holidays: can("policy.publish"),
        "leave-policy": can("policy.publish"),
        "attendance-rules": can("policy.publish"),
        "attendance-import": can("import.commit"),
        organization: can("policy.publish"),
        reports: can("report.read"),
        "reports/builder": can("report.build"),
        settlements: can("settlement.prepare", "settlement.approve"),
        assets: can("asset.manage"),
        surveys: can("survey.manage"),
        letters: can("letter.issue"),
        policies: can("policy.publish"),
        performance: can("performance.manage"),
      }}
    />
  );
}
