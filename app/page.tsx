"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Home, MapPin, Sparkles } from "lucide-react";
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
import type { Message } from "@/types/message";

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
  const [setupStep, setSetupStep] = useState(0);
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [isTyping, setIsTyping] = useState(false);
  const [questName, setQuestName] = useState("The Little Detour");
  const [locationLabel, setLocationLabel] = useState("");
  const timeoutIdsRef = useRef<number[]>([]);
  const revealTimeoutRef = useRef<number | null>(null);
  const { location, status: locationStatus, error: locationError, requestLocation } = useLocation(
    screen === "main" || (screen === "setup" && setupStep === 1),
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
    setSetupStep(0);
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
    if (setupStep === 1) {
      setSetupStep(0);
      return;
    }
    setScreen("welcome");
  };

  const handleUseCurrentLocation = () => {
    requestLocation();
    setLocationLabel("Current location");
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
        step={setupStep}
        location={location}
        locationStatus={locationStatus}
        locationError={locationError}
        locationLabel={locationLabel}
        onLocationLabelChange={setLocationLabel}
        onUseCurrentLocation={handleUseCurrentLocation}
        onNext={() => setSetupStep(1)}
        onBack={handleSetupBack}
        onCreateQuest={handleCreateQuest}
      />
    );
  }

  if (screen === "reveal") {
    return <QuestReveal questName={questName} onContinue={handleRevealContinue} />;
  }

  return (
    <main className="min-h-screen bg-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col overflow-hidden bg-[#f8fafc] shadow-2xl shadow-slate-300/30">
        <header className="safe-top flex items-center justify-between px-5 pb-3 pt-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-float">
              <Sparkles className="size-5" strokeWidth={2.3} />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">
                SideQuest
              </p>
              <h1 className="text-base font-semibold tracking-tight text-slate-900">Your walking guide</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              Exploring
            </div>
            <button
              type="button"
              onClick={handleReturnToStart}
              className="flex size-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:bg-slate-50 hover:text-slate-900 active:scale-95"
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

          <section className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-soft">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
                  Conversation
                </p>
                <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">
                  Where should we wander?
                </h2>
              </div>
              <div className="flex size-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <MapPin className="size-4" />
              </div>
            </div>

            <ChatWindow messages={messages} isTyping={isTyping} />
            <div className="border-t border-slate-100 bg-white px-5 py-4">
              <div className="flex flex-col items-center text-center">
                <p className="text-xs font-semibold text-slate-600">Talk it through with your guide</p>
                <p className="mt-1 text-[11px] text-slate-400">Tap and speak naturally</p>
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
