"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  LocationCoordinates,
  LocationPermissionStatus,
} from "@/types/message";

interface UseLocationResult {
  location: LocationCoordinates | null;
  status: LocationPermissionStatus;
  error: string | null;
  requestLocation: () => void;
}

const locationOptions: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 10_000,
  timeout: 15_000,
};

export function useLocation(autoRequest = true): UseLocationResult {
  const [location, setLocation] = useState<LocationCoordinates | null>(null);
  const [status, setStatus] = useState<LocationPermissionStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const watchIdRef = useRef<number | null>(null);

  const stopWatching = useCallback(() => {
    if (watchIdRef.current !== null && "geolocation" in navigator) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  const requestLocation = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setStatus("unsupported");
      setError("Location services are not available in this browser.");
      return;
    }

    stopWatching();
    setStatus("requesting");
    setError(null);

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
        setStatus("granted");
        setError(null);
      },
      (positionError) => {
        const isDenied = positionError.code === positionError.PERMISSION_DENIED;
        setStatus(isDenied ? "denied" : "error");
        setError(
          isDenied
            ? "Location access is off. Enable it in your browser settings to see your position."
            : "We could not determine your location right now. Please try again.",
        );
      },
      locationOptions,
    );
  }, [stopWatching]);

  useEffect(() => {
    if (!autoRequest) {
      stopWatching();
      return;
    }

    requestLocation();
    return stopWatching;
  }, [autoRequest, requestLocation, stopWatching]);

  return { location, status, error, requestLocation };
}
