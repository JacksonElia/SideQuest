"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  LocateFixed,
  MapPin,
  RefreshCw,
  Search,
} from "lucide-react";
import type {
  LocationCoordinates,
  LocationPermissionStatus,
} from "@/types/message";
import { formatCoordinate, getOpenStreetMapEmbedUrl } from "@/lib/utils";

interface PlaceResult {
  id: string;
  label: string;
  detail: string;
  coordinates: LocationCoordinates;
}

interface PhotonFeature {
  properties?: {
    name?: string;
    city?: string;
    state?: string;
    country?: string;
    osm_id?: number;
  };
  geometry?: {
    coordinates?: [number, number];
  };
}

interface PhotonResponse {
  features?: PhotonFeature[];
}

interface QuestSetupProps {
  location: LocationCoordinates | null;
  locationStatus: LocationPermissionStatus;
  locationError: string | null;
  locationLabel: string;
  selectedLocation: LocationCoordinates | null;
  isUsingCurrentLocation: boolean;
  onPlaceSelect: (label: string, coordinates: LocationCoordinates) => void;
  onUseCurrentLocation: () => void;
  onBack: () => void;
  onCreateQuest: () => void;
}

function formatPlace(feature: PhotonFeature): PlaceResult | null {
  const coordinates = feature.geometry?.coordinates;
  if (!coordinates) {
    return null;
  }

  const [longitude, latitude] = coordinates;
  const name = feature.properties?.name;
  if (!name || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  const detail = [
    feature.properties?.city,
    feature.properties?.state,
    feature.properties?.country,
  ]
    .filter(Boolean)
    .join(", ");

  return {
    id: `${feature.properties?.osm_id ?? name}-${latitude}-${longitude}`,
    label: name,
    detail: detail || "Selected place",
    coordinates: { latitude, longitude, accuracy: 0 },
  };
}

export function QuestSetup({
  location,
  locationStatus,
  locationError,
  locationLabel,
  selectedLocation,
  isUsingCurrentLocation,
  onPlaceSelect,
  onUseCurrentLocation,
  onBack,
  onCreateQuest,
}: QuestSetupProps) {
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [searchStatus, setSearchStatus] = useState<"idle" | "loading" | "error">("idle");
  const [searchQuery, setSearchQuery] = useState("");
  const abortControllerRef = useRef<AbortController | null>(null);
  const mapLocation = isUsingCurrentLocation ? location : selectedLocation;
  const searchValue = searchQuery;
  const canCreateQuest = Boolean(locationLabel.trim() && mapLocation);
  const isRequesting = locationStatus === "requesting";
  const hasLocationError =
    locationStatus === "denied" || locationStatus === "error" || locationStatus === "unsupported";

  useEffect(() => {
    const query = searchValue.trim();
    abortControllerRef.current?.abort();

    if (query.length < 2) {
      setResults([]);
      setSearchStatus("idle");
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;
    const timeoutId = window.setTimeout(async () => {
      setSearchStatus("loading");
      try {
        const response = await fetch(
          `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5&lang=en`,
          { signal: controller.signal },
        );
        if (!response.ok) {
          throw new Error(`Place search failed with ${response.status}`);
        }

        const data = (await response.json()) as PhotonResponse;
        setResults((data.features ?? []).map(formatPlace).filter((place): place is PlaceResult => place !== null));
        setSearchStatus("idle");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setResults([]);
        setSearchStatus("error");
      }
    }, 350);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [searchValue]);

  return (
    <main className="min-h-screen bg-[#f7f1e5] text-[#31101b]">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-5 py-6">
        <header className="flex items-center justify-between">
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
          className="flex flex-1 flex-col pt-10"
        >
          <p className="text-sm font-bold uppercase tracking-[0.12em] text-[#9c3b43]">Every Quest needs a beginning</p>
          <h1 className="mt-2 text-4xl font-semibold leading-tight tracking-[-0.05em] text-[#31101b]">
            Where should we wander?
          </h1>
          <p className="mt-4 text-sm leading-6 text-[#725452]">
            Start wherever you are, or search for a different place for the day.
          </p>

          <div className="relative mt-7 overflow-hidden rounded-xl border-2 border-[#c7ac84] bg-[#fffaf0] shadow-soft">
            {mapLocation ? (
              <>
                <iframe
                  key={`${mapLocation.latitude}-${mapLocation.longitude}`}
                  title="Interactive starting point map"
                  src={getOpenStreetMapEmbedUrl(mapLocation)}
                  className="h-56 w-full border-0"
                  loading="eager"
                />
                <div className="absolute left-4 top-4 rounded-sm bg-[#fffaf0]/95 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#5c252b] shadow-sm">
                  Drag or zoom the map
                </div>
                <div className="border-t border-[#dfceb1] bg-[#fffaf0] p-3">
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
              </>
            ) : (
              <div className="flex h-56 flex-col items-center justify-center px-8 text-center">
                <div className="flex size-12 items-center justify-center rounded-lg bg-[#f3dfb8] text-[#9c3b43]">
                  <MapPin className="size-6" />
                </div>
                <p className="mt-4 text-sm font-bold text-[#31101b]">Your map will appear here</p>
                <p className="mt-2 text-xs leading-5 text-[#725452]">
                  Use your device location or choose one of the search results to open an interactive map.
                </p>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              setSearchQuery("");
              onUseCurrentLocation();
            }}
            className="mt-4 flex w-full items-center justify-between rounded-lg border-2 border-[#c7ac84] bg-[#fffaf0] px-4 py-3.5 text-left shadow-soft transition hover:border-[#9c3b43] hover:bg-[#f6ead3] active:translate-x-0.5 active:translate-y-0.5"
          >
            <span className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-lg bg-[#f3dfb8] text-[#9c3b43]">
                <LocateFixed className="size-4" />
              </span>
              <span>
                <span className="block text-xs font-bold text-[#31101b]">Use my current location</span>
                <span className="mt-1 block text-[10px] text-[#725452]">
                  {isRequesting
                    ? "Waiting for browser permission..."
                    : isUsingCurrentLocation && location
                      ? "Your live location is selected"
                      : "Your browser will ask for permission"}
                </span>
              </span>
            </span>
            {isUsingCurrentLocation && location ? (
              <Check className="size-5 text-[#9c3b43]" />
            ) : (
              <ArrowRight className="size-4 text-[#8c6a5f]" />
            )}
          </button>

          {hasLocationError && (
            <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-[#d7a599] bg-[#f9e3db] px-3 py-2.5 text-xs text-[#7d2c2f]">
              <p className="leading-5">
                {locationError || "Location access is unavailable. Search for a place instead."}
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  onUseCurrentLocation();
                }}
                className="flex shrink-0 items-center gap-1.5 rounded-xl bg-white px-2.5 py-2 font-bold shadow-sm transition active:scale-95"
              >
                <RefreshCw className="size-3.5" />
                Retry
              </button>
            </div>
          )}

          <div className="relative mt-4">
            <Search className="pointer-events-none absolute left-4 top-4 size-4 text-[#8c6a5f]" />
            <input
              value={searchValue}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search a city, neighborhood, or landmark"
              className="w-full rounded-lg border-2 border-[#c7ac84] bg-[#fffaf0] px-11 py-4 text-sm text-[#31101b] outline-none transition placeholder:text-[#9a7b6b] focus:border-[#9c3b43] focus:ring-4 focus-within:ring-[#e8c98b]/50"
              aria-label="Search for a starting location"
            />
            {searchStatus === "loading" && (
              <span className="absolute right-4 top-4 text-[10px] font-bold text-[#8c6a5f]">Searching...</span>
            )}
          </div>

          {!isUsingCurrentLocation && results.length > 0 && (
            <div className="mt-2 overflow-hidden rounded-lg border-2 border-[#c7ac84] bg-[#fffaf0] shadow-soft">
              {results.map((place) => (
                <button
                  key={place.id}
                  type="button"
                  onClick={() => {
                    onPlaceSelect(place.label, place.coordinates);
                    setSearchQuery("");
                  }}
                  className="flex w-full items-center gap-3 border-b border-[#eadcc5] px-4 py-3 text-left last:border-0 transition hover:bg-[#f6ead3] active:bg-[#ead5aa]"
                >
                  <span className="flex size-8 items-center justify-center rounded-lg bg-[#f3dfb8] text-[#9c3b43]">
                    <MapPin className="size-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-bold text-[#31101b]">{place.label}</span>
                    <span className="mt-1 block truncate text-[10px] text-[#725452]">{place.detail}</span>
                  </span>
                </button>
              ))}
            </div>
          )}

          {searchStatus === "error" && (
            <p className="mt-2 text-xs leading-5 text-[#9c3b43]">
              Place search is unavailable right now. Please try again or use your current location.
            </p>
          )}

          <p className="mt-3 text-[10px] leading-4 text-[#8c6a5f]">
            Map data © OpenStreetMap contributors. Place search uses Photon by Komoot.
          </p>

          <button
            type="button"
            onClick={onCreateQuest}
            disabled={!canCreateQuest}
            className="mt-auto flex w-full items-center justify-center gap-2 rounded-lg border-2 border-[#31101b] bg-[#31101b] px-5 py-4 text-sm font-bold text-[#fff8e8] shadow-float transition hover:bg-[#6b1f32] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:cursor-not-allowed disabled:border-[#d7c5a7] disabled:bg-[#d7c5a7] disabled:text-[#8c6a5f] disabled:shadow-none"
          >
            Create my Quest
            <ArrowRight className="size-4" />
          </button>
        </motion.div>
      </div>
    </main>
  );
}
