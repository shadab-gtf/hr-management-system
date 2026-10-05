import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = process.env.GTF_SESSION_COOKIE ?? "gtf-session";

function toLogin(request: NextRequest) {
  const login = new URL("/login", request.url);
  const next = request.nextUrl.pathname + request.nextUrl.search;
  if (next !== "/dashboard") login.searchParams.set("next", next);
  return NextResponse.redirect(login);
}

/**
 * Early session gate only. Server reads and commands remain responsible for
 * authorization and expiry validation on the backend.
 */
export function runSessionProxy(request: NextRequest) {
  return request.cookies.has(SESSION_COOKIE) ? NextResponse.next() : toLogin(request);
}
