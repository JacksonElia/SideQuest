"use client";

import { ChevronRight, Clock3, Route, ScrollText } from "lucide-react";

const stops = [
  {
    number: "01",
    title: "Start with a slow coffee",
    detail: "A cozy nearby spot to settle in",
    time: "15 min",
  },
  {
    number: "02",
    title: "Follow the local art walk",
    detail: "Small galleries and street-side finds",
    time: "35 min",
  },
  {
    number: "03",
    title: "End somewhere scenic",
    detail: "A quiet view for your final pause",
    time: "20 min",
  },
];

interface TravelPlanCardProps {
  questName: string;
  locationLabel: string;
}

export function TravelPlanCard({ questName, locationLabel }: TravelPlanCardProps) {
  return (
    <section className="relative mt-4 overflow-visible rounded-xl border-2 border-[#c7ac84] bg-[#eadfca] p-5 shadow-soft">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border-2 border-[#31101b] bg-[#8a293c] text-[#f5d58a] shadow-sm">
            <Route className="size-5" />
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#9c3b43]">
              Your travel plan
            </p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-[#31101b]">
              {questName}
            </h2>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-[#d5bd94] bg-[#fffaf0] px-3.5 py-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-[#5c252b]">
          <ScrollText className="size-3.5 text-[#c67c2e]" />
          <span>Built around your mood and what is nearby</span>
        </div>
        <p className="mt-2 text-sm leading-6 text-[#725452]">
          Take an easy 70-minute wander with one good coffee, a little culture, and a calm place to
          finish.
        </p>
      </div>

      <div className="mt-4 space-y-3">
        {stops.map((stop) => (
          <div key={stop.number} className="flex items-center gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-[#d5bd94] bg-[#fffaf0] text-[10px] font-bold text-[#9c3b43]">
              {stop.number}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold text-[#31101b]">{stop.title}</p>
              <p className="truncate text-[11px] text-[#725452]">{stop.detail}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1 text-[10px] font-semibold text-[#8c6a5f]">
              <Clock3 className="size-3" />
              {stop.time}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-[#d5bd94] pt-3 text-[11px] font-semibold text-[#9c3b43]">
        <span>{locationLabel || "Your current area"} · We’ll adjust this as you talk</span>
        <ChevronRight className="size-4" />
      </div>
    </section>
  );
}
