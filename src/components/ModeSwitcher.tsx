import { motion } from "framer-motion";
import { useMode, useSetMode } from "@/features/account/useProfile";
import { MODE_LABELS, type Mode } from "@/lib/types";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

const MODES: Mode[] = ["sim", "paper", "live"];

export function ModeSwitcher() {
  const mode = useMode();
  const setMode = useSetMode();

  function pick(m: Mode) {
    if (m === mode) return;
    if (m === "live") {
      const ok = window.confirm(
        "Live mode places REAL orders with REAL money through Alpaca.\n\nLive trading is gated and requires connected live broker keys. Switch anyway?",
      );
      if (!ok) return;
    }
    setMode.mutate(m, {
      onSuccess: () => toast.info(`Switched to ${MODE_LABELS[m]} mode`),
      onError: (e) => toast.error("Could not switch mode", (e as Error).message),
    });
  }

  return (
    <div className="relative flex items-center gap-0.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-1">
      {MODES.map((m) => {
        const active = m === mode;
        return (
          <button
            key={m}
            onClick={() => pick(m)}
            className={cn(
              "relative z-10 rounded-lg px-3 py-1 text-xs font-medium transition-colors",
              active ? "text-[var(--color-fg)]" : "text-[var(--color-faint)] hover:text-[var(--color-muted)]",
              m === "live" && active && "text-[var(--color-down)]",
            )}
          >
            {active && (
              <motion.span
                layoutId="mode-pill"
                className={cn(
                  "absolute inset-0 -z-10 rounded-lg",
                  m === "live"
                    ? "bg-[var(--color-down)]/15 ring-1 ring-[var(--color-down)]/40"
                    : "bg-[var(--color-elevated)] ring-1 ring-[var(--color-border)]",
                )}
                transition={{ type: "spring", stiffness: 400, damping: 32 }}
              />
            )}
            {MODE_LABELS[m]}
          </button>
        );
      })}
    </div>
  );
}
