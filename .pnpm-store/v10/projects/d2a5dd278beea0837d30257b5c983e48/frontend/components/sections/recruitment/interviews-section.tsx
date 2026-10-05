import { OfferApproval, RequisitionSheet } from "@/components/features/recruitment/recruitment-forms";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { DateText, MoneyText, StatusBadge, TabsNav } from "@/components/ui/display";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { formatMoneyCompact } from "@/lib/utils/format";
import { InterviewCard, offerStatus, requisitionStatus } from "@/components/sections/recruitment/recruitment-ui";
import type { Interview, MyInterviews, Offer, RecruitmentOptions, Requisition } from "@/types/recruitment";

export type InterviewsTab = "interviews" | "requisitions" | "offers";

function Group({ title, items, hrView, empty }: { title: string; items: Interview[]; hrView: boolean; empty?: string }) {
  if (!items.length && !empty) return null;
  const id = `grp-${title.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <Card labelledBy={id}>
      <CardHeader id={id} title={title} />
      <CardBody className="stack">
        {items.length ? items.map((interview) => <InterviewCard key={interview.id} interview={interview} {...(hrView ? { candidateHref: `/recruitment/candidates/${interview.candidateId}` } : {})} />) : <p className="muted">{empty}</p>}
      </CardBody>
    </Card>
  );
}

export function MyInterviewsSection({ data, options, tab, hrView }: { data: MyInterviews; options: RecruitmentOptions; tab: InterviewsTab; hrView: boolean }) {
  const due = data.interviews.filter((item) => item.canSubmit);
  const upcoming = data.interviews.filter((item) => !item.canSubmit && !item.myScorecardSubmitted && item.state === "scheduled");
  const done = data.interviews.filter((item) => item.myScorecardSubmitted);
  const pendingApprovals = data.offerApprovals.filter((offer) => offer.canApprove).length;
  return (
    <div className="page">
      <PageHeader title="My interviews" description="Interviews you're on, scorecards to submit, and hiring requisitions you've raised." actions={<RequisitionSheet options={options} />} />
      <TabsNav
        label="Interview views"
        tabs={[
          { href: "/recruitment/interviews", label: "Interviews", active: tab === "interviews", count: due.length },
          { href: "/recruitment/interviews?tab=requisitions", label: "My requisitions", active: tab === "requisitions", count: data.requisitions.length },
          ...(data.canApproveOffers ? [{ href: "/recruitment/interviews?tab=offers", label: "Offer approvals", active: tab === "offers", count: pendingApprovals }] : []),
        ]}
      />

      {tab === "interviews" &&
        (data.interviews.length ? (
          <>
            <Group title="Scorecard due" items={due} hrView={hrView} empty="Nothing waiting for your feedback." />
            <Group title="Upcoming" items={upcoming} hrView={hrView} />
            <Group title="Submitted" items={done} hrView={hrView} />
          </>
        ) : (
          <EmptyState icon="calendar" title="No interviews" description="When HR adds you to an interview panel, it shows up here." />
        ))}

      {tab === "requisitions" && (
        <Card>
          <CardHeader title="My requisitions" description="HR reviews role, headcount and budget. Approved requisitions become job openings." />
          <CardBody className="flush">
            <DataTable<Requisition>
              caption="My requisitions"
              rows={data.requisitions}
              rowKey={(row) => row.id}
              empty={<EmptyState icon="clipboard" title="No requisitions yet" description="Raise one when you need to hire or backfill a role." />}
              columns={[
                {
                  key: "role",
                  header: "Role",
                  rowHeader: true,
                  cell: (row) => (
                    <span className="person-text">
                      <span className="person-name">{`${row.openings} × ${row.title}`}</span>
                      <span className="person-role">
                        {row.reference} · {row.department} · {row.location}
                      </span>
                    </span>
                  ),
                },
                { key: "raised", header: "Raised", cell: (row) => <DateText value={row.raisedAt.slice(0, 10)} /> },
                { key: "budget", header: "Budget", cell: (row) => <span className="nowrap">{`${formatMoneyCompact(row.budgetMin)} – ${formatMoneyCompact(row.budgetMax)}`}</span> },
                {
                  key: "status",
                  header: "Status",
                  cell: (row) => (
                    <span className="person-text">
                      <StatusBadge status={requisitionStatus[row.state]} />
                      {row.decisionNote && <span className="person-role">{row.decisionNote}</span>}
                    </span>
                  ),
                },
              ]}
            />
          </CardBody>
        </Card>
      )}

      {tab === "offers" && data.canApproveOffers && (
        <Card>
          <CardHeader title="Offer approvals" description="Offers above the approved requisition budget need Finance approval before HR can extend them. You can't approve an offer you created." />
          <CardBody className="flush">
            <DataTable<Offer>
              caption="Offers awaiting approval"
              rows={data.offerApprovals}
              rowKey={(row) => row.id}
              empty={<EmptyState icon="check" title="No offers to approve" description="Above-budget offers appear here." />}
              columns={[
                {
                  key: "offer",
                  header: "Offer",
                  rowHeader: true,
                  cell: (row) => (
                    <span className="person-text">
                      <span className="person-name">{row.candidateName}</span>
                      <span className="person-role">
                        {row.reference} · {row.designation} · joins <DateText value={row.joiningDate} />
                      </span>
                    </span>
                  ),
                },
                { key: "ctc", header: "CTC", cell: (row) => <MoneyText value={row.ctc} compact /> },
                { key: "budget", header: "Budget max", cell: (row) => <MoneyText value={row.budgetMax} compact /> },
                { key: "by", header: "Created by", hideOnMobile: true, cell: (row) => row.createdBy.name },
                { key: "status", header: "Status", cell: (row) => <StatusBadge status={offerStatus[row.state]} /> },
                { key: "actions", header: "Actions", align: "end", cell: (row) => (row.canApprove ? <OfferApproval offerId={row.id} version={row.version} reference={row.reference} /> : null) },
              ]}
            />
          </CardBody>
        </Card>
      )}
    </div>
  );
}
