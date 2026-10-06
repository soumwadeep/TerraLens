"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  /** Prevent closing by backdrop/Escape (e.g. during capture). */
  dismissible?: boolean;
}

/**
 * Lightweight accessible dialog: Escape to close, backdrop click, focus moved
 * to the panel on open. Deliberately dependency-free.
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
  dismissible = true,
}: DialogProps) {
  const panelRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dismissible) onOpenChange(false);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, dismissible, onOpenChange]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 animate-fade-in bg-foreground/40 backdrop-blur-sm"
        onClick={() => dismissible && onOpenChange(false)}
        tabIndex={-1}
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        className={cn(
          "relative z-10 max-h-[92dvh] w-full animate-fade-up overflow-y-auto rounded-t-3xl border bg-card p-5 shadow-xl sm:max-w-lg sm:rounded-2xl",
          className
        )}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            {title ? (
              <h2 className="font-display text-lg font-semibold leading-snug">{title}</h2>
            ) : null}
            {description ? (
              <p className="mt-1 text-pretty text-sm text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {dismissible ? (
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="tap-target -mr-2 -mt-1 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Close"
            >
              <X className="size-5" />
            </button>
          ) : null}
        </div>
        {children}
        {footer ? (
          <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}
