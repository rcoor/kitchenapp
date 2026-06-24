import { create } from "zustand";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, XCircle, Info, X } from "lucide-react";

type ToastKind = "success" | "error" | "info";
type Toast = { id: number; kind: ToastKind; title: string; message?: string };

type ToastStore = {
  toasts: Toast[];
  push: (t: Omit<Toast, "id">) => void;
  dismiss: (id: number) => void;
};

let seq = 1;

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  push: (t) => {
    const id = seq++;
    set((s) => ({ toasts: [...s.toasts, { ...t, id }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), 5000);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));

export const toast = {
  success: (title: string, message?: string) =>
    useToastStore.getState().push({ kind: "success", title, message }),
  error: (title: string, message?: string) =>
    useToastStore.getState().push({ kind: "error", title, message }),
  info: (title: string, message?: string) =>
    useToastStore.getState().push({ kind: "info", title, message }),
};

const icons = {
  success: <CheckCircle2 className="h-4 w-4 text-[var(--color-up)]" />,
  error: <XCircle className="h-4 w-4 text-[var(--color-down)]" />,
  info: <Info className="h-4 w-4 text-[var(--color-accent)]" />,
};

export function Toaster() {
  const { toasts, dismiss } = useToastStore();
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[340px] max-w-[90vw] flex-col gap-2">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 40 }}
            className="glass pointer-events-auto flex items-start gap-3 rounded-xl p-3.5 shadow-lg"
          >
            <div className="mt-0.5">{icons[t.kind]}</div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-[var(--color-fg)]">{t.title}</div>
              {t.message && (
                <div className="mt-0.5 break-words text-xs text-[var(--color-muted)]">{t.message}</div>
              )}
            </div>
            <button onClick={() => dismiss(t.id)} className="text-[var(--color-faint)] hover:text-[var(--color-fg)]">
              <X className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
