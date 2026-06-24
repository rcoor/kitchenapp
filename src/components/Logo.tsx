export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden>
      <defs>
        <linearGradient id="helm-g" x1="0" y1="0" x2="32" y2="32">
          <stop stopColor="#5eead4" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="#0e1014" stroke="url(#helm-g)" strokeOpacity="0.5" />
      <path
        d="M8 20.5L13 13L17 17.5L24 9.5"
        stroke="url(#helm-g)"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="24" cy="9.5" r="2.1" fill="#5eead4" />
    </svg>
  );
}
