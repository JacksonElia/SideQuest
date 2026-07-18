"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RecorderStatus } from "@/types/message";

interface UseRecorderResult {
  status: RecorderStatus;
  durationSeconds: number;
  recordingBlob: Blob | null;
  error: string | null;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  clearRecording: () => void;
}

export function useRecorder(): UseRecorderResult {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [recordingBlob, setRecordingBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const stopRecording = useCallback(() => {
    if (recorderRef.current?.state === "recording") {
      setStatus("processing");
      recorderRef.current.stop();
    }

    clearTimer();
    releaseStream();
  }, [clearTimer, releaseStream]);

  const startRecording = useCallback(async () => {
    if (status === "listening" || status === "requesting" || status === "processing") {
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setStatus("error");
      setError("Audio recording is not supported in this browser.");
      return;
    }

    setStatus("requesting");
    setError(null);
    setRecordingBlob(null);
    setDurationSeconds(0);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);

      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];
      startedAtRef.current = Date.now();

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        setRecordingBlob(blob);
        setStatus("idle");
        recorderRef.current = null;
        chunksRef.current = [];
      };

      recorder.onerror = () => {
        setStatus("error");
        setError("Something interrupted the recording. Please try again.");
        releaseStream();
      };

      recorder.start();
      setStatus("listening");
      timerRef.current = setInterval(() => {
        if (startedAtRef.current) {
          setDurationSeconds(Math.floor((Date.now() - startedAtRef.current) / 1000));
        }
      }, 250);
    } catch (recordingError) {
      const denied =
        recordingError instanceof DOMException &&
        (recordingError.name === "NotAllowedError" || recordingError.name === "PermissionDeniedError");

      setStatus(denied ? "denied" : "error");
      setError(
        denied
          ? "Microphone access is off. Enable it in your browser settings to record a message."
          : "We could not start the microphone. Please try again.",
      );
      releaseStream();
    }
  }, [releaseStream, status]);

  const clearRecording = useCallback(() => {
    setRecordingBlob(null);
  }, []);

  useEffect(() => {
    return () => {
      clearTimer();
      recorderRef.current?.stop();
      releaseStream();
    };
  }, [clearTimer, releaseStream]);

  return {
    status,
    durationSeconds,
    recordingBlob,
    error,
    startRecording,
    stopRecording,
    clearRecording,
  };
}
