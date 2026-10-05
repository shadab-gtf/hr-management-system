"use client";

import { useRef, useState } from "react";
import { AppIcon } from "@/components/ui/app-icon";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/display";
import { SelectInput, TextArea } from "@/components/ui/field";
import { DraftNotice } from "@/components/features/drafts/draft-notice";
import { useCommand } from "@/hooks/use-command";
import { createPostAction } from "@/lib/actions/engage";

export function PostComposer({ me, groups }: { me: { id: string; initials: string; firstName: string; photoUrl: string | null }; groups: string[] }) {
  const form = useRef<HTMLFormElement>(null);
  const [length, setLength] = useState(0);
  const { formRef, draft, submit, pending, fieldError, formError } = useCommand(createPostAction, { draftKey: "post.new", form,
    onSuccess: () => {
      form.current?.reset();
      setLength(0);
    },
  });
  const error = fieldError("body") ?? formError;
  return (
    <form ref={formRef} onSubmit={submit} className="composer" noValidate>
      <DraftNotice draft={draft} />
      <Avatar initials={me.initials} seed={me.id} src={me.photoUrl} size="lg" />
      <div className="composer-body">
        <label className="sr-only" htmlFor="post-body">
          Write a post
        </label>
        <TextArea
          id="post-body"
          name="body"
          rows={2}
          maxLength={1000}
          placeholder={`Share an update, a win or a thank-you, ${me.firstName}…`}
          onChange={(event) => setLength(event.target.value.length)}
          aria-invalid={Boolean(fieldError("body"))}
        />
        {error && (
          <Alert tone="danger" live>
            {error}
          </Alert>
        )}
        <div className="composer-actions">
          <label className="sr-only" htmlFor="post-group">
            Group
          </label>
          <SelectInput id="post-group" name="group" defaultValue="General" options={groups.map((group) => ({ value: group, label: group }))} className="composer-group" />
          <span className="small muted num">{length}/1000</span>
          <Button type="submit" pending={pending} disabled={pending || length < 3}>
            <AppIcon name="send" size={16} />
            {pending ? "Posting…" : "Post"}
          </Button>
        </div>
      </div>
    </form>
  );
}
