import { cookies } from "next/headers";
import { WorkspaceShell } from "@/components/sections/workspace-shell";
import { FoundationSkeleton } from "@/components/ui/skeleton";
import { parseTheme } from "@/lib/utils/theme";

export default async function LoadingPreviewPage() {
  const theme = parseTheme((await cookies()).get("gtf-theme")?.value);
  return (
    <WorkspaceShell theme={theme}>
      <FoundationSkeleton />
    </WorkspaceShell>
  );
}
