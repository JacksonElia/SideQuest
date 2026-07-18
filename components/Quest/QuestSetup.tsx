"use client";

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, RefreshCw } from "lucide-react";
import { Spinner } from "@/components/ui/Spinner";
import type { LocationCoordinates, LocationPermissionStatus } from "@/types/message";
import { formatCoordinate, getOpenStreetMapEmbedUrl } from "@/lib/utils";

interface QuestSetupProps {
  location: LocationCoordinates | null;
  locationStatus: LocationPermissionStatus;
  locationError: string | null;
  locationLabel: string;
  selectedLocation: LocationCoordinates | null;
  isUsingCurrentLocation: boolean;
  onUseCurrentLocation: () => void;
  onBack: () => void;
  onCreateQuest: () => void;
}

export function QuestSetup({
  location,
  locationStatus,
  locationError,
  locationLabel,
  selectedLocation,
  isUsingCurrentLocation,
  onUseCurrentLocation,
  onBack,
  onCreateQuest,
}: QuestSetupProps) {
  const mapLocation = isUsingCurrentLocation ? location : selectedLocation;
  const canCreateQuest = Boolean(locationLabel.trim() && mapLocation);
  const hasLocationError =
    locationStatus === "denied" || locationStatus === "error" || locationStatus === "unsupported";

  // The starting point is always "wherever you are", so ask for it on arrival
  // instead of making the traveler tap a button that has only one answer.
  const hasRequestedRef = useRef(false);
  useEffect(() => {
    if (hasRequestedRef.current) {
      return;
    }
    hasRequestedRef.current = true;
    onUseCurrentLocation();
  }, [onUseCurrentLocation]);

  if (!mapLocation && !hasLocationError) {
    return (
      <main className="h-dvh overflow-hidden bg-[#f7f1e5] text-[#31101b]">
        <div className="mx-auto flex h-full w-full max-w-md flex-col items-center justify-center gap-5 px-8 text-center">
          <Spinner className="size-10 text-[#9c3b43]" label="Finding your location" />
          <h1 className="text-2xl font-semibold tracking-[-0.04em]">Finding your location...</h1>
          <p className="text-sm leading-6 text-[#725452]">
            Approve the browser permission prompt so we can drop your pin.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="h-dvh overflow-hidden bg-[#f7f1e5] text-[#31101b]">
      <div className="mx-auto flex h-full w-full max-w-md flex-col px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
        <header className="flex shrink-0 items-center justify-between">
          <button
            type="button"
            onClick={onBack}
            className="flex size-10 items-center justify-center rounded-lg text-[#7a4c4d] transition hover:bg-[#eadfca] active:scale-95"
            aria-label="Go back"
          >
            <ArrowLeft className="size-5" />
          </button>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#8c6a5f]">
            Choose a starting point
          </p>
          <span className="w-10" />
        </header>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex min-h-0 flex-1 flex-col pt-6"
        >
          <h1 className="shrink-0 text-3xl font-semibold leading-tight tracking-[-0.05em] text-[#31101b] sm:text-4xl">
            Where should we wander?
          </h1>
          <p className="mt-2 shrink-0 text-sm leading-6 text-[#725452]">
            We&apos;ll start from right where you are.
          </p>

          {/* The map takes the leftover height instead of a fixed one, so the
              screen fits without scrolling on any phone. */}
          {mapLocation && (
            <div className="relative mt-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border-2 border-[#c7ac84] bg-[#fffaf0] shadow-soft">
              <iframe
                title="Interactive starting point map"
                src={getOpenStreetMapEmbedUrl(mapLocation)}
                className="min-h-0 w-full flex-1 border-0"
                loading="eager"
              />
              <div className="absolute left-4 top-4 rounded-sm bg-[#fffaf0]/95 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#5c252b] shadow-sm">
                Drag or zoom the map
              </div>
              <div className="shrink-0 border-t border-[#dfceb1] bg-[#fffaf0] p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-[#31101b]">
                      {isUsingCurrentLocation ? "Your current location" : locationLabel}
                    </p>
                    <p className="mt-1 truncate text-[10px] text-[#725452]">
                      {formatCoordinate(mapLocation.latitude, "N", "S")} ·{" "}
                      {formatCoordinate(mapLocation.longitude, "E", "W")}
                    </p>
                  </div>
                  {isUsingCurrentLocation && <Check className="size-5 shrink-0 text-[#9c3b43]" />}
                </div>
              </div>
            </div>
          )}

          {hasLocationError && (
            <div className="mt-4 flex shrink-0 items-center justify-between gap-3 rounded-lg border border-[#d7a599] bg-[#f9e3db] px-3 py-2.5 text-xs text-[#7d2c2f]">
              <p className="leading-5">
                {locationError || "Location access is unavailable right now."}
              </p>
              <button
                type="button"
                onClick={onUseCurrentLocation}
                className="flex shrink-0 items-center gap-1.5 rounded-xl bg-white px-2.5 py-2 font-bold shadow-sm transition active:scale-95"
              >
                <RefreshCw className="size-3.5" />
                Retry
              </button>
            </div>
          )}

          <p className="mt-2 shrink-0 text-[10px] leading-4 text-[#8c6a5f]">
            Map data © OpenStreetMap contributors.
          </p>

          <button
            type="button"
            onClick={onCreateQuest}
            disabled={!canCreateQuest}
            className="mt-3 flex w-full shrink-0 items-center justify-center gap-2 rounded-lg border-2 border-[#31101b] bg-[#31101b] px-5 py-4 text-sm font-bold text-[#fff8e8] shadow-float transition hover:bg-[#6b1f32] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:cursor-not-allowed disabled:border-[#d7c5a7] disabled:bg-[#d7c5a7] disabled:text-[#8c6a5f] disabled:shadow-none"
          >
            Find some quests
            <ArrowRight className="size-4" />
          </button>
        </motion.div>
      </div>
    </main>
  );
}
