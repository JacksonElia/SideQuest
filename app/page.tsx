"use client";

import { useCallback, useEffect, useState } from "react";
import { Home, MapPin, ScrollText } from "lucide-react";
import { ChatInput } from "@/components/Chat/ChatInput";
import { ChatWindow } from "@/components/Chat/ChatWindow";
import { MapCard } from "@/components/Map/MapCard";
import { TravelPlanCard, type QuestPlace } from "@/components/Plan/TravelPlanCard";
import { QuestScoping } from "@/components/Quest/QuestScoping";
import { QuestSetup } from "@/components/Quest/QuestSetup";
import { QuestWelcome } from "@/components/Quest/QuestWelcome";
import { useLocation } from "@/hooks/useLocation";
import { createId } from "@/lib/utils";
import type { LocationCoordinates, Message, TravelProfile } from "@/types/message";

type QuestScreen = "welcome" | "setup" | "scoping" | "main";

interface SavedJourney {
  questName: string;
  locationLabel: string;
  messages: Message[];
  profile: TravelProfile | null;
  places: QuestPlace[];
}

interface QuestPlanResponse {
  queries?: unknown;
  places?: unknown;
  error?: unknown;
}

interface GuideAnswerResponse {
  answer?: unknown;
  error?: unknown;
}

const JOURNEY_STORAGE_KEY = "sidequest-journey";
const SAN_FRANCISCO_FALLBACK: LocationCoordinates = {
  // Near the bundled SoMa landmarks, so the fallback remains useful offline.
  latitude: 37.7804,
  longitude: -122.3934,
  accuracy: 0,
};
const SCOPING_QUESTIONS = [
  "How long will you be traveling, whether it's a few days or several weeks?",
  "What are you drawn to, such as history, landscapes and geography, or food and local flavors?",
  "How active would you like to be, from spry and up for anything to something slower and more restful?",
  "What sort of budget do you have in mind, whether you're spending freely or traveling frugally?",
] as const;

function textMessage(role: Message["role"], text: string): Message {
  return {
    id: createId(role),
    role,
    kind: "text",
    text,
    createdAt: new Date().toISOString(),
  };
}

function profileFromAnswers(answers: string[]): TravelProfile {
  const [duration = "", interests = "", activity = "", budget = ""] = answers;
  const dayMatch = duration.match(/\b(\d+)\s*day/i);
  const activityValue = activity.toLowerCase();
  const budgetValue = budget.toLowerCase();

  return {
    durationDays: dayMatch ? Number(dayMatch[1]) : 1,
    interests: interests.trim() ? [interests.trim()] : [],
    activityLevel: /slow|rest|easy|gentle/.test(activityValue)
      ? "restful"
      : /spry|active|anything|hike|far/.test(activityValue)
        ? "spry"
        : "moderate",
    budget: /cheap|free|frugal|budget/.test(budgetValue)
      ? "frugal"
      : /spend|splurge|luxury|anything/.test(budgetValue)
        ? "free-spending"
        : "moderate",
  };
}

function toPlaces(value: unknown): QuestPlace[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return [];
    const { name, detail } = entry as { name?: unknown; detail?: unknown };
    return typeof name === "string" && name.trim()
      ? [{ name: name.trim(), detail: typeof detail === "string" ? detail : null }]
      : [];
  });
}

export default function HomePage() {
  const [screen, setScreen] = useState<QuestScreen>("welcome");
  const [questName, setQuestName] = useState("Your SideQuest");
  const [locationLabel, setLocationLabel] = useState("");
  const [selectedLocation, setSelectedLocation] = useState<LocationCoordinates | null>(null);
  const [isUsingCurrentLocation, setIsUsingCurrentLocation] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  const [profile, setProfile] = useState<TravelProfile | null>(null);
  const [places, setPlaces] = useState<QuestPlace[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [scopingError, setScopingError] = useState<string | null>(null);
  const {
    location,
    status: locationStatus,
    error: locationError,
    requestLocation,
  } = useLocation(screen === "setup" || screen === "scoping" || screen === "main");

  const persistJourney = useCallback(() => {
    if (typeof window === "undefined") return;
    const journey: SavedJourney = { questName, locationLabel, messages, profile, places };
    window.localStorage.setItem(JOURNEY_STORAGE_KEY, JSON.stringify(journey));
  }, [locationLabel, messages, places, profile, questName]);

  useEffect(() => {
    if (screen === "main") persistJourney();
  }, [persistJourney, screen]);

  useEffect(() => {
    if (location) {
      setSelectedLocation(location);
      setLocationLabel("Current location");
      setIsUsingCurrentLocation(true);
    }
  }, [location]);

  const handleStartNewQuest = () => {
    setQuestName("Your SideQuest");
    setLocationLabel("San Francisco, CA");
    setSelectedLocation(SAN_FRANCISCO_FALLBACK);
    setIsUsingCurrentLocation(false);
    setMessages([]);
    setAnswers([]);
    setProfile(null);
    setPlaces([]);
    setScopingError(null);
    setScreen("setup");
  };

  const handleContinueJourney = () => {
    const savedJourney = window.localStorage.getItem(JOURNEY_STORAGE_KEY);
    if (savedJourney) {
      try {
        const parsed = JSON.parse(savedJourney) as Partial<SavedJourney>;
        if (typeof parsed.questName === "string") setQuestName(parsed.questName);
        if (typeof parsed.locationLabel === "string") setLocationLabel(parsed.locationLabel);
        if (Array.isArray(parsed.messages)) setMessages(parsed.messages);
        if (Array.isArray(parsed.places)) setPlaces(toPlaces(parsed.places));
        if (parsed.profile && typeof parsed.profile === "object") {
          setProfile(parsed.profile as TravelProfile);
        }
      } catch {
        window.localStorage.removeItem(JOURNEY_STORAGE_KEY);
      }
    }
    setScreen("main");
  };

  const handleUseCurrentLocation = useCallback(() => {
    requestLocation();
  }, [requestLocation]);

  const handleCreateQuest = () => {
    const label = locationLabel.trim() || "Current location";
    setLocationLabel(label);
    setMessages([textMessage("assistant", SCOPING_QUESTIONS[0])]);
    setAnswers([]);
    setProfile(null);
    setScopingError(null);
    setScreen("scoping");
  };

  const handleScopingAnswer = async (answer: string) => {
    if (answers.length >= SCOPING_QUESTIONS.length) return;

    const nextAnswers = [...answers, answer.trim()];
    setAnswers(nextAnswers);
    setMessages((current) => [
      ...current,
      textMessage("user", answer.trim()),
      ...(nextAnswers.length < SCOPING_QUESTIONS.length
        ? [textMessage("assistant", SCOPING_QUESTIONS[nextAnswers.length])]
        : [
            textMessage(
              "assistant",
              "Perfect. I have what I need. Generate your quests when you're ready.",
            ),
          ]),
    ]);
  };

  const handleGenerateQuests = async () => {
    const fix = selectedLocation ?? location;
    if (!fix) {
      setScopingError("Choose a starting location before generating a quest.");
      return;
    }

    const nextProfile = profileFromAnswers(answers);
    setProfile(nextProfile);
    setIsGenerating(true);
    setScopingError(null);

    try {
      const response = await fetch("/api/quest-plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          locationLabel,
          lat: fix.latitude,
          lng: fix.longitude,
          profile: nextProfile,
        }),
      });
      const result = (await response.json()) as QuestPlanResponse;
      if (!response.ok) {
        throw new Error(typeof result.error === "string" ? result.error : "Quest planning failed.");
      }

      const nextPlaces = toPlaces(result.places);
      setPlaces(nextPlaces);
      setMessages((current) => [
        ...current,
        textMessage(
          "assistant",
          `Your plan is ready. Moss found ${nextPlaces.length || "no"} matching places for your quest.`,
        ),
      ]);
      setScreen("main");
    } catch (error) {
      setScopingError(error instanceof Error ? error.message : "Quest planning failed.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGuideMessage = async (text: string) => {
    const fix = selectedLocation ?? location;
    setMessages((current) => [...current, textMessage("user", text)]);
    if (!fix) {
      setMessages((current) => [
        ...current,
        textMessage("assistant", "Choose a location first so I can search Moss nearby."),
      ]);
      return;
    }

    try {
      const response = await fetch("/api/guide-answer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lat: fix.latitude, lng: fix.longitude, question: text }),
      });
      const result = (await response.json()) as GuideAnswerResponse;
      if (!response.ok) {
        throw new Error(typeof result.error === "string" ? result.error : "Guide search failed.");
      }
      setMessages((current) => [
        ...current,
        textMessage(
          "assistant",
          typeof result.answer === "string" && result.answer.trim()
            ? result.answer
            : "I could not find an answer for that area question.",
        ),
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        textMessage(
          "assistant",
          error instanceof Error ? error.message : "Moss search is unavailable right now.",
        ),
      ]);
    }
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
        onBack={() => setScreen("welcome")}
        onCreateQuest={handleCreateQuest}
      />
    );
  }

  if (screen === "scoping") {
    return (
      <QuestScoping
        locationLabel={locationLabel}
        messages={messages}
        answeredCount={answers.length}
        isGenerating={isGenerating}
        error={scopingError}
        onBack={() => setScreen("setup")}
        onSendAnswer={handleScopingAnswer}
        onGenerateQuests={handleGenerateQuests}
      />
    );
  }

  return (
    <main className="h-dvh overflow-hidden bg-[#e9dcc6]">
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
              <span className="size-1.5 rounded-full bg-[#4b7f52]" />
              Text guide
            </div>
            <button
              type="button"
              onClick={() => setScreen("welcome")}
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
            location={selectedLocation ?? location}
            status={locationStatus}
            error={locationError}
            onRetry={requestLocation}
          />
          <TravelPlanCard
            questName={questName}
            locationLabel={locationLabel}
            profile={profile}
            places={places}
          />
          <section className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border-2 border-[#c7ac84] bg-[#fffaf0] shadow-soft">
            <div className="flex shrink-0 items-center justify-between border-b border-[#dfceb1] px-4 py-2.5">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#8c6a5f]">
                  Moss search
                </p>
                <h2 className="text-sm font-semibold tracking-tight text-[#31101b]">
                  Ask about the area
                </h2>
              </div>
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#f3dfb8] text-[#9c3b43]">
                <MapPin className="size-4" />
              </div>
            </div>
            <ChatWindow messages={messages} isTyping={false} />
            <div className="shrink-0 border-t border-[#dfceb1] bg-[#fffaf0] px-4 py-3">
              <ChatInput placeholder="Search nearby places..." onSend={handleGuideMessage} />
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
