"use client";

import { ErrorState } from "@/components/ui/error-state";

export default function CareersError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorState reset={reset} title="Careers couldn’t load" homeHref="/careers" />;
}
