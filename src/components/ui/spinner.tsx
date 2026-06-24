import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("h-4 w-4 animate-spin", className)} />;
}

export function FullPageSpinner() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-[var(--color-canvas)]">
      <Spinner className="h-6 w-6 text-[var(--color-accent)]" />
    </div>
  );
}
