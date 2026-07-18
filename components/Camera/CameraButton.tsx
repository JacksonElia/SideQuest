"use client";

import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { Camera, ImagePlus, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface CameraButtonProps {
  onImageSelected: (file: File) => void;
  compact?: boolean;
}

export function CameraButton({ onImageSelected, compact = false }: CameraButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);

  const requestCamera = async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      cameraInputRef.current?.click();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach((track) => track.stop());
      cameraInputRef.current?.click();
    } catch (cameraError) {
      const denied =
        cameraError instanceof DOMException &&
        (cameraError.name === "NotAllowedError" || cameraError.name === "PermissionDeniedError");
      setError(denied ? "Camera access is off in browser settings." : "Camera could not be opened.");
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onImageSelected(file);
    }
    event.target.value = "";
    setIsOpen(false);
  };

  return (
    <div
      className={
        compact
          ? "relative flex shrink-0"
          : "relative flex min-w-16 flex-col items-center gap-1"
      }
    >
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: 8, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          className="absolute bottom-[calc(100%+0.75rem)] right-0 w-48 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl"
        >
          <button
            type="button"
            onClick={() => void requestCamera()}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-xs font-semibold text-slate-700 transition hover:bg-slate-50 active:scale-[0.98]"
          >
            <span className="flex size-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <Camera className="size-4" />
            </span>
            Take a photo
          </button>
          <button
            type="button"
            onClick={() => libraryInputRef.current?.click()}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-xs font-semibold text-slate-700 transition hover:bg-slate-50 active:scale-[0.98]"
          >
            <span className="flex size-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <ImagePlus className="size-4" />
            </span>
            Choose from library
          </button>
          {error && <p className="px-3 pb-2 text-[10px] leading-4 text-rose-600">{error}</p>}
        </motion.div>
      )}
      <motion.button
        whileTap={{ scale: 0.9 }}
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className={cn(
          "flex items-center justify-center rounded-2xl transition",
          compact ? "size-10 rounded-xl" : "size-12",
          isOpen
            ? "bg-blue-600 text-white shadow-float"
            : "text-slate-400 hover:bg-slate-50 hover:text-slate-700",
        )}
        aria-label={isOpen ? "Close photo options" : "Share a photo"}
      >
        {isOpen ? <X className="size-5" /> : <Camera className="size-5" />}
      </motion.button>
      {!compact && <span className="text-[10px] font-semibold text-slate-400">Photo</span>}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
        aria-hidden="true"
      />
      <input
        ref={libraryInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
        aria-hidden="true"
      />
    </div>
  );
}
