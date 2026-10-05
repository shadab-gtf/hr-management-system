import type { ReactNode } from "react";
import Link from "next/link";
import { AcknowledgeAssetButton, AssetFormSheet, AssetStatusSheet, AssignAssetSheet, RejectAssetRequestSheet, RequestAssetSheet, ReturnAssetSheet } from "@/components/features/lifecycle/asset-controls";
import { AppIcon } from "@/components/ui/app-icon";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Alert, IconTile, KeyValueList, ListRow, MoneyText, PersonCell, StatusBadge, TabsNav, Timeline } from "@/components/ui/display";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { formatDate, formatDateTime, formatRelative } from "@/lib/utils/format";
import { assetCategoryIcons, assetCategoryLabels, assetConditionLabels, assetStatus } from "@/components/sections/lifecycle/labels";
import type { AssetDetail, AssetInventory, AssetStatus, MyAssets } from "@/types/lifecycle";

const requestState = {
  pending: { label: "Pending", tone: "warning" },
  fulfilled: { label: "Assigned", tone: "success" },
  rejected: { label: "Declined", tone: "danger" },
} as const;

export function AssetsAdminSection({ inventory, status, q, today, tabs }: { inventory: AssetInventory; status: AssetStatus | undefined; q: string; today: string; tabs: ReactNode }) {
  const lower = q.toLowerCase();
  const shown = inventory.assets.filter((asset) => (!status || asset.status === status) && (!lower || [asset.tag, asset.make, asset.model, asset.serial, asset.assignee?.name ?? ""].join(" ").toLowerCase().includes(lower)));
  const people = inventory.people.map((person) => ({ value: person.id, label: person.name }));
  const pending = inventory.requests.filter((item) => item.state === "pending");
  const href = (next: AssetStatus | undefined) => `/admin/assets${next ? `?status=${next}` : ""}`;
  const t = inventory.totals;
  return (
    <div className="page">
      <PageHeader eyebrow="HR admin" title="Assets" description="Company equipment, who holds it, and its history. Unreturned assets feed offboarding clearances and F&F recoveries." actions={<AssetFormSheet today={today} />} />
      {tabs}
      <div className="grid grid-stats">
        <StatCard label="Assets" value={t.count} meta={<>Book value <MoneyText value={t.bookValue} compact /></>} icon="box" accent="cyan" />
        <StatCard label="Assigned" value={t.assigned} meta={`${t.unacknowledged} awaiting acknowledgement`} icon="userTick" accent="magenta" />
        <StatCard label="In stock" value={t.inStock} meta="Ready to assign" icon="boxTick" accent="yellow" />
        <StatCard label="In repair / retired" value={`${t.inRepair} / ${t.retired}`} meta="Not available" icon="settings" />
      </div>

      <Card labelledBy="asset-requests">
        <CardHeader id="asset-requests" title="Requests" description={`${pending.length} pending`} />
        {inventory.requests.length ? (
          <ul className="list">
            {inventory.requests.slice(0, 8).map((request) => {
              const stock = inventory.assets.filter((asset) => asset.status === "in_stock" && asset.category === request.category).map((asset) => ({ value: asset.id, label: `${asset.tag} · ${asset.make} ${asset.model}` }));
              return (
                <ListRow
                  key={request.id}
                  leading={<IconTile icon={assetCategoryIcons[request.category]} />}
                  title={`${request.requester.name} · ${assetCategoryLabels[request.category]}`}
                  meta={`${request.reference} · ${request.reason} · ${formatRelative(request.requestedAt)}${request.assetTag ? ` · ${request.assetTag}` : ""}${request.state === "rejected" && request.note ? ` · ${request.note}` : ""}`}
                  trailing={
                    request.state === "pending" ? (
                      <>
                        <AssignAssetSheet request={request} people={people} assets={stock} />
                        <RejectAssetRequestSheet request={request} />
                      </>
                    ) : (
                      <StatusBadge status={requestState[request.state]} />
                    )
                  }
                />
              );
            })}
          </ul>
        ) : (
          <EmptyState compact icon="box" title="No requests" description="Employees request equipment from My assets." />
        )}
      </Card>

      <TabsNav
        label="Asset status"
        tabs={[
          { href: href(undefined), label: "All", active: !status, count: t.count },
          { href: href("assigned"), label: "Assigned", active: status === "assigned", count: t.assigned },
          { href: href("in_stock"), label: "In stock", active: status === "in_stock", count: t.inStock },
          { href: href("in_repair"), label: "In repair", active: status === "in_repair", count: t.inRepair },
          { href: href("retired"), label: "Retired", active: status === "retired", count: t.retired },
        ]}
      />
      <form className="toolbar" action="/admin/assets" method="get" role="search">
        {status && <input type="hidden" name="status" value={status} />}
        <div className="toolbar-field">
          <label htmlFor="asset-q" className="sr-only">Search assets</label>
          <input id="asset-q" className="input" type="search" name="q" defaultValue={q} placeholder="Search tag, model, serial or person" />
        </div>
        <button type="submit" className="button button--secondary">
          <AppIcon name="search" size={20} />
          Search
        </button>
      </form>
      <Card labelledBy="asset-list">
        <CardHeader id="asset-list" title="Inventory" description={`${shown.length} shown`} />
        <CardBody className="flush">
          <DataTable
            caption="Asset inventory"
            rows={shown}
            rowKey={(row) => row.id}
            empty={<EmptyState compact icon="search" title="No assets match" description="Try another status or search." />}
            columns={[
              { key: "tag", header: "Tag", rowHeader: true, cell: (row) => <span className="stack-tight"><strong>{row.tag}</strong><span className="small muted">{assetCategoryLabels[row.category]}</span></span> },
              { key: "model", header: "Make & model", cell: (row) => <span className="stack-tight"><span>{row.make} {row.model}</span><span className="small muted">S/N {row.serial}</span></span> },
              { key: "holder", header: "Holder", cell: (row) => (row.assignee ? <PersonCell person={row.assignee} meta={row.acknowledgedAt ? `Acknowledged ${formatDate(row.acknowledgedAt.slice(0, 10), "short")}` : "Not acknowledged"} /> : <span className="muted">—</span>) },
              { key: "status", header: "Status", cell: (row) => <span className="stack-tight"><StatusBadge status={assetStatus[row.status]} /><span className="small muted">{assetConditionLabels[row.condition]}</span></span> },
              { key: "value", header: "Book value", align: "end", hideOnMobile: true, cell: (row) => <span className="stack-tight"><MoneyText value={row.bookValue} /><span className="small muted">Cost <MoneyText value={row.cost} /></span></span> },
              { key: "act", header: "Actions", align: "end", cell: (row) => <AssetActions asset={row} people={people} today={today} /> },
            ]}
          />
        </CardBody>
      </Card>
      <Alert tone="neutral">Book value uses straight-line depreciation over 36 months to a 10% floor (ID cards and SIMs at cost). Mock rule — Finance sets the real policy.</Alert>
    </div>
  );
}

function AssetActions({ asset, people, today }: { asset: AssetDetail; people: { value: string; label: string }[]; today: string }) {
  return (
    <span className="row-actions">
      {asset.status === "in_stock" && <AssignAssetSheet asset={asset} people={people} />}
      {asset.status === "assigned" && <ReturnAssetSheet asset={asset} />}
      {asset.status !== "assigned" && asset.status !== "retired" && <AssetStatusSheet asset={asset} />}
      {asset.status !== "retired" && <AssetFormSheet asset={asset} today={today} />}
      <details className="lc-details lc-history">
        <summary>History</summary>
        <Timeline items={asset.history.slice(0, 6).map((entry) => ({ id: entry.id, title: entry.event, meta: `${entry.actor} · ${formatDateTime(entry.at)}`, detail: entry.note ?? undefined }))} />
      </details>
    </span>
  );
}

export function MyAssetsSection({ data }: { data: MyAssets }) {
  const unacknowledged = data.assigned.filter((asset) => !asset.acknowledgedAt);
  return (
    <div className="page">
      <PageHeader eyebrow="Me" title="My assets" description="Company equipment issued to you. Acknowledge what you received; return everything before your last working day." actions={<RequestAssetSheet />} />
      {unacknowledged.length > 0 && <Alert tone="warning" title={`${unacknowledged.length} asset${unacknowledged.length === 1 ? "" : "s"} to acknowledge`}>Confirm you received them in good condition.</Alert>}
      <Card labelledBy="my-assigned">
        <CardHeader id="my-assigned" title="With you" description={`${data.assigned.length} item${data.assigned.length === 1 ? "" : "s"}`} />
        {data.assigned.length ? (
          <div className="grid grid-2 lc-asset-grid">
            {data.assigned.map((asset) => (
              <Card key={asset.id} as="article" labelledBy={`ma-${asset.id}`} className="lc-asset-card">
                <div className="card-header">
                  <div className="person">
                    <IconTile icon={assetCategoryIcons[asset.category]} accent="cyan" />
                    <span className="person-text">
                      <h3 id={`ma-${asset.id}`}>{asset.make} {asset.model}</h3>
                      <span className="person-role">{asset.tag} · {assetCategoryLabels[asset.category]}</span>
                    </span>
                  </div>
                  {asset.acknowledgedAt ? <Badge tone="success">Acknowledged</Badge> : <Badge tone="warning">Pending</Badge>}
                </div>
                <CardBody className="stack">
                  <KeyValueList
                    columns={1}
                    items={[
                      { label: "Serial", value: asset.serial },
                      { label: "Issued", value: asset.assignedAt ? formatDateTime(asset.assignedAt) : "—" },
                      { label: "Condition", value: assetConditionLabels[asset.condition] },
                      ...(asset.acknowledgedAt ? [{ label: "Acknowledged", value: formatDateTime(asset.acknowledgedAt) }] : []),
                    ]}
                  />
                  {!asset.acknowledgedAt && <AcknowledgeAssetButton assetId={asset.id} tag={asset.tag} />}
                </CardBody>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState compact icon="box" title="No assets with you" description="Request equipment if you need something for work." />
        )}
      </Card>
      <div className="grid grid-2">
        <Card labelledBy="my-requests">
          <CardHeader id="my-requests" title="My requests" />
          {data.requests.length ? (
            <ul className="list">
              {data.requests.map((request) => (
                <ListRow key={request.id} leading={<IconTile icon={assetCategoryIcons[request.category]} />} title={`${assetCategoryLabels[request.category]} · ${request.reference}`} meta={`${request.reason} · ${formatRelative(request.requestedAt)}${request.note ? ` · ${request.note}` : ""}`} trailing={<StatusBadge status={requestState[request.state]} />} />
              ))}
            </ul>
          ) : (
            <EmptyState compact icon="clipboard" title="No requests" description="Requests you raise appear here." />
          )}
        </Card>
        <Card labelledBy="my-returned">
          <CardHeader id="my-returned" title="Returned" />
          {data.returned.length ? (
            <ul className="list">
              {data.returned.map((item) => (
                <ListRow key={item.id} title={`${item.tag} · ${item.label}`} meta={`${formatDateTime(item.returnedAt)} · ${item.condition}`} />
              ))}
            </ul>
          ) : (
            <EmptyState compact icon="archive" title="Nothing returned yet" description="Returns recorded by IT/Admin show here." />
          )}
        </Card>
      </div>
      <p className="small muted">
        Lost or damaged something? <Link href="/helpdesk" className="inline-link">Raise a helpdesk request</Link>. Unreturned assets are recovered at book value in the full & final settlement.
      </p>
    </div>
  );
}
