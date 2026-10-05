"use client";

import { AppIcon } from "@/components/ui/app-icon";
import { Button } from "@/components/ui/button";

export function PrintButton({ label = "Print or save PDF" }: { label?: string }) {
  return (
    <Button variant="secondary" onClick={() => window.print()} className="no-print">
      <AppIcon name="download" size={20} />
      {label}
    </Button>
  );
}
