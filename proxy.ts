import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = process.env.GTF_SESSION_COOKIE ?? "gtf-session";

/**
 * Optimistic check only: send visitors without a session cookie to sign-in.
 * Real authorization happens on every server read and command.
 */
export function proxy(request: NextRequest) {
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();
  const login = new URL("/login", request.url);
  const next = request.nextUrl.pathname + request.nextUrl.search;
  if (next !== "/dashboard") login.searchParams.set("next", next);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/me/:path*",
    "/employees/:path*",
    "/attendance/:path*",
    "/leave/:path*",
    "/approvals/:path*",
    "/payroll/:path*",
    "/expenses/:path*",
    "/helpdesk/:path*",
    "/documents/:path*",
    "/notifications/:path*",
    "/settings/:path*",
    "/more/:path*",
    "/engage/:path*",
    "/salary/:path*",
    "/requests/:path*",
    "/delegates/:path*",
    "/admin/:path*",
    "/timesheets/:path*",
    "/performance/:path*",
    "/recruitment/:path*",
  ],
};
