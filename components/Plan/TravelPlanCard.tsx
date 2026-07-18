"use client";

import { Compass, Footprints, Route, ScrollText, Wallet } from "lucide-react";
import type { TravelProfile } from "@/types/message";

interface TravelPlanCardProps {
  questName: string;
  locationLabel: string;
  /** What the guide learned in planning mode. Null until it saves a profile. */
  profile?: TravelProfile | null;
}

const ACTIVITY_COPY: Record<NonNullable<TravelProfile["activityLevel"]>, string> = {
  spry: "Up for anything",
  moderate: "A steady pace",
  restful: "Slow and restful",
};

const BUDGET_COPY: Record<NonNullable<TravelProfile["budget"]>, string> = {
  "free-spending": "Spending freely",
  moderate: "A middling budget",
  frugal: "Travelling frugally",
};

function durationCopy(days: number | null): string | null {
  if (days === null || !Number.isFinite(days) || days <= 0) return null;
  return days === 1 ? "One day" : `${Math.round(days)} days`;
}

export function TravelPlanCard({ questName, locationLabel, profile }: TravelPlanCardProps) {
  // Only the facts the guide actually captured are shown. The traveler is free
  // to skip any question, so a half-filled profile is a normal outcome, not an
  // excuse to invent the rest.
  const facts = profile
    ? [
        { icon: Compass, label: durationCopy(profile.durationDays) },
        {
          icon: ScrollText,
          label: profile.interests.length ? profile.interests.join(", ") : null,
        },
        {
          icon: Footprints,
          label: profile.activityLevel ? ACTIVITY_COPY[profile.activityLevel] : null,
        },
        { icon: Wallet, label: profile.budget ? BUDGET_COPY[profile.budget] : null },
      ].filter((fact): fact is { icon: typeof Compass; label: string } => fact.label !== null)
    : [];

  return (
    // Everything shares one screen with the map and the transcript, so the plan
    // stays a single compact strip: a title row, then whatever the guide knows
    // as chips that scroll sideways rather than stacking downward.
    <section className="relative mt-3 shrink-0 overflow-hidden rounded-xl border-2 border-[#c7ac84] bg-[#eadfca] px-3 py-2.5 shadow-soft">
      <div className="flex items-center gap-2.5">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border-2 border-[#31101b] bg-[#8a293c] text-[#f5d58a] shadow-sm">
          <Route className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#9c3b43]">
            Your travel plan
          </p>
          <h2 className="truncate text-sm font-semibold tracking-tight text-[#31101b]">
            {questName}
          </h2>
        </div>
        <p className="max-w-[38%] shrink-0 truncate text-[10px] font-semibold text-[#9c3b43]">
          {locationLabel || "Your current area"}
        </p>
      </div>

      {facts.length > 0 ? (
        <div className="chat-scroll mt-2 flex gap-2 overflow-x-auto">
          {facts.map(({ icon: Icon, label }) => (
            <div
              key={label}
              className="flex shrink-0 items-center gap-1.5 rounded-full border border-[#d5bd94] bg-[#fffaf0] px-2.5 py-1 text-[11px] font-bold text-[#31101b]"
            >
              <Icon className="size-3.5 shrink-0 text-[#9c3b43]" />
              <span className="max-w-[10rem] truncate">{label}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-[#725452]">
          <ScrollText className="size-3.5 shrink-0 text-[#c67c2e]" />
          <span className="truncate">Still getting acquainted — keep talking to fill this in.</span>
        </div>
      )}
    </section>
  );
}
