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
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
            Choose a starting point
          </p>
          <span className="w-10" />
        </header>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-1 flex-col pt-10"
        >
          <p className="text-sm font-bold text-emerald-600">Every Quest needs a beginning</p>
          <h1 className="mt-2 text-4xl font-semibold leading-tight tracking-[-0.05em] text-slate-950">
            Where should we wander?
          </h1>
          <p className="mt-4 text-sm leading-6 text-slate-500">
            Start wherever you are, or search for a different place for the day.
          </p>

          <div className="relative mt-7 overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-soft">
            {mapLocation ? (
              <>
                <iframe
                  key={`${mapLocation.latitude}-${mapLocation.longitude}`}
                  title="Interactive starting point map"
                  src={getOpenStreetMapEmbedUrl(mapLocation)}
                  className="h-56 w-full border-0"
                  loading="eager"
                />
                <div className="absolute left-4 top-4 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-600 shadow-sm backdrop-blur">
                  Drag or zoom the map
                </div>
                <div className="border-t border-slate-100 bg-white p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-slate-800">
                        {isUsingCurrentLocation ? "Your current location" : locationLabel}
                      </p>
                      <p className="mt-1 truncate text-[10px] text-slate-500">
                        {formatCoordinate(mapLocation.latitude, "N", "S")} ·{" "}
                        {formatCoordinate(mapLocation.longitude, "E", "W")}
                      </p>
                    </div>
                    {isUsingCurrentLocation && <Check className="size-5 shrink-0 text-emerald-600" />}
                  </div>
                </div>
              </>
            ) : (
              <div className="flex h-56 flex-col items-center justify-center px-8 text-center">
                <div className="flex size-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                  <MapPin className="size-6" />
                </div>
                <p className="mt-4 text-sm font-bold text-slate-800">Your map will appear here</p>
                <p className="mt-2 text-xs leading-5 text-slate-500">
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
            className="mt-4 flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-left shadow-sm transition hover:border-emerald-200 hover:bg-emerald-50/40 active:scale-[0.98]"
          >
            <span className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <LocateFixed className="size-4" />
              </span>
              <span>
                <span className="block text-xs font-bold text-slate-800">Use my current location</span>
                <span className="mt-1 block text-[10px] text-slate-500">
                  {isRequesting
                    ? "Waiting for browser permission..."
                    : isUsingCurrentLocation && location
                      ? "Your live location is selected"
                      : "Your browser will ask for permission"}
                </span>
              </span>
            </span>
            {isUsingCurrentLocation && location ? (
              <Check className="size-5 text-emerald-600" />
            ) : (
              <ArrowRight className="size-4 text-slate-400" />
            )}
          </button>

          {hasLocationError && (
            <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-rose-50 px-3 py-2.5 text-xs text-rose-700">
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
            <Search className="pointer-events-none absolute left-4 top-4 size-4 text-slate-400" />
            <input
              value={searchValue}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search a city, neighborhood, or landmark"
              className="w-full rounded-2xl border border-slate-200 bg-white px-11 py-4 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-4 focus-within:ring-blue-100/70"
              aria-label="Search for a starting location"
            />
            {searchStatus === "loading" && (
              <span className="absolute right-4 top-4 text-[10px] font-bold text-slate-400">Searching...</span>
            )}
          </div>

          {!isUsingCurrentLocation && results.length > 0 && (
            <div className="mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              {results.map((place) => (
                <button
                  key={place.id}
                  type="button"
                  onClick={() => {
                    onPlaceSelect(place.label, place.coordinates);
                    setSearchQuery("");
                  }}
                  className="flex w-full items-center gap-3 border-b border-slate-100 px-4 py-3 text-left last:border-0 transition hover:bg-slate-50 active:bg-blue-50"
                >
                  <span className="flex size-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                    <MapPin className="size-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-bold text-slate-800">{place.label}</span>
                    <span className="mt-1 block truncate text-[10px] text-slate-500">{place.detail}</span>
                  </span>
                </button>
              ))}
            </div>
          )}

          {searchStatus === "error" && (
            <p className="mt-2 text-xs leading-5 text-rose-600">
              Place search is unavailable right now. Please try again or use your current location.
            </p>
          )}

          <p className="mt-3 text-[10px] leading-4 text-slate-400">
            Map data © OpenStreetMap contributors. Place search uses Photon by Komoot.
          </p>

          <button
            type="button"
            onClick={onCreateQuest}
            disabled={!canCreateQuest}
            className="mt-auto flex w-full items-center justify-center gap-2 rounded-[22px] bg-slate-950 px-5 py-4 text-sm font-bold text-white shadow-float transition hover:bg-blue-600 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
          >
            Create my Quest
            <ArrowRight className="size-4" />
          </button>
        </motion.div>
      </div>
    </main>
  );
}
