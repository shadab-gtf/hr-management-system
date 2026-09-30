"use client";

import { useOptimistic, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { AppIcon } from "@/components/ui/app-icon";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/field";
import { useCommand } from "@/hooks/use-command";
import { commentAction, deletePostAction, reactAction } from "@/lib/actions/engage";
import { cn } from "@/lib/utils/cn";
import type { Post, ReactionKind } from "@/types/engage";

const labels: Record<ReactionKind, { emoji: string; label: string }> = {
  like: { emoji: "👍", label: "Like" },
  celebrate: { emoji: "🎉", label: "Celebrate" },
  support: { emoji: "💛", label: "Support" },
  insightful: { emoji: "💡", label: "Insightful" },
};

/** Reactions are optimistic (harmless preference); comments wait for the server. */
export function PostInteractions({ post }: { post: Post }) {
  const [reactions, applyReaction] = useOptimistic(post.reactions, (state, kind: ReactionKind) =>
    state.map((item) => (item.kind === kind ? { ...item, mine: !item.mine, count: item.count + (item.mine ? -1 : 1) } : item)),
  );
  const [, startTransition] = useTransition();
  const [commenting, setCommenting] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const { submit, pending, fieldError } = useCommand(commentAction, { toast: false, onSuccess: () => form.current?.reset() });

  return (
    <>
      <div className="post-actions">
        <div className="reaction-row" role="group" aria-label="Reactions">
          {reactions.map((reaction) => (
            <button
              key={reaction.kind}
              type="button"
              className={cn("reaction", reaction.mine && "reaction--mine")}
              aria-pressed={reaction.mine}
              aria-label={`${labels[reaction.kind].label}${reaction.count ? `, ${reaction.count}` : ""}`}
              onClick={() =>
                startTransition(async () => {
                  applyReaction(reaction.kind);
                  await reactAction(post.id, reaction.kind);
                })
              }
            >
              <span aria-hidden="true">{labels[reaction.kind].emoji}</span>
              {reaction.count > 0 && <span className="num">{reaction.count}</span>}
            </button>
          ))}
        </div>
        <button type="button" className="button button--ghost button--sm" aria-expanded={commenting} onClick={() => setCommenting((value) => !value)}>
          <AppIcon name="helpdesk" size={16} />
          {post.comments.length ? `${post.comments.length} comment${post.comments.length === 1 ? "" : "s"}` : "Comment"}
        </button>
        {post.canDelete && (
          <button
            type="button"
            className="button button--ghost button--sm push-end"
            onClick={() =>
              startTransition(async () => {
                const result = await deletePostAction(post.id);
                if (result.status === "error") toast.error(result.message);
              })
            }
          >
            Remove
          </button>
        )}
      </div>
      {(commenting || post.comments.length > 0) && (
        <div className="comments">
          {post.comments.map((item) => (
            <p key={item.id} className="comment">
              <strong>{item.author.name}</strong> {item.body}
            </p>
          ))}
          {commenting && (
            <form ref={form} onSubmit={submit} className="comment-form" noValidate>
              <input type="hidden" name="postId" value={post.id} />
              <label className="sr-only" htmlFor={`c-${post.id}`}>
                Write a comment
              </label>
              <TextInput id={`c-${post.id}`} name="body" placeholder="Write a comment…" maxLength={500} autoFocus aria-invalid={Boolean(fieldError("body"))} />
              <Button type="submit" size="sm" pending={pending}>
                {pending ? "Sending…" : "Send"}
              </Button>
            </form>
          )}
        </div>
      )}
    </>
  );
}
