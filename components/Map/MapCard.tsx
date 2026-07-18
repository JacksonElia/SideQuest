"use client";

import { motion } from "framer-motion";
import { LocateFixed, MapPin, RefreshCw } from "lucide-react";
import { cn, formatCoordinate, getOpenStreetMapEmbedUrl } from "@/lib/utils";
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
    <section className="relative overflow-hidden rounded-xl border-2 border-[#c7ac84] bg-[#fffaf0] shadow-soft">
      <div className="relative h-44 overflow-hidden bg-[#eadfca]">
        {location ? (
          <>
            <iframe
              key={`${location.latitude}-${location.longitude}`}
              title="Interactive live location map"
              src={getOpenStreetMapEmbedUrl(location)}
              className="h-full w-full border-0"
              loading="lazy"
            />
            <div className="pointer-events-none absolute left-4 top-4 rounded-sm bg-[#fffaf0]/95 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#5c252b] shadow-sm">
              Live location · Drag or zoom
            </div>
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center px-8 text-center">
            <motion.div
              animate={isLoading ? { scale: [1, 1.2, 1], opacity: [0.65, 1, 0.65] } : undefined}
              transition={{ duration: 1.4, repeat: isLoading ? Infinity : 0 }}
              className="flex size-14 items-center justify-center rounded-full bg-[#9c3b43]/15"
            >
              <div className="flex size-9 items-center justify-center rounded-full border-4 border-[#fffaf0] bg-[#9c3b43] text-[#f5d58a] shadow-lg shadow-[#5c252b]/20">
                <MapPin className="size-4 fill-current" />
              </div>
            </motion.div>
            <p className="mt-3 text-xs font-bold text-[#5c252b]">
              {isLoading ? "Finding your live location..." : "Live map is waiting for location access"}
            </p>
          </div>
        )}
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
              <p className="text-xs font-semibold text-[#5c252b]">{statusCopy[status]}</p>
            </div>
            <p className="mt-2 text-sm font-medium text-[#31101b]">
              {location
                ? `${formatCoordinate(location.latitude, "N", "S")} · ${formatCoordinate(location.longitude, "E", "W")}`
                : "Waiting for a location signal"}
            </p>
            <p className="mt-1 text-xs text-[#8c6a5f]">
              {location
                ? `Accuracy within ${Math.round(location.accuracy)} meters`
                : "Your guide uses this to find nearby ideas"}
            </p>
          </div>
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#f3dfb8] text-[#9c3b43]">
            <LocateFixed className="size-4" />
          </div>
        </div>

        {hasProblem && (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-[#d7a599] bg-[#f9e3db] px-3 py-2.5 text-xs text-[#7d2c2f]">
            <p className="leading-5">{error || "Please check your browser permission settings."}</p>
            <button
              type="button"
              onClick={onRetry}
              className="flex shrink-0 items-center gap-1.5 rounded-lg bg-[#fffaf0] px-2.5 py-2 font-bold text-[#7d2c2f] shadow-sm transition active:scale-95"
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
