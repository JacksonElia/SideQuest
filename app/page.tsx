"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Home, MapPin, ScrollText } from "lucide-react";
import { ChatWindow } from "@/components/Chat/ChatWindow";
import { MapCard } from "@/components/Map/MapCard";
import { QuestScoping } from "@/components/Quest/QuestScoping";
import { QuestSetup } from "@/components/Quest/QuestSetup";
import { QuestWelcome } from "@/components/Quest/QuestWelcome";
import { VoiceButton } from "@/components/Voice/VoiceButton";
import { VoiceDebugPanel } from "@/components/Voice/VoiceDebugPanel";
import { useLocation } from "@/hooks/useLocation";
import { useVoiceSession } from "@/hooks/useVoiceSession";
import type { LocationCoordinates, Message, Quest } from "@/types/message";

type QuestScreen = "welcome" | "setup" | "scoping" | "main";

interface SavedJourney {
  questName: string;
  locationLabel: string;
  messages: Message[];
  quests?: Quest[];
}

const JOURNEY_STORAGE_KEY = "sidequest-journey";

/** Narrow the saved quest suggestions restored from localStorage. */
function toQuests(value: unknown): Quest[] {
  if (!Array.isArray(value)) return [];

  const quests: Quest[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;

    const { name, description, stops } = entry as {
      name?: unknown;
      description?: unknown;
      stops?: unknown;
    };
    if (typeof name !== "string" || !name.trim()) continue;

    quests.push({
      name: name.trim(),
      description: typeof description === "string" ? description : "",
      stops: Array.isArray(stops)
        ? stops.filter((s): s is string => typeof s === "string" && !!s.trim())
        : [],
    });
  }

  return quests.slice(0, 3);
}
const QUEST_NAMES = ["The Serendipity Stroll", "The Tiny Grand Tour", "The Sidewalk Symphony"];

export default function HomePage() {
  // Last-minute demo cut: no welcome/setup/scoping — boot straight into the
  // homepage with the live conversational guide. The other screens remain in
  // code but are unreachable.
  const [screen, setScreen] = useState<QuestScreen>("main");
  const [questName, setQuestName] = useState("The Little Detour");
  const [locationLabel, setLocationLabel] = useState("");
  const [selectedLocation, setSelectedLocation] = useState<LocationCoordinates | null>(null);
  const [isUsingCurrentLocation, setIsUsingCurrentLocation] = useState(false);
  /** Transcript restored from a previous visit, shown above the live one. */
  const [restoredMessages, setRestoredMessages] = useState<Message[]>([]);
  /** Quest names restored from a previous visit; nothing generates new ones. */
  const [quests, setQuests] = useState<Quest[]>([]);

  const {
    location,
    status: locationStatus,
    error: locationError,
    requestLocation,
  } = useLocation(screen === "main" || screen === "setup" || screen === "scoping");

  // One session spans scoping and main. The guide moves from planning to active
  // mode by itself, so reconnecting between screens would restart the
  // conversation and discard everything it had learned.
  const voice = useVoiceSession(location);
  const { connect: connectVoice, disconnect: disconnectVoice, toggleMute } = voice;

  const messages = useMemo(
    () => [...restoredMessages, ...voice.messages],
    [restoredMessages, voice.messages],
  );

  // The guide's turn is in progress while it speaks, and from the moment the
  // traveler finishes until its reply lands. A guide transcript only arrives
  // once the spoken segment completes, so the gap would otherwise look idle.
  const isTyping = voice.isAgentSpeaking || messages.at(-1)?.role === "user";

  const persistJourney = useCallback(
    (nextMessages: Message[], nextQuestName = questName, nextLocationLabel = locationLabel) => {
      if (typeof window === "undefined") {
        return;
      }

      const savedJourney: SavedJourney = {
        questName: nextQuestName,
        locationLabel: nextLocationLabel,
        messages: nextMessages,
        quests,
      };

      window.localStorage.setItem(JOURNEY_STORAGE_KEY, JSON.stringify(savedJourney));
    },
    [locationLabel, questName, quests],
  );

  useEffect(() => {
    if (screen === "welcome" || messages.length === 0) {
      return;
    }
    persistJourney(messages);
  }, [messages, persistJourney, screen]);

  useEffect(() => {
    if (isUsingCurrentLocation && location) {
      setSelectedLocation(location);
      setLocationLabel("Current location");
    }
  }, [isUsingCurrentLocation, location]);

  // TODO: hand the scoping transcript to the quest-generation model instead of naming locally.
  const advanceToMain = useCallback(() => {
    const nextQuestName = QUEST_NAMES[Math.floor(Math.random() * QUEST_NAMES.length)]!;
    setQuestName(nextQuestName);
    persistJourney(messages, nextQuestName);
    setScreen("main");
  }, [messages, persistJourney]);

  const handleStartNewQuest = () => {
    setRestoredMessages([]);
    setQuestName("The Little Detour");
    setLocationLabel("");
    setSelectedLocation(null);
    setIsUsingCurrentLocation(false);
    setQuests([]);
    setScreen("setup");
  };

  const handleContinueJourney = () => {
    const savedJourney = window.localStorage.getItem(JOURNEY_STORAGE_KEY);
    if (savedJourney) {
      try {
        const parsedJourney = JSON.parse(savedJourney) as Partial<SavedJourney>;
        if (typeof parsedJourney.questName === "string") {
          setQuestName(parsedJourney.questName);
        }
        if (typeof parsedJourney.locationLabel === "string") {
          setLocationLabel(parsedJourney.locationLabel);
        }
        if (Array.isArray(parsedJourney.messages)) {
          setRestoredMessages(parsedJourney.messages);
        }
        if (Array.isArray(parsedJourney.quests)) {
          setQuests(toQuests(parsedJourney.quests));
        }
      } catch {
        setRestoredMessages([]);
      }
    }
    setScreen("main");
  };

  const handleSetupBack = () => {
    setScreen("welcome");
  };

  const handleUseCurrentLocation = useCallback(() => {
    setIsUsingCurrentLocation(true);
    requestLocation();
  }, [requestLocation]);

  const handleCreateQuest = () => {
    const label = locationLabel.trim() || "Current location";
    setLocationLabel(label);
    // Best-effort: warm the ingestion pipeline while the traveler is scoping.
    const fix = selectedLocation ?? location;
    if (fix) {
      void fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locationLabel: label, lat: fix.latitude, lng: fix.longitude }),
      }).catch(() => {});
    }
    setScreen("scoping");
  };

  const handleScopingBack = () => {
    void disconnectVoice();
    setScreen("setup");
  };

  // The welcome flow is cut, so "return to start" just ends the conversation
  // and stays on the homepage.
  const handleReturnToStart = () => {
    void disconnectVoice();
  };

  if (screen === "welcome") {
    return (
      <QuestWelcome
        onStartNewQuest={handleStartNewQuest}
        onContinueJourney={handleContinueJourney}
      />
    );
  }

  if (screen === "setup") {
    return (
      <QuestSetup
        location={location}
        locationStatus={locationStatus}
        locationError={locationError}
        locationLabel={locationLabel}
        selectedLocation={selectedLocation}
        isUsingCurrentLocation={isUsingCurrentLocation}
        onUseCurrentLocation={handleUseCurrentLocation}
        onBack={handleSetupBack}
        onCreateQuest={handleCreateQuest}
      />
    );
  }

  if (screen === "scoping") {
    return (
      <QuestScoping
        locationLabel={locationLabel}
        messages={messages}
        isTyping={isTyping}
        voiceStatus={voice.status}
        isMuted={voice.isMuted}
        isAgentSpeaking={voice.isAgentSpeaking}
        voiceError={voice.error}
        agentDispatched={voice.agentDispatched}
        onBack={handleScopingBack}
        onGenerateQuests={advanceToMain}
        onConnect={() => void connectVoice()}
        onToggleMute={() => void toggleMute()}
      />
    );
  }

  return (
    <main className="h-dvh overflow-hidden bg-[#e9dcc6]">
      {/* <VoiceDebugPanel diagnostics={voice.diagnostics} isAgentSpeaking={voice.isAgentSpeaking} /> */}
      <div className="mx-auto flex h-full w-full max-w-md flex-col overflow-hidden bg-[#f7f1e5] shadow-[8px_0_0_rgba(82,30,39,0.08)]">
        <header className="safe-top flex shrink-0 items-center justify-between px-5 pb-2 pt-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border-2 border-[#31101b] bg-[#8a293c] text-[#f5d58a] shadow-float">
              <ScrollText className="size-4" strokeWidth={2.3} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#8c6a5f]">
                SideQuest
              </p>
              <h1 className="truncate text-sm font-semibold tracking-tight text-[#31101b]">
                Your walking guide
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-sm border border-[#c7ac84] bg-[#fffaf0] px-3 py-2 text-xs font-semibold text-[#5c252b] shadow-sm">
              <span
                className={`size-1.5 rounded-full ${
                  voice.status === "connected" ? "bg-[#4b7f52]" : "bg-[#c67c2e]"
                }`}
              />
              {voice.status === "connected" ? "Guide live" : "Exploring"}
            </div>
            <button
              type="button"
              onClick={handleReturnToStart}
              className="flex size-9 items-center justify-center rounded-lg border border-[#c7ac84] bg-[#fffaf0] text-[#7a4c4d] shadow-sm transition hover:bg-[#eadfca] hover:text-[#31101b] active:scale-95"
              aria-label="Return to start"
              title="Return to start"
            >
              <Home className="size-4" />
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <MapCard
            location={location}
            status={locationStatus}
            error={locationError}
            onRetry={requestLocation}
          />
          <section className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border-2 border-[#c7ac84] bg-[#fffaf0] shadow-soft">
            <div className="flex shrink-0 items-center justify-between border-b border-[#dfceb1] px-4 py-2.5">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#8c6a5f]">
                  Conversation
                </p>
                <h2 className="truncate text-sm font-semibold tracking-tight text-[#31101b]">
                  Where should we wander?
                </h2>
              </div>
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#f3dfb8] text-[#9c3b43]">
                <MapPin className="size-4" />
              </div>
            </div>

            <ChatWindow messages={messages} isTyping={isTyping} />

            {voice.status === "connected" && !voice.agentDispatched && (
              <p
                role="alert"
                className="shrink-0 border-t border-[#dfceb1] bg-[#f7e6d0] px-4 py-2 text-[11px] leading-4 text-[#5c252b]"
              >
                No guide joined this room. Check that the agent worker is running.
              </p>
            )}

            {/* Voice is the only way in: the mic sits alone on the composer row. */}
            <div className="flex shrink-0 items-center justify-center border-t border-[#dfceb1] bg-[#fffaf0] px-4 py-3">
              <VoiceButton
                status={voice.status}
                isMuted={voice.isMuted}
                isAgentSpeaking={voice.isAgentSpeaking}
                error={voice.error}
                onConnect={() => void connectVoice()}
                onToggleMute={() => void toggleMute()}
              />
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
