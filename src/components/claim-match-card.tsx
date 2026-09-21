"use client";

import { useEffect, useRef, useState } from "react";

import { ActionButton, type ApiResult } from "@/components/match-actions";
import { FixtureLine } from "@/components/match-display";
import { Card } from "@/components/ui";
import { formatDateTime } from "@/lib/dates";
import type { MatchListItem } from "@/lib/queries";

export function ClaimMatchCard({ match }: { match: MatchListItem }) {
  const [claimed, setClaimed] = useState(false);
  const [fading, setFading] = useState(false);
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (fadeTimer.current) clearTimeout(fadeTimer.current);
    },
    [],
  );

  const handleDone = (result: ApiResult) => {
    if (!result.ok) return;
    setClaimed(true);
    fadeTimer.current = setTimeout(() => setFading(true), 1000);
  };

  return (
    <Card
      as="li"
      className={[
        "p-4 transition-all duration-1000",
        claimed ? "border-success/40 bg-success/5" : "",
        fading ? "translate-y-[-0.25rem] opacity-0" : "opacity-100",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-muted text-xs">
            {match.division.name} &middot; MW {match.matchweek}
          </p>
          <FixtureLine className="mt-0.5" match={match} href={`/referee/${match.id}`} />
          <p className="text-muted text-sm">
            {formatDateTime(match.kickoffAt)}
            {match.venueName ? ` \u00b7 ${match.venueName}` : ""}
          </p>
        </div>
        <ActionButton
          url={`/api/matches/${match.id}/assign`}
          body={{ expectedVersion: match.version }}
          label="Assign me"
          variant="outline"
          pendingLabel={"Claiming\u2026"}
          successLabel="Claimed"
          successDelayMs={2000}
          onDone={handleDone}
        />
      </div>
    </Card>
  );
}
