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
    clearTimer();

    if (recorderRef.current?.state === "recording") {
      // Do not release the stream here. stop() only queues the final
      // dataavailable/onstop; killing the tracks in the same tick can drop the
      // last chunk, and on some browsers onstop never fires at all — which
      // strands status on "processing" and disables the mic button for good.
      // onstop owns teardown instead.
      setStatus("processing");
      recorderRef.current.stop();
      return;
    }

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
        recorderRef.current = null;
        chunksRef.current = [];
        clearTimer();
        releaseStream();
        setRecordingBlob(blob);
        setStatus("idle");
      };

      recorder.onerror = () => {
        recorderRef.current = null;
        chunksRef.current = [];
        clearTimer();
        releaseStream();
        setStatus("error");
        setError("Something interrupted the recording. Please try again.");
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
  }, [clearTimer, releaseStream, status]);

  const clearRecording = useCallback(() => {
    setRecordingBlob(null);
  }, []);

  useEffect(() => {
    return () => {
      clearTimer();

      // Detach first: onstop now owns teardown and calls setState, which would
      // land on an unmounted hook. Release the tracks here instead.
      const recorder = recorderRef.current;
      if (recorder) {
        recorder.onstop = null;
        recorder.ondataavailable = null;
        recorder.onerror = null;
        if (recorder.state !== "inactive") recorder.stop();
        recorderRef.current = null;
      }

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
