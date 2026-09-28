"use client";

import { useState } from "react";
import type { Member } from "@/types/foundation";
import { MemberTable } from "@/components/ui/member-table";
import { TextInput } from "@/components/ui/field";
import { AppIcon } from "@/components/ui/app-icon";
import { skipToken, useQuery } from "@tanstack/react-query";
import { foundationPeopleKey } from "@/lib/state/query-client";

export function TablePreview({ members }: { members: readonly Member[] }) {
  const [query, setQuery] = useState("");
  const { data: cachedMembers } = useQuery<readonly Member[]>({
    queryKey: foundationPeopleKey,
    queryFn: skipToken,
    initialData: members,
  });
  // Only four public synthetic fixtures. Live HR search will be page/API-owned.
  const shown = (cachedMembers ?? members).filter((member) =>
    `${member.name} ${member.department}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  return (
    <>
      <div className="table-tools">
        <div className="search-field">
          <AppIcon name="search" size={16} />
          <label className="sr-only" htmlFor="sample-search">
            Search sample people
          </label>
          <TextInput
            id="sample-search"
            type="search"
            placeholder="Search sample people…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <span className="muted small" role="status">
          {shown.length} fictional {shown.length === 1 ? "person" : "people"}
        </span>
      </div>
      <MemberTable members={shown} />
      <div className="table-footer">
        <span>All names and records are synthetic.</span>
        <span>Sample 01–04</span>
      </div>
    </>
  );
}
