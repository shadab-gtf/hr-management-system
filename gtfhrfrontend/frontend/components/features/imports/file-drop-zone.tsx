"use client";

import { useRef, useState, type DragEvent } from "react";
import { AppIcon } from "@/components/ui/app-icon";
import { cn } from "@/lib/utils/cn";

/**
 * Drag-and-drop or click-to-choose file field. The dropped file is placed in a
 * real <input type="file"> so the form submits it normally (keyboard and
 * screen readers use the input directly).
 */
export function FileDropZone({ name, label, hint, accept, error, errorId }: { name: string; label: string; hint: string; accept: string; error?: string | undefined; errorId: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const stop = (event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };
  return (
    <label
      className={cn("file-drop", dragging && "file-drop--active")}
      onDragEnter={(event) => {
        stop(event);
        setDragging(true);
      }}
      onDragOver={stop}
      onDragLeave={(event) => {
        stop(event);
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(event) => {
        stop(event);
        setDragging(false);
        const files = event.dataTransfer.files;
        if (input.current && files.length) {
          input.current.files = files;
          setFileName(files[0]?.name ?? null);
        }
      }}
    >
      <AppIcon name="upload" size={24} />
      <strong className="file-drop-title">{fileName ?? "Drag the file here, or choose it"}</strong>
      <span>{hint}</span>
      <input
        ref={input}
        type="file"
        name={name}
        accept={accept}
        aria-label={label}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => setFileName(event.target.files?.[0]?.name ?? null)}
      />
    </label>
  );
}
