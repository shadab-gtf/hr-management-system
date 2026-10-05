import Link from "next/link";
import { AppIcon } from "@/components/ui/app-icon";
import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PeopleTabs } from "@/components/sections/people/people-tabs";
import type { OrgNode } from "@/types/requests";

function NodeCard({ node, highlight }: { node: OrgNode; highlight: boolean }) {
  return (
    <span className={highlight ? "org-card org-card--match" : "org-card"}>
      <Avatar initials={node.person.initials} seed={node.person.id} src={node.person.photoUrl} size="sm" />
      <span className="org-card-text">
        <Link href={`/employees/${node.person.id}`} className="person-link org-name">
          {node.person.name}
        </Link>
        <span className="org-role">{node.person.designation}</span>
        <span className="org-meta num">
          {node.code} · {node.department}
        </span>
      </span>
      {node.directCount > 0 && (
        <span className="org-count num" title={`${node.directCount} direct, ${node.totalCount} total`}>
          {node.directCount}
        </span>
      )}
    </span>
  );
}

function Branch({ node, byManager, depth, matches, path }: { node: OrgNode; byManager: Map<string, OrgNode[]>; depth: number; matches: Set<string>; path: Set<string> }) {
  const reports = byManager.get(node.person.id) ?? [];
  if (reports.length === 0)
    return (
      <li className="org-item">
        <NodeCard node={node} highlight={matches.has(node.person.id)} />
      </li>
    );
  // Open the first two levels, and any branch that leads to a search match.
  const open = depth < 1 || path.has(node.person.id);
  return (
    <li className="org-item">
      <NodeCard node={node} highlight={matches.has(node.person.id)} />
      <details open={open} className="org-branch">
        <summary aria-label={`${reports.length} direct report${reports.length === 1 ? "" : "s"} of ${node.person.name}`}>
          <AppIcon name="chevron" size={16} className="org-toggle" />
          <span className="num">{reports.length}</span> report{reports.length === 1 ? "" : "s"}
        </summary>
        <ul className="org-children">
          {reports.map((child) => (
            <Branch key={child.person.id} node={child} byManager={byManager} depth={depth + 1} matches={matches} path={path} />
          ))}
        </ul>
      </details>
    </li>
  );
}

export function OrgChartSection({ nodes, q }: { nodes: OrgNode[]; q: string | undefined }) {
  const byManager = new Map<string, OrgNode[]>();
  for (const node of nodes)
    if (node.managerId) byManager.set(node.managerId, [...(byManager.get(node.managerId) ?? []), node]);
  const roots = nodes.filter((node) => !node.managerId || !nodes.some((other) => other.person.id === node.managerId));
  const needle = q?.toLowerCase();
  const matches = new Set(needle ? nodes.filter((node) => `${node.person.name} ${node.person.designation} ${node.code}`.toLowerCase().includes(needle)).map((node) => node.person.id) : []);
  // Every ancestor of a match stays expanded.
  const path = new Set<string>();
  const byId = new Map(nodes.map((node) => [node.person.id, node]));
  for (const id of matches) {
    let current = byId.get(id)?.managerId ?? null;
    while (current) {
      path.add(current);
      current = byId.get(current)?.managerId ?? null;
    }
  }
  return (
    <div className="page">
      <PeopleTabs active="org" />
      <Card>
        <form className="toolbar" action="/employees/org-chart" role="search" aria-label="Find in org chart">
          <div className="search-field">
            <AppIcon name="search" size={16} />
            <label className="sr-only" htmlFor="org-q">
              Find a person
            </label>
            <input id="org-q" name="q" type="search" className="input" defaultValue={q} placeholder="Find by name, role or code" maxLength={100} />
          </div>
          <div className="toolbar-actions">
            <button type="submit" className="button button--primary">
              Find
            </button>
            {q && (
              <Link href="/employees/org-chart" className="button button--ghost">
                Clear
              </Link>
            )}
          </div>
        </form>
        {q && (
          <p className="result-bar" role="status">
            {matches.size ? `${matches.size} match${matches.size === 1 ? "" : "es"} highlighted` : "No one matches that search"}
          </p>
        )}
        {roots.length ? (
          <div className="org-scroll" tabIndex={0} role="region" aria-label="Organization chart">
            <ul className="org-tree">
              {roots.map((root) => (
                <Branch key={root.person.id} node={root} byManager={byManager} depth={0} matches={matches} path={path} />
              ))}
            </ul>
          </div>
        ) : (
          <EmptyState icon="people" title="No reporting lines yet" description="The chart appears once managers are assigned." />
        )}
      </Card>
    </div>
  );
}
