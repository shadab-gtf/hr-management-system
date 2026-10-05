"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { downloadResumeAction } from "@/lib/actions/recruitment";

export function ResumeDownload({ candidateId }: { candidateId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      size="sm"
      variant="secondary"
      pending={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await downloadResumeAction(candidateId);
          if (!result.ok) {
            toast.error(result.message);
            return;
          }
          const bytes = Uint8Array.from(
            atob(result.file.contentBase64),
            (char) => char.charCodeAt(0),
          );
          const url = URL.createObjectURL(
            new Blob([bytes], { type: result.file.mime }),
          );
          const link = document.createElement("a");
          link.href = url;
          link.download = result.file.fileName.replace(/[\\/\r\n]/g, "_");
          document.body.appendChild(link);
          link.click();
          link.remove();
          window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        })
      }
    >
      {pending ? "Downloading…" : "Download resume"}
    </Button>
  );
}
