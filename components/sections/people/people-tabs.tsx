import type { ReactNode } from "react";
import { TabsNav } from "@/components/ui/display";
import { PageHeader } from "@/components/ui/page-header";

export function PeopleTabs({ active, description, actions }: { active: "everyone" | "starred" | "org"; description?: string | undefined; actions?: ReactNode }) {
  return (
    <>
      <PageHeader title="People" description={description ?? "Find colleagues, see who they work with and how teams are organized."} actions={actions} />
      <TabsNav
        label="People views"
        tabs={[
          { href: "/employees", label: "Everyone", active: active === "everyone" },
          { href: "/employees?starred=1", label: "Starred", active: active === "starred" },
          { href: "/employees/org-chart", label: "Org chart", active: active === "org" },
        ]}
      />
    </>
  );
}
