import { cn } from "@/lib/utils";

export function HelixMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8", className)} aria-hidden="true">
      <rect width="32" height="32" rx="7" className="fill-ink" />
      <path
        fill="none"
        stroke="#f3f0e8"
        strokeWidth="2.8"
        strokeLinecap="round"
        d="M11 5.5c6.2 3.1 6.2 5.6 0 8.7S4.8 20 11 23.1c6.2 3.1 6.2 4.6 0 6.4"
      />
      <path
        fill="none"
        stroke="#5f7468"
        strokeWidth="2.8"
        strokeLinecap="round"
        d="M21 5.5c-6.2 3.1-6.2 5.6 0 8.7s6.2 5.6 0 8.7c-6.2 3.1-6.2 4.6 0 6.4"
      />
      <path fill="none" stroke="#5a6f78" strokeWidth="2" strokeLinecap="round" d="M11.8 10h8.4M11.8 18.8h8.4" />
    </svg>
  );
}
