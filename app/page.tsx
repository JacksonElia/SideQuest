"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MapPin, Sparkles } from "lucide-react";
import { CameraButton } from "@/components/Camera/CameraButton";
import { ChatWindow } from "@/components/Chat/ChatWindow";
import { MapCard } from "@/components/Map/MapCard";
import { TravelPlanCard } from "@/components/Plan/TravelPlanCard";
import { VoiceButton } from "@/components/Voice/VoiceButton";
import { useLocation } from "@/hooks/useLocation";
import { useRecorder } from "@/hooks/useRecorder";
import { createAssistantMessage, INITIAL_MESSAGES } from "@/lib/mock-ai";
import { createId } from "@/lib/utils";
import type { ImageMessage, Message } from "@/types/message";

export default function HomePage() {
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [isTyping, setIsTyping] = useState(false);
  const timeoutIdsRef = useRef<number[]>([]);
  const imageUrlsRef = useRef<string[]>([]);
  const { location, status: locationStatus, error: locationError, requestLocation } = useLocation();
  const {
    status: recorderStatus,
    durationSeconds,
    recordingBlob,
    error: recorderError,
    startRecording,
    stopRecording,
    clearRecording,
  } = useRecorder();

  const queueAssistantResponse = useCallback(() => {
    setIsTyping(true);
    const timeoutId = window.setTimeout(() => {
      setMessages((currentMessages) => [
        ...currentMessages,
        createAssistantMessage(createId("assistant")),
      ]);
      setIsTyping(false);
      timeoutIdsRef.current = timeoutIdsRef.current.filter((id) => id !== timeoutId);
    }, 1000);

    timeoutIdsRef.current.push(timeoutId);
  }, []);

  const addUserMessage = useCallback((message: Message) => {
    setMessages((currentMessages) => [...currentMessages, message]);
    queueAssistantResponse();
  }, [queueAssistantResponse]);

  const handleImageSelected = (file: File) => {
    const imageUrl = URL.createObjectURL(file);
    imageUrlsRef.current.push(imageUrl);

    const imageMessage: ImageMessage = {
      id: createId("image"),
      role: "user",
      kind: "image",
      imageUrl,
      alt: file.name || "A photo shared with your walking guide",
      createdAt: new Date().toISOString(),
    };

    addUserMessage(imageMessage);
  };

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
    const imageUrls = imageUrlsRef.current;
    return () => {
      timeoutIdsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
      imageUrls.forEach((imageUrl) => URL.revokeObjectURL(imageUrl));
    };
  }, []);

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
          <div className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            Exploring
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col px-4 pb-3">
          <MapCard
            location={location}
            status={locationStatus}
            error={locationError}
            onRetry={requestLocation}
          />
          <TravelPlanCard />

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
                <div className="mt-3 flex items-start justify-center gap-5">
                  <VoiceButton
                    variant="conversation"
                    status={recorderStatus}
                    durationSeconds={durationSeconds}
                    error={recorderError}
                    onStart={startRecording}
                    onStop={stopRecording}
                  />
                  <CameraButton compact onImageSelected={handleImageSelected} />
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
