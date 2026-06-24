import * as React from "react";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-[var(--color-muted)]">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatTile({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "default" | "up" | "down";
}) {
  return (
    <div className="card p-4">
      <div className="text-xs text-[var(--color-muted)]">{label}</div>
      <div
        className={cn(
          "tnum mt-1.5 text-2xl font-semibold",
          tone === "up" && "text-[var(--color-up)]",
          tone === "down" && "text-[var(--color-down)]",
        )}
      >
        {value}
      </div>
      {sub && <div className="mt-1 text-xs text-[var(--color-faint)]">{sub}</div>}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--color-border)] px-6 py-14 text-center">
      {icon && <div className="mb-3 text-[var(--color-faint)]">{icon}</div>}
      <div className="text-sm font-medium text-[var(--color-fg)]">{title}</div>
      {description && <p className="mt-1 max-w-sm text-xs text-[var(--color-muted)]">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Sparkline({ data, up }: { data: number[]; up?: boolean }) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const w = 96;
  const h = 28;
  const pts = data
    .map((d, i) => `${(i / (data.length - 1)) * w},${h - ((d - min) / range) * h}`)
    .join(" ");
  const color = up ? "var(--color-up)" : "var(--color-down)";
  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
