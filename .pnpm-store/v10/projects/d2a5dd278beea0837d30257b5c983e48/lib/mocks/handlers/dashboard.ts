import "server-only";
import { db } from "@/lib/mocks/store";
import { celebrationSettings, departmentNames, leaveTypes, listEvents } from "@/lib/mocks/handlers/config";
import { addDays, diffDays, monthOf } from "@/lib/utils/date";
import { attendanceDay, teamAttendance } from "@/lib/mocks/handlers/attendance";
import { listApprovals } from "@/lib/mocks/handlers/approvals";
import { payrollOverview } from "@/lib/mocks/handlers/payroll";
import { can, directReports, me, ref, refById, type MockActor } from "@/lib/mocks/handlers/shared";
import type { HomeInsights } from "@/types/dashboard";
import type { WhoIsOut } from "@/types/home-widgets";
import type { Celebration, HomeTask } from "@/types/workplace";

export function homeInsights(actor: MockActor): HomeInsights {
  const store = db();
  const employee = me(actor);
  const tasks: HomeTask[] = [];

  const reviewDay = [...Array(14).keys()]
    .map((back) => attendanceDay(employee, addDays(store.today, -(back + 1))))
    .find((day) => day?.state === "needs_review" && !day.regularization);
  if (reviewDay)
    tasks.push({
      id: "task_regularize",
      title: "Fix a missing check-out",
      detail: `${reviewDay.exception} — submit a correction before the window closes.`,
      href: `/attendance?correct=${reviewDay.date}`,
      due: addDays(reviewDay.date, 45),
      tone: "danger",
    });

  const awaiting = store.tickets.find((ticket) => ticket.employeeId === employee.id && ticket.state === "awaiting_you");
  if (awaiting)
    tasks.push({ id: "task_ticket", title: "HR is waiting on you", detail: awaiting.subject, href: "/helpdesk", due: null, tone: "warning" });

  const scanning = store.documents.find((doc) => doc.employeeId === employee.id && doc.scanState === "scanning");
  if (scanning)
    tasks.push({ id: "task_doc", title: "Document verification in progress", detail: scanning.name, href: "/documents", due: null, tone: "info" });

  let team: HomeInsights["team"] = null;
  if (can(actor, "approval.decide")) {
    const pending = listApprovals(actor, "pending").length;
    if (pending)
      tasks.unshift({ id: "task_approvals", title: `${pending} request${pending === 1 ? "" : "s"} need your decision`, detail: "Leave, attendance corrections and expense claims.", href: "/approvals", due: null, tone: "warning" });
    if (can(actor, "attendance.read.team")) {
      const rows = teamAttendance(actor);
      team = {
        size: rows.length,
        checkedIn: rows.filter((row) => row.state === "checked_in" || row.state === "checked_out").length,
        onLeave: rows.filter((row) => row.state === "unavailable").length,
        pendingApprovals: pending,
      };
    }
  }

  let payroll: HomeInsights["payroll"] = null;
  if (can(actor, "payroll.prepare") || can(actor, "payroll.approve")) {
    const current = payrollOverview(actor).current;
    if (current) {
      payroll = { runId: current.id, periodLabel: current.periodLabel, state: current.state, employeeCount: current.employeeCount };
      const operatorTurn = can(actor, "payroll.submit") && current.state === "calculated";
      const approverTurn = can(actor, "payroll.approve") && (current.state === "in_review" || current.state === "approved");
      if (operatorTurn || approverTurn)
        tasks.unshift({
          id: "task_payroll",
          title: operatorTurn ? `Submit ${current.periodLabel} payroll for review` : `Review ${current.periodLabel} payroll`,
          detail: `${current.employeeCount} employees · ${current.warnings} warnings`,
          href: `/payroll/runs/${current.id}`,
          due: current.paymentDate,
          tone: "warning",
        });
    }
  }

  const active = store.employees.filter((person) => person.status !== "exited");
  let workforce: HomeInsights["workforce"] = null;
  if (can(actor, "employee.read")) {
    const month = monthOf(store.today);
    workforce = {
      headcount: active.length,
      joinersThisMonth: active.filter((person) => monthOf(person.joinedOn) === month).length,
      onNotice: active.filter((person) => person.status === "notice").length,
      openTickets: store.tickets.filter((ticket) => ticket.state === "open" || ticket.state === "in_progress").length,
      byDepartment: departmentNames()
        .map((name) => ({ name, count: active.filter((person) => person.department === name).length }))
        .sort((a, b) => b.count - a.count),
    };
  }

  // Work anniversaries and joiners only — birth dates are private (security.md).
  const celebrations: Celebration[] = [];
  const show = celebrationSettings();
  for (const person of active) {
    const days = diffDays(person.joinedOn, store.today);
    if (show.showNewJoiners && days >= 0 && days <= 21)
      celebrations.push({ person: ref(person), kind: "new_joiner", date: person.joinedOn, detail: `Joined ${person.department}` });
    const years = Number(store.today.slice(0, 4)) - Number(person.joinedOn.slice(0, 4));
    const anniversary = `${store.today.slice(0, 4)}${person.joinedOn.slice(4)}`;
    const until = diffDays(store.today, anniversary);
    if (show.showWorkAnniversaries && years > 0 && until >= 0 && until <= 30)
      celebrations.push({ person: ref(person), kind: "work_anniversary", date: anniversary, detail: `${years} year${years === 1 ? "" : "s"} at GTF` });
  }
  celebrations.sort((a, b) => a.date.localeCompare(b.date));

  const events = listEvents(actor, { upcomingOnly: true, department: employee.department }).slice(0, 4);
  return { tasks: tasks.slice(0, 5), celebrations: celebrations.slice(0, 6), events, team, workforce, payroll };
}

/**
 * Approved leave only (pending requests stay private to the approver).
 * HR sees the organization, managers their reports, everyone else their department.
 */
export function whoIsOut(actor: MockActor): WhoIsOut {
  const store = db();
  const employee = me(actor);
  const scope: WhoIsOut["scope"] = can(actor, "employee.read") ? "organization" : directReports(actor.employeeId).length ? "team" : "department";
  const inScope = new Set(
    store.employees
      .filter((person) => person.status !== "exited" && person.id !== employee.id)
      .filter((person) => (scope === "organization" ? true : scope === "team" ? person.managerId === employee.id : person.department === employee.department))
      .map((person) => person.id),
  );
  const names = new Map(leaveTypes().map((type) => [type.id, type.name]));
  const weekEnd = addDays(store.today, 7);
  const approved = store.leaveRequests.filter((request) => request.state === "approved" && inScope.has(request.employeeId));
  const person = (id: string) => refById(id);
  const today = approved
    .filter((request) => request.startDate <= store.today && request.endDate >= store.today)
    .flatMap((request) => {
      const who = person(request.employeeId);
      return who ? [{ person: who, leaveType: names.get(request.leaveTypeId) ?? "Leave", until: request.endDate }] : [];
    });
  const upcoming = approved
    .filter((request) => request.startDate > store.today && request.startDate <= weekEnd)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .flatMap((request) => {
      const who = person(request.employeeId);
      return who ? [{ person: who, leaveType: names.get(request.leaveTypeId) ?? "Leave", from: request.startDate, to: request.endDate }] : [];
    });
  return { scope, today: today.slice(0, 8), upcoming: upcoming.slice(0, 6) };
}
