"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Home, MapPin, ScrollText } from "lucide-react";
import { ChatWindow } from "@/components/Chat/ChatWindow";
import { MapCard } from "@/components/Map/MapCard";
import { TravelPlanCard } from "@/components/Plan/TravelPlanCard";
import { QuestReveal } from "@/components/Quest/QuestReveal";
import { QuestSetup } from "@/components/Quest/QuestSetup";
import { QuestWelcome } from "@/components/Quest/QuestWelcome";
import { VoiceButton } from "@/components/Voice/VoiceButton";
import { useLocation } from "@/hooks/useLocation";
import { useRecorder } from "@/hooks/useRecorder";
import { createAssistantMessage, INITIAL_MESSAGES } from "@/lib/mock-ai";
import { createId } from "@/lib/utils";
import type { LocationCoordinates, Message } from "@/types/message";

type QuestScreen = "welcome" | "setup" | "reveal" | "main";

interface SavedJourney {
  questName: string;
  locationLabel: string;
  messages: Message[];
}

const JOURNEY_STORAGE_KEY = "sidequest-journey";
const QUEST_NAMES = ["The Serendipity Stroll", "The Tiny Grand Tour", "The Sidewalk Symphony"];

export default function HomePage() {
  const [screen, setScreen] = useState<QuestScreen>("welcome");
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [isTyping, setIsTyping] = useState(false);
  const [questName, setQuestName] = useState("The Little Detour");
  const [locationLabel, setLocationLabel] = useState("");
  const [selectedLocation, setSelectedLocation] = useState<LocationCoordinates | null>(null);
  const [isUsingCurrentLocation, setIsUsingCurrentLocation] = useState(false);
  const timeoutIdsRef = useRef<number[]>([]);
  const revealTimeoutRef = useRef<number | null>(null);
  const { location, status: locationStatus, error: locationError, requestLocation } = useLocation(
    screen === "main" || screen === "setup",
  );
  const {
    status: recorderStatus,
    durationSeconds,
    recordingBlob,
    error: recorderError,
    startRecording,
    stopRecording,
    clearRecording,
  } = useRecorder();

  const persistJourney = useCallback(
    (nextMessages: Message[], nextQuestName = questName, nextLocationLabel = locationLabel) => {
      if (typeof window === "undefined") {
        return;
      }

      const serializableMessages = nextMessages.map((message) => {
        const copy = { ...message };
        if (copy.kind === "voice") {
          delete copy.blob;
        }
        return copy;
      });

      const savedJourney: SavedJourney = {
        questName: nextQuestName,
        locationLabel: nextLocationLabel,
        messages: serializableMessages,
      };

      window.localStorage.setItem(JOURNEY_STORAGE_KEY, JSON.stringify(savedJourney));
    },
    [locationLabel, questName],
  );

  const clearPendingTimeouts = useCallback(() => {
    timeoutIdsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    timeoutIdsRef.current = [];
  }, []);

  const queueAssistantResponse = useCallback(() => {
    setIsTyping(true);
    const timeoutId = window.setTimeout(() => {
      setMessages((currentMessages) => {
        const nextMessages = [...currentMessages, createAssistantMessage(createId("assistant"))];
        persistJourney(nextMessages);
        return nextMessages;
      });
      setIsTyping(false);
      timeoutIdsRef.current = timeoutIdsRef.current.filter((id) => id !== timeoutId);
    }, 1000);

    timeoutIdsRef.current.push(timeoutId);
  }, [persistJourney]);

  const addUserMessage = useCallback((message: Message) => {
    setMessages((currentMessages) => {
      const nextMessages = [...currentMessages, message];
      persistJourney(nextMessages);
      return nextMessages;
    });
    queueAssistantResponse();
  }, [persistJourney, queueAssistantResponse]);

  useEffect(() => {
    if (!recordingBlob) {
      return;
    }

    addUserMessage({
      id: createId("voice"),
      role: "user",
      kind: "voice",
      blob: recordingBlob,
      durationSeconds,
      createdAt: new Date().toISOString(),
    });
    clearRecording();
  }, [addUserMessage, clearRecording, durationSeconds, recordingBlob]);

  useEffect(() => {
    if (isUsingCurrentLocation && location) {
      setSelectedLocation(location);
      setLocationLabel("Current location");
    }
  }, [isUsingCurrentLocation, location]);

  useEffect(() => {
    return () => {
      clearPendingTimeouts();
      if (revealTimeoutRef.current !== null) {
        window.clearTimeout(revealTimeoutRef.current);
      }
    };
  }, [clearPendingTimeouts]);

  const handleStartNewQuest = () => {
    setMessages(INITIAL_MESSAGES);
    setQuestName("The Little Detour");
    setLocationLabel("");
    setSelectedLocation(null);
    setIsUsingCurrentLocation(false);
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
          setMessages(parsedJourney.messages);
        }
      } catch {
        setMessages(INITIAL_MESSAGES);
      }
    }
    setScreen("main");
  };

  const handleSetupBack = () => {
    setScreen("welcome");
  };

  const handleUseCurrentLocation = () => {
    setIsUsingCurrentLocation(true);
    requestLocation();
  };

  const handlePlaceSelect = (label: string, coordinates: LocationCoordinates) => {
    setIsUsingCurrentLocation(false);
    setLocationLabel(label);
    setSelectedLocation(coordinates);
  };

  const handleCreateQuest = () => {
    const nextQuestName = QUEST_NAMES[Math.floor(Math.random() * QUEST_NAMES.length)];
    const nextLocationLabel = locationLabel.trim() || "Current location";
    setQuestName(nextQuestName);
    setLocationLabel(nextLocationLabel);
    setMessages(INITIAL_MESSAGES);
    persistJourney(INITIAL_MESSAGES, nextQuestName, nextLocationLabel);
    setScreen("reveal");
    revealTimeoutRef.current = window.setTimeout(() => {
      setScreen("main");
      revealTimeoutRef.current = null;
    }, 3_000);
  };

  const handleRevealContinue = () => {
    if (revealTimeoutRef.current !== null) {
      window.clearTimeout(revealTimeoutRef.current);
      revealTimeoutRef.current = null;
    }
    setScreen("main");
  };

  const handleReturnToStart = () => {
    clearPendingTimeouts();
    setIsTyping(false);
    setScreen("welcome");
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
        onPlaceSelect={handlePlaceSelect}
        onUseCurrentLocation={handleUseCurrentLocation}
        onBack={handleSetupBack}
        onCreateQuest={handleCreateQuest}
      />
    );
  }

  if (screen === "reveal") {
    return <QuestReveal questName={questName} onContinue={handleRevealContinue} />;
  }

  return (
    <main className="min-h-screen bg-[#e9dcc6]">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col overflow-hidden bg-[#f7f1e5] shadow-[8px_0_0_rgba(82,30,39,0.08)]">
        <header className="safe-top flex items-center justify-between px-5 pb-3 pt-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg border-2 border-[#31101b] bg-[#8a293c] text-[#f5d58a] shadow-float">
              <ScrollText className="size-5" strokeWidth={2.3} />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#8c6a5f]">
                SideQuest
              </p>
              <h1 className="text-base font-semibold tracking-tight text-[#31101b]">Your walking guide</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-sm border border-[#c7ac84] bg-[#fffaf0] px-3 py-2 text-xs font-semibold text-[#5c252b] shadow-sm">
              <span className="size-1.5 rounded-full bg-[#c67c2e]" />
              Exploring
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

        <div className="flex min-h-0 flex-1 flex-col px-4 pb-3">
          <MapCard
            location={location}
            status={locationStatus}
            error={locationError}
            onRetry={requestLocation}
          />
          <TravelPlanCard questName={questName} locationLabel={locationLabel} />

          <section className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border-2 border-[#c7ac84] bg-[#fffaf0] shadow-soft">
            <div className="flex items-center justify-between border-b border-[#dfceb1] px-5 py-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#8c6a5f]">
                  Conversation
                </p>
                <h2 className="mt-1 text-lg font-semibold tracking-tight text-[#31101b]">
                  Where should we wander?
                </h2>
              </div>
              <div className="flex size-9 items-center justify-center rounded-lg bg-[#f3dfb8] text-[#9c3b43]">
                <MapPin className="size-4" />
              </div>
            </div>

            <ChatWindow messages={messages} isTyping={isTyping} />
            <div className="border-t border-[#dfceb1] bg-[#fffaf0] px-5 py-4">
              <div className="flex flex-col items-center text-center">
                <p className="text-xs font-semibold text-[#5c252b]">Talk it through with your guide</p>
                <p className="mt-1 text-[11px] text-[#8c6a5f]">Tap and speak naturally</p>
                <div className="mt-3">
                  <VoiceButton
                    variant="conversation"
                    status={recorderStatus}
                    durationSeconds={durationSeconds}
                    error={recorderError}
                    onStart={startRecording}
                    onStop={stopRecording}
                  />
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
