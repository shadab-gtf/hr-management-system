import type { Metadata } from "next";
import Image from "next/image";
import { OfflineRetry } from "@/components/features/pwa/offline-retry";

export const metadata: Metadata = { title: "Offline" };
// Public and data-free so the service worker can cache it safely.
export const dynamic = "force-static";

export default function OfflinePage() {
  return (
    <main className="auth">
      <div className="auth-card offline-card">
        <Image src="/brand/gtf-logo.png" alt="GTF Technologies" width={500} height={277} sizes="96px" className="auth-logo" />
        <h1>You’re offline</h1>
        <p className="muted">
          GTF HR needs a connection to show your attendance, leave and pay. Nothing is stored on this device, so reconnect to continue.
        </p>
        <OfflineRetry />
      </div>
    </main>
  );
}
