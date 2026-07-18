"use client";

import { motion } from "framer-motion";
import { LocateFixed, MapPin, Navigation, RefreshCw } from "lucide-react";
import { cn, formatCoordinate } from "@/lib/utils";
import type {
  LocationCoordinates,
  LocationPermissionStatus,
} from "@/types/message";

interface MapCardProps {
  location: LocationCoordinates | null;
  status: LocationPermissionStatus;
  error: string | null;
  onRetry: () => void;
}

const statusCopy: Record<LocationPermissionStatus, string> = {
  idle: "Location is waiting",
  requesting: "Finding your position",
  granted: "Location is live",
  denied: "Location is off",
  error: "Location unavailable",
  unsupported: "Location unsupported",
};

export function MapCard({ location, status, error, onRetry }: MapCardProps) {
  const isLoading = status === "requesting";
  const hasProblem = status === "denied" || status === "error" || status === "unsupported";

  return (
    <section className="relative overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-soft">
      {/* TODO: Swap this decorative map surface for the future maps provider. */}
      <div className="relative h-44 overflow-hidden bg-[#dbe8dc]">
        <div className="map-grid absolute inset-[-20%] rotate-3 animate-map-drift bg-[#cfe1d2]" />
        <div className="absolute inset-x-[-10%] top-1/2 h-14 -translate-y-1/2 rotate-[-15deg] rounded-[50%] border-[10px] border-white/70 bg-transparent shadow-[0_0_0_5px_rgba(181,207,186,0.45)]" />
        <div className="absolute -left-6 top-10 h-24 w-56 rotate-[22deg] rounded-[50%] border-[7px] border-[#b5cfba]/70" />
        <div className="absolute -right-12 bottom-3 h-20 w-48 rotate-[-27deg] rounded-[50%] border-[6px] border-[#b5cfba]/60" />
        <div className="absolute left-5 top-5 rounded-full bg-white/85 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 shadow-sm backdrop-blur">
          Live area
        </div>
        <motion.div
          animate={isLoading ? { scale: [1, 1.2, 1], opacity: [0.65, 1, 0.65] } : undefined}
          transition={{ duration: 1.4, repeat: isLoading ? Infinity : 0 }}
          className="absolute left-1/2 top-1/2 flex size-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-blue-500/15"
        >
          <div className="flex size-9 items-center justify-center rounded-full border-4 border-white bg-blue-600 text-white shadow-lg shadow-blue-900/20">
            <MapPin className="size-4 fill-current" />
          </div>
        </motion.div>
        <div className="absolute bottom-4 right-4 flex size-9 items-center justify-center rounded-xl border border-white/70 bg-white/85 text-slate-600 shadow-sm backdrop-blur">
          <Navigation className="size-4 fill-current" />
        </div>
      </div>

      <div className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "size-2 rounded-full",
                  status === "granted" ? "bg-emerald-500" : hasProblem ? "bg-rose-400" : "bg-amber-400",
                )}
              />
              <p className="text-xs font-semibold text-slate-600">{statusCopy[status]}</p>
            </div>
            <p className="mt-2 text-sm font-medium text-slate-900">
              {location
                ? `${formatCoordinate(location.latitude, "N", "S")} · ${formatCoordinate(location.longitude, "E", "W")}`
                : "Waiting for a location signal"}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {location
                ? `Accuracy within ${Math.round(location.accuracy)} meters`
                : "Your guide uses this to find nearby ideas"}
            </p>
          </div>
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-slate-500">
            <LocateFixed className="size-4" />
          </div>
        </div>

        {hasProblem && (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-rose-50 px-3 py-2.5 text-xs text-rose-700">
            <p className="leading-5">{error || "Please check your browser permission settings."}</p>
            <button
              type="button"
              onClick={onRetry}
              className="flex shrink-0 items-center gap-1.5 rounded-xl bg-white px-2.5 py-2 font-bold text-rose-700 shadow-sm transition active:scale-95"
            >
              <RefreshCw className="size-3.5" />
              Retry
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
