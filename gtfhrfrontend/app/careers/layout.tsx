import type { ReactNode } from "react";
import { getSession } from "@/lib/api/session/session.service";
import { CareersShell } from "@/components/sections/recruitment/careers-sections";

/* Public careers site: no sign-in required. Signed-in employees can also refer. */
export default async function CareersLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  return <CareersShell signedIn={Boolean(session)}>{children}</CareersShell>;
}
