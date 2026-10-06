import { cn } from "@/lib/utils";

/**
 * TerraLens mark: a lens aperture formed of two leaves. Pure SVG so it ships
 * in the bundle, scales crisply, and never blocks on a network request.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" role="img" aria-label="TerraLens" className={cn("size-8", className)}>
      <circle cx="16" cy="16" r="14.5" className="fill-none stroke-primary" strokeWidth="2" />
      <path
        d="M16 6.5c-5 3-7.5 6.5-7.5 10.5S11.5 25 16 25.5c4.5-.5 7.5-3.5 7.5-8.5S21 9.5 16 6.5Z"
        className="fill-primary/15"
      />
      <path
        d="M16 7.5c-.4 5.5-.4 11.5 0 17"
        className="stroke-primary"
        strokeWidth="1.6"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M16 13c2.2-.4 4-1.6 5.2-3.4M16 18.4c-2.2-.4-4-1.6-5.2-3.4M16 22.6c2-1 3.6-2.4 4.8-4.2"
        className="stroke-primary"
        strokeWidth="1.4"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <Logo />
      <span className="font-display text-lg font-semibold tracking-tight">TerraLens</span>
    </span>
  );
}
