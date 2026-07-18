export type MessageRole = "user" | "assistant";
export type MessageKind = "text" | "image";

interface BaseMessage {
  id: string;
  role: MessageRole;
  kind: MessageKind;
  createdAt: string;
}

export interface TextMessage extends BaseMessage {
  kind: "text";
  text: string;
}

export interface ImageMessage extends BaseMessage {
  kind: "image";
  imageUrl: string;
  alt: string;
}

export type Message = TextMessage | ImageMessage;

export interface LocationCoordinates {
  latitude: number;
  longitude: number;
  accuracy: number;
}

export type LocationPermissionStatus =
  "idle" | "requesting" | "granted" | "denied" | "error" | "unsupported";

/** A generated quest: a named walk built from retrieved places. */
export interface Quest {
  name: string;
  description: string;
  stops: string[];
}

/** What the traveler entered during typed quest planning. */
export interface TravelProfile {
  durationDays: number | null;
  interests: string[];
  activityLevel: "spry" | "moderate" | "restful" | null;
  budget: "free-spending" | "moderate" | "frugal" | null;
}
