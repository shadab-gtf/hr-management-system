"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { updateOnboardingTask } from "@/lib/api/admin/admin.service";
import { createAnnouncement, deleteAnnouncement, editAnnouncement } from "@/lib/api/announcements/announcements.service";
import { failure, formObject, idempotencyKeySchema, success, validationError } from "@/lib/actions/result";
import { announcementInputSchema } from "@/types/admin";
import type { ActionResult } from "@/types/action";

export async function publishAnnouncementAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const fields = formObject(formData);
  const parsed = announcementInputSchema.safeParse({ ...fields, id: fields.id || undefined, pinned: fields.pinned === "on" });
  if (!parsed.success) return validationError(parsed.error);
  const key = idempotencyKeySchema.safeParse(fields.idempotencyKey);
  if (!key.success) return validationError(key.error);
  try {
    const { id } = parsed.data;
    const result = id ? await editAnnouncement({ ...parsed.data, id }) : await createAnnouncement(parsed.data, key.data);
    refresh();
    const audience = parsed.data.audience === "Everyone" ? "everyone" : parsed.data.audience;
    if (id) return success("Announcement updated");
    return success(result.scheduled ? `Scheduled for ${audience}` : `Published to ${audience}`);
  } catch (error) {
    return failure(error);
  }
}

export async function archiveAnnouncementAction(id: string): Promise<ActionResult> {
  try {
    await deleteAnnouncement(z.string().min(1).parse(id));
    refresh();
    return success("Announcement archived");
  } catch (error) {
    return failure(error);
  }
}

const taskSchema = z.object({ employeeId: z.string().min(1), taskId: z.string().min(1), done: z.boolean() });

export async function toggleOnboardingTaskAction(employeeId: string, taskId: string, done: boolean): Promise<ActionResult> {
  const parsed = taskSchema.safeParse({ employeeId, taskId, done });
  if (!parsed.success) return validationError(parsed.error);
  try {
    await updateOnboardingTask(parsed.data.employeeId, parsed.data.taskId, parsed.data.done);
    refresh();
    return success(done ? "Task completed" : "Task reopened");
  } catch (error) {
    return failure(error);
  }
}
