export type MessageRole = "user" | "assistant";
export type MessageKind = "text" | "image" | "voice";

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

export interface VoiceMessage extends BaseMessage {
  kind: "voice";
  blob?: Blob;
  durationSeconds: number;
}

export type Message = TextMessage | ImageMessage | VoiceMessage;

export interface LocationCoordinates {
  latitude: number;
  longitude: number;
  accuracy: number;
}

export type LocationPermissionStatus =
  | "idle"
  | "requesting"
  | "granted"
  | "denied"
  | "error"
  | "unsupported";

/** A generated quest: a named walk built from retrieved places. */
export interface Quest {
  name: string;
  description: string;
  stops: string[];
}

/** What the guide learned in planning mode, pushed from the agent over a text stream. */
export interface TravelProfile {
  durationDays: number | null;
  interests: string[];
  activityLevel: "spry" | "moderate" | "restful" | null;
  budget: "free-spending" | "moderate" | "frugal" | null;
}

