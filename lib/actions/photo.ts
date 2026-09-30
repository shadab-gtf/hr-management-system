"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { updateOwnPhoto } from "@/lib/api/photos/photos.service";
import { failure, success } from "@/lib/actions/result";
import type { ActionResult } from "@/types/action";

const PHOTO_MAX_BYTES = 2 * 1024 * 1024;
const photoTypes = z.enum(["image/jpeg", "image/png", "image/webp"]);

/** Updates the signed-in user's own photo; refresh re-renders every avatar. */
export async function updatePhotoAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  try {
    if (formData.get("remove") === "1") {
      await updateOwnPhoto(null);
      refresh();
      return success("Photo removed");
    }
    const file = formData.get("photo");
    if (!(file instanceof File) || file.size === 0)
      return { status: "error", code: "VALIDATION_FAILED", message: "Choose a photo.", fieldErrors: { photo: "Choose a JPEG, PNG or WebP image." }, retryable: false };
    const mime = photoTypes.safeParse(file.type);
    if (!mime.success)
      return { status: "error", code: "VALIDATION_FAILED", message: "Use a JPEG, PNG or WebP image.", fieldErrors: { photo: "Use a JPEG, PNG or WebP image." }, retryable: false };
    if (file.size > PHOTO_MAX_BYTES)
      return { status: "error", code: "VALIDATION_FAILED", message: "Photos must be 2 MB or smaller.", fieldErrors: { photo: "Choose an image up to 2 MB." }, retryable: false };
    await updateOwnPhoto({ data: new Uint8Array(await file.arrayBuffer()), mime: mime.data });
    refresh();
    return success("Profile photo updated");
  } catch (error) {
    return failure(error);
  }
}
