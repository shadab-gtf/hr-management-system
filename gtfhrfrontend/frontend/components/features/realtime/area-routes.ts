import type { RealtimeArea } from "@/types/realtime";

/**
 * Which pages show data from which realtime area. A `changed` signal refreshes the current page only when it
 * belongs to that area. Overview pages (dashboard, approvals, requests, home) aggregate every area.
 */
const AREA_ROUTES: Record<RealtimeArea, readonly string[]> = {
  people: [
    "/employees",
    "/me/profile",
    "/admin/organization",
    "/admin/requests",
  ],
  time: [
    "/attendance",
    "/timesheets",
    "/admin/attendance-import",
    "/admin/attendance-rules",
  ],
  leave: ["/leave", "/admin/leave-policy", "/admin/holidays"],
  pay: [
    "/payroll",
    "/salary",
    "/me/payslips",
    "/expenses",
    "/admin/settlements",
  ],
  talent: ["/performance", "/recruitment", "/admin/performance"],
  lifecycle: [
    "/admin/onboarding",
    "/admin/offboarding",
    "/me/resignation",
    "/admin/letters",
    "/admin/settlements",
  ],
  workplace: [
    "/helpdesk",
    "/documents",
    "/me/assets",
    "/admin/assets",
    "/admin/policies",
    "/admin/letters",
    "/admin/requests",
    "/notifications",
    "/settings",
  ],
  engage: [
    "/engage",
    "/admin/announcements",
    "/admin/events",
    "/admin/surveys",
  ],
  access: ["/admin/access", "/admin/audit", "/settings/security", "/delegates"],
  reports: ["/admin/reports"],
};

const OVERVIEW_ROUTES = ["/dashboard", "/approvals", "/requests", "/more"];

const matches = (pathname: string, prefix: string) =>
  pathname === prefix || pathname.startsWith(`${prefix}/`);

export function routeShowsArea(pathname: string, area: RealtimeArea): boolean {
  return (
    OVERVIEW_ROUTES.some((prefix) => matches(pathname, prefix)) ||
    AREA_ROUTES[area].some((prefix) => matches(pathname, prefix))
  );
}
