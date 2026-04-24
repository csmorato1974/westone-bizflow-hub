export function WestoneLogo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <svg viewBox="0 0 64 64" className="h-9 w-9" aria-hidden>
        <rect width="64" height="64" rx="10" fill="hsl(var(--primary))" />
        <path d="M10 46 L24 24 L32 35 L40 24 L54 46 Z" fill="hsl(var(--brand))" />
      </svg>
      <div className="flex flex-col leading-none">
        <span className="industrial-title text-lg text-brand">WESTONE</span>
        <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Performance</span>
      </div>
    </div>
  );
}
