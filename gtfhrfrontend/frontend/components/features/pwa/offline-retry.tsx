"use client";

import { useRouter } from "next/navigation";
import { AppIcon } from "@/components/ui/app-icon";
import { Button } from "@/components/ui/button";
import { useOnlineStatus } from "@/hooks/use-online-status";

export function OfflineRetry() {
  const online = useOnlineStatus();
  const router = useRouter();
  return (
    <Button onClick={() => router.push("/dashboard")} className="auth-submit">
      <AppIcon name="refresh" size={20} />
      {online ? "You’re back online — continue" : "Try again"}
    </Button>
  );
}
