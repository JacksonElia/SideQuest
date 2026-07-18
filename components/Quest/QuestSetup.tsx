"use client";

import { motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clock3,
  Compass,
  LocateFixed,
  Map,
  Sparkles,
} from "lucide-react";
import type {
  LocationCoordinates,
  LocationPermissionStatus,
} from "@/types/message";
import { formatCoordinate } from "@/lib/utils";

interface QuestSetupProps {
  step: number;
  location: LocationCoordinates | null;
  locationStatus: LocationPermissionStatus;
  locationError: string | null;
  locationLabel: string;
  onLocationLabelChange: (value: string) => void;
  onUseCurrentLocation: () => void;
  onNext: () => void;
  onBack: () => void;
  onCreateQuest: () => void;
}

const questionCards = [
  { icon: Sparkles, title: "What sounds good?", text: "A hidden gem, a slow morning, or something unexpected." },
  { icon: Clock3, title: "How much time do you have?", text: "Your guide will shape the pace around your day." },
  { icon: Compass, title: "What should it feel like?", text: "Relaxed, curious, scenic, social, or a little silly." },
];

export function QuestSetup({
  step,
  location,
  locationStatus,
  locationError,
  locationLabel,
  onLocationLabelChange,
  onUseCurrentLocation,
  onNext,
  onBack,
  onCreateQuest,
}: QuestSetupProps) {
  const isLocationStep = step === 1;

  return (
    <main className="min-h-screen bg-[#f8fafc] text-slate-950">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-5 py-6">
        <header className="flex items-center justify-between">
          <button
            type="button"
            onClick={onBack}
            className="flex size-10 items-center justify-center rounded-xl text-slate-500 transition hover:bg-white active:scale-95"
            aria-label="Go back"
          >
            <ArrowLeft className="size-5" />
          </button>
          <div className="flex gap-1.5" aria-label={`Step ${step + 1} of 2`}>
            {[0, 1].map((stepNumber) => (
              <span
                key={stepNumber}
                className={`h-1.5 rounded-full transition-all ${
                  stepNumber === step ? "w-8 bg-blue-600" : "w-2 bg-slate-200"
                }`}
              />
            ))}
          </div>
          <span className="w-10 text-right text-[10px] font-bold uppercase tracking-wider text-slate-400">
            {step + 1}/2
          </span>
        </header>

        <motion.div
          key={step}
          initial={{ opacity: 0, x: isLocationStep ? 18 : -18 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex flex-1 flex-col pt-12"
        >
          {!isLocationStep ? (
            <>
              <div className="flex size-14 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/20">
                <Sparkles className="size-6" />
              </div>
              <p className="mt-8 text-sm font-bold text-blue-600">Let’s make it yours</p>
              <h1 className="mt-2 text-4xl font-semibold leading-tight tracking-[-0.05em] text-slate-950">
                A few little questions, then we’re off.
              </h1>
              <p className="mt-4 max-w-sm text-sm leading-6 text-slate-500">
                Your conversational guide will ask about these things next. For now, we’ll use a
                thoughtful starter profile to get the Quest moving.
              </p>
              <div className="mt-8 space-y-3">
                {questionCards.map((card) => {
                  const Icon = card.icon;
                  return (
                    <div
                      key={card.title}
                      className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                    >
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                        <Icon className="size-4" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-800">{card.title}</p>
                        <p className="mt-1 text-xs leading-5 text-slate-500">{card.text}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={onNext}
                className="mt-auto flex w-full items-center justify-center gap-2 rounded-[22px] bg-slate-950 px-5 py-4 text-sm font-bold text-white shadow-float transition hover:bg-blue-600 active:scale-[0.98]"
              >
                Choose a starting point
                <ArrowRight className="size-4" />
              </button>
            </>
          ) : (
            <>
              <div className="flex size-14 items-center justify-center rounded-2xl bg-emerald-500 text-white shadow-lg shadow-emerald-500/20">
                <Map className="size-6" />
              </div>
              <p className="mt-8 text-sm font-bold text-emerald-600">Every Quest needs a beginning</p>
              <h1 className="mt-2 text-4xl font-semibold leading-tight tracking-[-0.05em] text-slate-950">
                Where should we wander?
              </h1>
              <p className="mt-4 text-sm leading-6 text-slate-500">
                Start wherever you are, or choose a different place for the day.
              </p>

              <div className="relative mt-7 overflow-hidden rounded-[26px] border border-emerald-100 bg-[#dbe8dc] p-4 shadow-soft">
                {/* TODO: Replace this visual picker with a Google Maps or equivalent place selector. */}
                <div className="map-grid absolute inset-[-20%] rotate-3 bg-[#cfe1d2]" />
                <div className="relative flex h-28 items-center justify-center">
                  <div className="absolute h-12 w-56 rotate-[-18deg] rounded-[50%] border-8 border-white/70" />
                  <div className="flex size-12 items-center justify-center rounded-full border-4 border-white bg-emerald-600 text-white shadow-lg">
                    <LocateFixed className="size-5" />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onUseCurrentLocation}
                  className="relative flex w-full items-center justify-between rounded-2xl bg-white/90 px-4 py-3 text-left shadow-sm backdrop-blur transition active:scale-[0.98]"
                >
                  <span>
                    <span className="block text-xs font-bold text-slate-800">Use my current location</span>
                    <span className="mt-1 block text-[10px] text-slate-500">
                      {location
                        ? `${formatCoordinate(location.latitude, "N", "S")} · ${formatCoordinate(location.longitude, "E", "W")}`
                        : locationStatus === "requesting"
                          ? "Finding your position..."
                          : "Allow location access when prompted"}
                    </span>
                  </span>
                  {locationLabel === "Current location" && (
                    <Check className="size-5 text-emerald-600" />
                  )}
                </button>
              </div>

              <div className="relative mt-4">
                <LocateFixed className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={locationLabel === "Current location" ? "" : locationLabel}
                  onChange={(event) => onLocationLabelChange(event.target.value)}
                  placeholder="Or type a city, neighborhood, or landmark"
                  className="w-full rounded-2xl border border-slate-200 bg-white px-11 py-4 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-4 focus:ring-blue-100/70"
                  aria-label="Choose a different starting location"
                />
              </div>
              {locationError && <p className="mt-2 text-xs leading-5 text-rose-600">{locationError}</p>}
              <p className="mt-3 flex items-center gap-1.5 text-[10px] leading-4 text-slate-400">
                <span className="size-1.5 rounded-full bg-amber-400" />
                Map search will connect here when live places are enabled.
              </p>
              <button
                type="button"
                onClick={onCreateQuest}
                className="mt-auto flex w-full items-center justify-center gap-2 rounded-[22px] bg-slate-950 px-5 py-4 text-sm font-bold text-white shadow-float transition hover:bg-blue-600 active:scale-[0.98]"
              >
                Create my Quest
                <ArrowRight className="size-4" />
              </button>
            </>
          )}
        </motion.div>
      </div>
    </main>
  );
}
