import Link from "next/link";
import { AppIcon } from "@/components/ui/app-icon";

export default function NotFound() {
  return (
    <main className="error-state">
      <span className="empty-icon">
        <AppIcon name="search" size={32} />
      </span>
      <p className="page-eyebrow">404 · PAGE NOT FOUND</p>
      <h1>We couldn’t find that page</h1>
      <p>It may have moved, or you may not have access to it.</p>
      <Link className="button button--primary" href="/dashboard">
        Go to home
      </Link>
    </main>
  );
}
