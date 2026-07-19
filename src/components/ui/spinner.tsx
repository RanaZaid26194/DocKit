import { Loader2 } from "lucide-react";

/**
 * Centered spinner. Replaces bare "Loading…" text throughout the app so
 * users get a consistent, screen-reader-friendly loading affordance.
 */
export function Spinner({ label = "Loading", className = "" }: { label?: string; className?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex min-h-[8rem] items-center justify-center gap-2 text-sm text-muted-foreground ${className}`}
    >
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </div>
  );
}
