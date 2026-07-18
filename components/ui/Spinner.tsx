"use client";

import { cn } from "@/lib/utils";

interface SpinnerProps {
  className?: string;
  label?: string;
}

/**
 * Ring spinner drawn from borders so it inherits the current text color.
 * Sized with `size-*` from the caller, e.g. <Spinner className="size-4" />.
 */
export function Spinner({ className, label = "Loading" }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label={label}
      className={cn(
        "inline-block size-4 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent opacity-70",
        className,
      )}
    />
  );
}
