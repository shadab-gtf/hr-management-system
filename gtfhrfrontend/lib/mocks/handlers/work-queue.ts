import "server-only";
import { db, employeeById } from "@/lib/mocks/store";
import { can, type MockActor } from "@/lib/mocks/handlers/shared";
import type { WorkQueueItem } from "@/types/approval";

/*
 * Decisions that live on their own module pages (comp-off, rosters,
 * timesheets, exits, performance, recruitment, assets). The approvals inbox
 * lists them as counts with a link, so nothing waiting on the actor is missed.
 * Each module page still enforces its own rules and permissions.
 */

export function workQueue(actor: MockActor): WorkQueueItem[] {
  const store = db();
  const me = actor.employeeId;
  const reportsTo = (employeeId: string) => employeeById(employeeId)?.managerId === me;
  const items: WorkQueueItem[] = [];
  const add = (item: WorkQueueItem) => {
    if (item.count > 0) items.push(item);
  };

  if (can(actor, "approval.decide")) {
    add({
      key: "comp-off",
      label: "Comp-off claims",
      detail: "Worked week-offs and holidays from your team",
      icon: "calendarCheck",
      href: "/leave/comp-off",
      count: store.compOffClaims.filter((claim) => claim.state === "pending" && claim.approverId === me).length,
    });
  }
  if (can(actor, "roster.manage")) {
    add({
      key: "shift-swaps",
      label: "Shift swap requests",
      detail: "Swaps between two colleagues",
      icon: "swap",
      href: "/attendance/roster",
      count: store.rosterSwaps.filter((swap) => swap.state === "pending" && swap.requesterId !== me && (reportsTo(swap.requesterId) || can(actor, "policy.publish"))).length,
    });
  }
  if (can(actor, "employee.update")) {
    add({
      key: "encashment",
      label: "Leave encashment",
      detail: "Payout requests within policy limits",
      icon: "moneyIn",
      href: "/leave/comp-off",
      count: store.leaveEncashments.filter((request) => request.state === "pending" && request.employeeId !== me).length,
    });
  }
  if (can(actor, "timesheet.approve")) {
    add({
      key: "timesheets",
      label: "Timesheets",
      detail: "Submitted weeks from your reports",
      icon: "task",
      href: "/timesheets/team",
      count: store.tsWeeks.filter((week) => week.status === "submitted" && reportsTo(week.employeeId)).length,
    });
  }
  add({
    key: "resignations-manager",
    label: "Resignations from your team",
    detail: "Accept, hold or reject before HR decides",
    icon: "userRemove",
    href: "/me/resignation",
    count: store.lcResignations.filter((item) => item.state === "pending_manager" && reportsTo(item.employeeId)).length,
  });
  if (can(actor, "onboarding.manage")) {
    add({
      key: "resignations-hr",
      label: "Resignations for HR",
      detail: "Agree the last working day and open the exit",
      icon: "userRemove",
      href: "/admin/offboarding",
      count: store.lcResignations.filter((item) => item.state === "pending_hr" && item.employeeId !== me).length,
    });
  }
  if (can(actor, "settlement.approve")) {
    add({
      key: "settlements",
      label: "F&F settlements",
      detail: "Prepared settlements awaiting an independent approver",
      icon: "calculator",
      href: "/admin/settlements",
      count: store.lcSettlements.filter((item) => item.state === "submitted" && item.preparedById !== me && item.employeeId !== me).length,
    });
  }
  if (can(actor, "asset.manage")) {
    add({
      key: "asset-requests",
      label: "Asset requests",
      detail: "Laptops, phones and other equipment",
      icon: "box",
      href: "/admin/assets",
      count: store.lcAssetRequests.filter((item) => item.state === "pending").length,
    });
  }
  if (can(actor, "performance.review")) {
    add({
      key: "goal-sheets",
      label: "Goal sheets",
      detail: "Goals submitted for your approval",
      icon: "flag",
      href: "/performance/team",
      count: store.perfSheets.filter((sheet) => sheet.status === "submitted" && reportsTo(sheet.employeeId)).length,
    });
  }
  if (can(actor, "recruitment.manage")) {
    add({
      key: "requisitions",
      label: "Hiring requisitions",
      detail: "New and backfill positions raised by managers",
      icon: "userAdd",
      href: "/recruitment",
      count: store.recruitmentRequisitions.filter((item) => item.state === "pending" && item.raisedBy !== me).length,
    });
  }
  if (can(actor, "payroll.approve")) {
    add({
      key: "offers",
      label: "Offers over budget",
      detail: "Offer CTC above the approved requisition",
      icon: "briefcase",
      href: "/recruitment/interviews",
      count: store.recruitmentOffers.filter((offer) => offer.state === "pending_approval" && offer.createdBy !== me).length,
    });
  }
  if (can(actor, "candidate.interview")) {
    add({
      key: "scorecards",
      label: "Interview scorecards",
      detail: "Interviews where your feedback is still due",
      icon: "clipboard",
      href: "/recruitment/interviews",
      count: store.recruitmentInterviews.filter(
        (interview) => interview.state === "scheduled" && interview.panelIds.includes(me) && !interview.scorecards.some((card) => card.panelistId === me),
      ).length,
    });
  }
  return items;
}
