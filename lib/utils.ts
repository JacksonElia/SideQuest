import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { LocationCoordinates } from "@/types/message";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function createId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function formatCoordinate(value: number, positive: string, negative: string) {
  const direction = value >= 0 ? positive : negative;
  return `${Math.abs(value).toFixed(4)}° ${direction}`;
}

export function getOpenStreetMapEmbedUrl(coordinates: LocationCoordinates) {
  const longitudePadding = 0.014;
  const latitudePadding = 0.009;
  const west = coordinates.longitude - longitudePadding;
  const east = coordinates.longitude + longitudePadding;
  const south = coordinates.latitude - latitudePadding;
  const north = coordinates.latitude + latitudePadding;
  const params = new URLSearchParams({
    bbox: `${west},${south},${east},${north}`,
    layer: "mapnik",
    marker: `${coordinates.latitude},${coordinates.longitude}`,
  });

  return `https://www.openstreetmap.org/export/embed.html?${params.toString()}`;
}
