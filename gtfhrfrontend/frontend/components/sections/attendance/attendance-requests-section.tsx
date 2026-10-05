import { PermissionSheet } from "@/components/features/attendance/permission-sheet";
import { RegularizationButton } from "@/components/features/attendance/regularization-sheet";
import { Card, CardHeader } from "@/components/ui/card";
import { ListRow, StatusBadge, TabsNav } from "@/components/ui/display";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { formatDate, formatRelative } from "@/lib/utils/format";
import type { AttendanceDay } from "@/types/attendance";
import type { TrackedRequest } from "@/types/requests";

export function AttendanceNav({ active }: { active: "info" | "requests" }) {
  return (
    <TabsNav
      label="Attendance views"
      tabs={[
        { href: "/attendance", label: "Attendance info", active: active === "info" },
        { href: "/attendance/requests", label: "Regularization & permission", active: active === "requests" },
      ]}
    />
  );
}

export function AttendanceRequestsSection({
  exceptions,
  requests,
  today,
  openPermission,
  correctDate,
}: {
  exceptions: AttendanceDay[];
  requests: TrackedRequest[];
  today: string;
  openPermission: boolean;
  correctDate: string | undefined;
}) {
  const open = exceptions.filter((day) => !day.regularization);
  return (
    <div className="page">
      <PageHeader
        title="Regularization & permission"
        description="Correct missed punches or step out for a short while. Original punches are always kept."
        actions={<PermissionSheet today={today} defaultOpen={openPermission} />}
      />
      <AttendanceNav active="requests" />
      <div className="split">
        <Card labelledBy="fix-heading">
          <CardHeader id="fix-heading" title="Days to fix" description={open.length ? `${open.length} day${open.length === 1 ? "" : "s"} need a correction` : "Nothing to fix"} />
          {open.length ? (
            <ul className="list">
              {open.map((day) => (
                <ListRow
                  key={day.date}
                  title={formatDate(day.date, "long")}
                  meta={`${day.exception ?? "Needs review"}${day.firstIn ? ` · In ${day.firstIn}` : ""}`}
                  trailing={<RegularizationButton day={day} defaultOpen={day.date === correctDate} />}
                />
              ))}
            </ul>
          ) : (
            <EmptyState compact icon="check" title="All days are complete" description="Missing punches in the last 45 days will show here." />
          )}
        </Card>
        <Card labelledBy="hist-heading">
          <CardHeader id="hist-heading" title="My requests" />
          {requests.length ? (
            <ul className="list">
              {requests.map((request) => (
                <ListRow key={request.id} title={request.title} meta={`${request.detail} · ${request.reference} · ${formatRelative(request.submittedAt)}`} trailing={<StatusBadge status={request.status} />} />
              ))}
            </ul>
          ) : (
            <EmptyState compact icon="attendance" title="No requests yet" description="Corrections and permissions you raise appear here." />
          )}
        </Card>
      </div>
    </div>
  );
}
