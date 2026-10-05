import type { Member } from "@/types/foundation";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";

const tones: Record<Member["status"], BadgeTone> = {
  Active: "success",
  "On leave": "warning",
  Onboarding: "info",
};
export function MemberTable({ members }: { members: readonly Member[] }) {
  if (members.length === 0)
    return (
      <EmptyState
        title="No matching people"
        description="Try another name or clear your search."
      />
    );
  return (
    <div
      className="table-scroll"
      tabIndex={0}
      role="region"
      aria-label="Sample people table"
    >
      <table>
        <caption className="sr-only">
          Fictional people used to preview the reusable table
        </caption>
        <thead>
          <tr>
            <th scope="col">Employee</th>
            <th scope="col">Department</th>
            <th scope="col">Location</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {members.map((member) => (
            <tr key={member.id}>
              <th scope="row">
                <div className="person">
                  <span
                    className={`avatar avatar--${member.color}`}
                    aria-hidden="true"
                  >
                    {member.initials}
                  </span>
                  <div>
                    <span className="person-name">{member.name}</span>
                    <span className="person-role">{member.jobTitle}</span>
                  </div>
                </div>
              </th>
              <td>{member.department}</td>
              <td>{member.location}</td>
              <td>
                <Badge tone={tones[member.status]}>{member.status}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
