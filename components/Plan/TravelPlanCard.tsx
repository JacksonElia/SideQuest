"use client";

import { Compass, Footprints, MapPin, Route, ScrollText, Wallet } from "lucide-react";
import type { Quest, TravelProfile } from "@/types/message";

/** A stop retrieved for the quest, trimmed to what this card renders. */
export interface QuestPlace {
  name: string;
  detail: string | null;
}

interface TravelPlanCardProps {
  questName: string;
  locationLabel: string;
  /** What the guide learned in planning mode. Null until it saves a profile. */
  profile?: TravelProfile | null;
  /** Stops retrieved from the profile-driven quest plan. Empty until it lands. */
  places?: QuestPlace[];
  /** Quest suggestions generated from the retrieved stops. Empty until they land. */
  quests?: Quest[];
  isLoadingPlaces?: boolean;
  placesError?: string | null;
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

export function TravelPlanCard({
  questName,
  locationLabel,
  profile,
  places = [],
  quests = [],
  isLoadingPlaces = false,
  placesError = null,
}: TravelPlanCardProps) {
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
    <section className="relative mt-3 flex h-[clamp(10rem,24dvh,13rem)] shrink-0 flex-col overflow-hidden rounded-xl border-2 border-[#c7ac84] bg-[#eadfca] px-3 py-2.5 shadow-soft">
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

      <div className="chat-scroll mt-2 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {facts.length > 0 ? (
          <div className="grid grid-cols-2 gap-1.5">
            {facts.map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex min-w-0 items-center gap-1.5 rounded-lg border border-[#d5bd94] bg-[#fffaf0] px-2.5 py-1.5 text-[11px] font-bold text-[#31101b]"
              >
                <Icon className="size-3.5 shrink-0 text-[#9c3b43]" />
                <span className="truncate">{label}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#725452]">
            <ScrollText className="size-3.5 shrink-0 text-[#c67c2e]" />
            <span>Still getting acquainted — keep talking to fill this in.</span>
          </div>
        )}

        {isLoadingPlaces ? (
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#725452]">
            <MapPin className="size-3.5 shrink-0 animate-pulse text-[#c67c2e]" />
            <span>Finding places that match your plan…</span>
          </div>
        ) : placesError ? (
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#9c3b43]">
            <MapPin className="size-3.5 shrink-0" />
            <span>{placesError}</span>
          </div>
        ) : places.length > 0 ? (
          <ul className="flex flex-col gap-1.5">
            {places.map((place) => (
              <li
                key={place.name}
                className="flex flex-col gap-0.5 rounded-lg border border-[#d5bd94] bg-[#fffaf0] px-2.5 py-2"
              >
                <span className="flex items-center gap-1 text-[11px] font-bold text-[#31101b]">
                  <MapPin className="size-3 shrink-0 text-[#9c3b43]" />
                  <span>{place.name}</span>
                </span>
                {place.detail ? (
                  <span className="line-clamp-2 text-[10px] font-medium text-[#725452]">
                    {place.detail}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}

        {quests.length > 0 ? (
          <ul className="flex flex-col gap-1.5">
            {quests.map((quest) => (
              <li
                key={quest.name}
                className="rounded-lg border border-[#d5bd94] bg-[#fffaf0] px-2.5 py-1.5"
              >
                <p className="text-[11px] font-bold text-[#31101b]">{quest.name}</p>
                {quest.description ? (
                  <p className="text-[10px] font-medium text-[#725452]">{quest.description}</p>
                ) : null}
                {quest.stops.length > 0 ? (
                  <p className="text-[10px] font-semibold text-[#9c3b43]">
                    {quest.stops.join(" → ")}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
