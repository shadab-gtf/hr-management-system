import type { NextRequest } from "next/server";

import { runSessionProxy } from "@/middleware/session-proxy";

export async function proxy(request: NextRequest) {
  return runSessionProxy(request);
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
