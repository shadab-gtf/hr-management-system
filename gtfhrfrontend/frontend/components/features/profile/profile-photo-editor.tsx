"use client";

import { useEffect, useRef, useState } from "react";
import { CameraCapture } from "@/components/features/pwa/camera-capture";
import { AppIcon } from "@/components/ui/app-icon";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/display";
import { Sheet } from "@/components/ui/sheet";
import { useCommand } from "@/hooks/use-command";
import { updatePhotoAction } from "@/lib/actions/photo";

/** Own photo only. The new photo appears after the server confirms the upload. */
export function ProfilePhotoEditor({ id, initials, photoUrl }: { id: string; initials: string; photoUrl: string | null }) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [intent, setIntent] = useState<"upload" | "remove">("upload");
  const fileInput = useRef<HTMLInputElement>(null);
  const { submit, pending, fieldError, formError } = useCommand(updatePhotoAction, {
    onSuccess: () => {
      setOpen(false);
      setPreview(null);
    },
  });

  // Release the object URL when the preview changes or the editor unmounts.
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const error = fieldError("photo") ?? formError;
  return (
    <>
      <button type="button" className="photo-edit" onClick={() => setOpen(true)} aria-label="Change profile photo">
        <Avatar initials={initials} seed={id} src={photoUrl} size="xl" />
        <span className="photo-edit-badge" aria-hidden="true">
          <AppIcon name="edit" size={16} />
        </span>
      </button>
      <Sheet
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setPreview(null);
        }}
        title="Profile photo"
        description="Colleagues see this photo across GTF HR."
        dismissible={!pending}
      >
        <form onSubmit={submit} className="form">
          <div className="photo-preview">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element -- local blob preview, never optimized
              <img src={preview} alt="New photo preview" width={120} height={120} className="photo-preview-img" />
            ) : (
              <Avatar initials={initials} seed={id} src={photoUrl} size="xl" className="avatar--preview" />
            )}
          </div>
          <label className="file-drop">
            <AppIcon name="upload" size={24} />
            <span>JPEG, PNG or WebP · up to 2 MB</span>
            <input
              ref={fileInput}
              type="file"
              name="photo"
              accept="image/jpeg,image/png,image/webp"
              capture="user"
              aria-invalid={Boolean(fieldError("photo"))}
              onChange={(event) => {
                const file = event.target.files?.[0];
                setPreview(file ? URL.createObjectURL(file) : null);
              }}
            />
          </label>
          <CameraCapture
            label="Take a photo"
            onCapture={(file) => {
              const transfer = new DataTransfer();
              transfer.items.add(file);
              if (fileInput.current) fileInput.current.files = transfer.files;
              setPreview(URL.createObjectURL(file));
            }}
          />
          {error && (
            <Alert tone="danger" live title="Photo not saved">
              {error}
            </Alert>
          )}
          <div className="sheet-actions">
            {photoUrl && (
              <Button type="submit" name="remove" value="1" variant="ghost" onClick={() => setIntent("remove")} disabled={pending}>
                Remove photo
              </Button>
            )}
            <Button type="submit" pending={pending && intent === "upload"} disabled={pending || !preview} onClick={() => setIntent("upload")}>
              {pending && intent === "upload" ? "Saving…" : "Save photo"}
            </Button>
          </div>
        </form>
      </Sheet>
    </>
  );
}
