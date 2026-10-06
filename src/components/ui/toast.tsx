"use client";

import * as React from "react";
import { CheckCircle2, Info, TriangleAlert, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { uuid } from "@/lib/utils";

type ToastVariant = "info" | "success" | "warning" | "error";

interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
  durationMs: number;
}

interface ToastContextValue {
  toast: (t: {
    title: string;
    description?: string;
    variant?: ToastVariant;
    durationMs?: number;
  }) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

const ICONS: Record<ToastVariant, React.ElementType> = {
  info: Info,
  success: CheckCircle2,
  warning: TriangleAlert,
  error: XCircle,
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);

  const dismiss = React.useCallback((id: string) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = React.useCallback<ToastContextValue["toast"]>(
    ({ title, description, variant = "info", durationMs = 4200 }) => {
      const id = uuid();
      setItems((prev) => [...prev.slice(-2), { id, title, description, variant, durationMs }]);
      if (typeof window !== "undefined") {
        window.setTimeout(() => dismiss(id), durationMs);
      }
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        aria-live="polite"
        className="safe-bottom pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4"
      >
        {items.map((t) => {
          const Icon = ICONS[t.variant];
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => dismiss(t.id)}
              className={cn(
                "pointer-events-auto flex w-full max-w-sm animate-sync-slide items-start gap-3 rounded-xl border bg-card p-3.5 text-left shadow-lg",
                t.variant === "error" && "border-destructive/40",
                t.variant === "success" && "border-success/40",
                t.variant === "warning" && "border-warning/40"
              )}
            >
              <Icon
                className={cn(
                  "mt-0.5 size-5 shrink-0",
                  t.variant === "info" && "text-sky",
                  t.variant === "success" && "text-success",
                  t.variant === "warning" && "text-warning",
                  t.variant === "error" && "text-destructive"
                )}
              />
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{t.title}</span>
                {t.description ? (
                  <span className="mt-0.5 block text-pretty text-xs text-muted-foreground">
                    {t.description}
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
