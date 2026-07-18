"use client";

import { ChevronRight, Clock3, Route, Sparkles } from "lucide-react";

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

export function TravelPlanCard() {
  return (
    <section className="relative mt-4 overflow-visible rounded-[28px] border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-5 shadow-soft">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/20">
            <Route className="size-5" />
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-blue-500">
              Your travel plan
            </p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">
              A gentle local loop
            </h2>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-white/80 bg-white/75 px-3.5 py-3 backdrop-blur">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
          <Sparkles className="size-3.5 text-blue-600" />
          <span>Built around your mood and what is nearby</span>
        </div>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Take an easy 70-minute wander with one good coffee, a little culture, and a calm place to
          finish.
        </p>
      </div>

      <div className="mt-4 space-y-3">
        {stops.map((stop) => (
          <div key={stop.number} className="flex items-center gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-white text-[10px] font-bold text-blue-600 shadow-sm">
              {stop.number}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold text-slate-800">{stop.title}</p>
              <p className="truncate text-[11px] text-slate-500">{stop.detail}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1 text-[10px] font-semibold text-slate-400">
              <Clock3 className="size-3" />
              {stop.time}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-blue-100/80 pt-3 text-[11px] font-semibold text-blue-600">
        <span>We’ll adjust this as you talk</span>
        <ChevronRight className="size-4" />
      </div>
    </section>
  );
}
