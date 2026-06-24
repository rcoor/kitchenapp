import { Command } from "cmdk";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  LayoutDashboard,
  LineChart,
  Sparkles,
  Boxes,
  History,
  Settings,
} from "lucide-react";

const ITEMS = [
  { label: "Dashboard", to: "/", icon: LayoutDashboard },
  { label: "Markets & watchlist", to: "/markets", icon: LineChart },
  { label: "Signals & AI recommendations", to: "/recommendations", icon: Sparkles },
  { label: "Data sources & skills", to: "/sources", icon: Boxes },
  { label: "History & time travel", to: "/history", icon: History },
  { label: "Settings & automation", to: "/settings", icon: Settings },
];

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();

  function go(to: string) {
    navigate(to);
    onClose();
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[95] flex items-start justify-center p-4 pt-[18vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="card relative z-10 w-full max-w-lg overflow-hidden p-0"
          >
            <Command label="Command palette">
              <Command.Input
                autoFocus
                placeholder="Jump to…"
                className="w-full border-b border-[var(--color-border)] bg-transparent px-4 py-3.5 text-sm outline-none placeholder:text-[var(--color-faint)]"
              />
              <Command.List className="max-h-[320px] overflow-y-auto p-2">
                <Command.Empty className="px-3 py-6 text-center text-sm text-[var(--color-muted)]">
                  No results.
                </Command.Empty>
                {ITEMS.map((item) => (
                  <Command.Item
                    key={item.to}
                    value={item.label}
                    onSelect={() => go(item.to)}
                    className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-[var(--color-muted)] data-[selected=true]:bg-[var(--color-elevated)] data-[selected=true]:text-[var(--color-fg)]"
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </Command.Item>
                ))}
              </Command.List>
            </Command>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
