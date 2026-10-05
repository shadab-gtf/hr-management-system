import Link from "next/link";
import { AppIcon } from "@/components/ui/app-icon";
import { Avatar } from "@/components/ui/avatar";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { DateText, PersonCell, StatusBadge } from "@/components/ui/display";
import { EmptyState } from "@/components/ui/empty-state";
import { SelectInput, TextInput } from "@/components/ui/field";
import { PeopleTabs } from "@/components/sections/people/people-tabs";
import { StarButton } from "@/components/features/people/star-button";
import { AddEmployeeSheet } from "@/components/features/people/employee-admin";
import type { HrFormOptions } from "@/types/hr-config";
import { employmentStatus } from "@/lib/utils/tones";
import type { EmployeeFacets, EmployeeFilters, EmployeeList, EmployeeListItem } from "@/types/employee";

function query(filters: EmployeeFilters, extra: Record<string, string | undefined> = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ q: filters.q, department: filters.department, location: filters.location, status: filters.status, ...extra }))
    if (value) params.set(key, value);
  const text = params.toString();
  return text ? `/employees?${text}` : "/employees";
}

export function EmployeesSection({
  list,
  facets,
  filters,
  hrView,
  starred,
  starredOnly,
  hrOptions = null,
}: {
  list: EmployeeList;
  facets: EmployeeFacets;
  filters: EmployeeFilters;
  hrView: boolean;
  starred: string[];
  starredOnly: boolean;
  /** Present only when the viewer may create employees. */
  hrOptions?: HrFormOptions | null;
}) {
  const isStarred = (id: string) => starred.includes(id);
  const filtered = Boolean(filters.q || filters.department || filters.location || filters.status);
  const firstPage = !filters.cursor;
  return (
    <div className="page">
      <PeopleTabs
        active={starredOnly ? "starred" : "everyone"}
        description={hrView ? "Employee records in your HR scope. Private fields stay on each profile." : undefined}
        actions={hrOptions ? <AddEmployeeSheet options={hrOptions} /> : undefined}
      />
      <Card>
        <form className="toolbar" action="/employees" role="search" aria-label="Filter people">
          {starredOnly && <input type="hidden" name="starred" value="1" />}
          <div className="search-field">
            <AppIcon name="search" size={16} />
            <label className="sr-only" htmlFor="people-q">
              Search by name, role or employee code
            </label>
            <TextInput id="people-q" name="q" type="search" defaultValue={filters.q} placeholder="Search name, role or code" maxLength={100} />
          </div>
          <div className="toolbar-field">
            <label htmlFor="people-department">Department</label>
            <SelectInput id="people-department" name="department" defaultValue={filters.department ?? ""} placeholder="Any department" options={facets.departments.map((d) => ({ value: d, label: d }))} />
          </div>
          <div className="toolbar-field">
            <label htmlFor="people-location">Location</label>
            <SelectInput id="people-location" name="location" defaultValue={filters.location ?? ""} placeholder="Any location" options={facets.locations.map((l) => ({ value: l, label: l }))} />
          </div>
          {facets.statuses.length > 0 && (
            <div className="toolbar-field">
              <label htmlFor="people-status">Status</label>
              <SelectInput id="people-status" name="status" defaultValue={filters.status ?? ""} placeholder="Any status" options={facets.statuses.map((s) => ({ value: s, label: employmentStatus[s].label }))} />
            </div>
          )}
          <div className="toolbar-actions">
            <button type="submit" className="button button--primary">
              <AppIcon name="filter" size={16} />
              Apply
            </button>
            {filtered && (
              <Link href="/employees" className="button button--ghost">
                Clear
              </Link>
            )}
          </div>
        </form>
        <div className="result-bar" role="status">
          <span>
            {list.meta.total ?? list.items.length} {filtered ? "matching" : ""} {list.meta.total === 1 ? "person" : "people"}
          </span>
        </div>
        <DataTable<EmployeeListItem>
          caption="People directory"
          rows={list.items}
          rowKey={(row) => row.id}
          mobileRow={(row) => ({
            href: `/employees/${row.id}`,
            leading: <Avatar initials={row.initials} seed={row.id} src={row.photoUrl} />,
            title: row.name,
            meta: `${row.designation} · ${row.department}`,
            trailing: (
              <>
                {row.status && row.status !== "active" ? <StatusBadge status={employmentStatus[row.status]} /> : null}
                <StarButton id={row.id} name={row.name} starred={isStarred(row.id)} />
              </>
            ),
          })}
          empty={
            <EmptyState
              icon="people"
              title={starredOnly ? "No starred colleagues yet" : filtered ? "No results match these filters" : "No people to show"}
              description={starredOnly ? "Tap the star on anyone you work with often." : filtered ? "Try a different name, or clear the filters." : "People in your scope will appear here."}
              action={filtered ? <ButtonLink href="/employees">Clear filters</ButtonLink> : undefined}
            />
          }
          columns={[
            {
              key: "name",
              header: "Name",
              rowHeader: true,
              cell: (row) => <PersonCell person={row} href={`/employees/${row.id}`} />,
            },
            { key: "code", header: "Code", hideOnMobile: true, cell: (row) => <span className="num">{row.code}</span> },
            { key: "department", header: "Department", cell: (row) => row.department },
            { key: "location", header: "Location", cell: (row) => row.location },
            ...(hrView
              ? [
                  { key: "status", header: "Status", cell: (row: EmployeeListItem) => (row.status ? <StatusBadge status={employmentStatus[row.status]} /> : "—") },
                  { key: "joined", header: "Joined", hideOnMobile: true, cell: (row: EmployeeListItem) => (row.joinedOn ? <DateText value={row.joinedOn} /> : "—") },
                  { key: "star", header: "Star", align: "end" as const, cell: (row: EmployeeListItem) => <StarButton id={row.id} name={row.name} starred={isStarred(row.id)} /> },
                ]
              : [
                  { key: "email", header: "Work email", hideOnMobile: true, cell: (row: EmployeeListItem) => <a className="inline-link" href={`mailto:${row.workEmail}`}>{row.workEmail}</a> },
                  { key: "star", header: "Star", align: "end" as const, cell: (row: EmployeeListItem) => <StarButton id={row.id} name={row.name} starred={isStarred(row.id)} /> },
                ]),
          ]}
        />
        {(list.meta.hasMore || !firstPage) && (
          <nav className="pager" aria-label="Pagination">
            {firstPage ? <span /> : (
              <Link href={query(filters)} className="button button--secondary button--sm">
                <AppIcon name="back" size={16} />
                First page
              </Link>
            )}
            {list.meta.hasMore && list.meta.nextCursor ? (
              <Link href={query(filters, { cursor: list.meta.nextCursor })} className="button button--secondary button--sm">
                Next page
                <AppIcon name="chevronRight" size={16} />
              </Link>
            ) : (
              <span>End of results</span>
            )}
          </nav>
        )}
      </Card>
    </div>
  );
}
