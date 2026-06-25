import * as React from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  LineChart,
  Sparkles,
  Boxes,
  History,
  Settings,
  LogOut,
  Command,
  Menu,
  X,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { ModeSwitcher } from "@/components/ModeSwitcher";
import { CommandPalette } from "@/components/CommandPalette";
import { useAuth } from "@/features/auth/AuthProvider";
import { useProfile } from "@/features/account/useProfile";
import { MODE_BLURBS, type Mode } from "@/lib/types";
import { useMode } from "@/features/account/useProfile";
import { initials } from "@/lib/utils";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/markets", label: "Markets", icon: LineChart },
  { to: "/recommendations", label: "Signals & AI", icon: Sparkles },
  { to: "/sources", label: "Data Sources", icon: Boxes },
  { to: "/history", label: "History", icon: History },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function AppShell() {
  const { user, signOut } = useAuth();
  const { data: profile } = useProfile();
  const mode = useMode();
  const navigate = useNavigate();
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex min-h-screen">
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />

      {/* mobile nav drawer (below lg, where the sidebar is hidden) */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside className="absolute left-0 top-0 flex h-full w-64 flex-col border-r border-[var(--color-border-soft)] bg-[var(--color-surface)] p-4">
            <div className="mb-8 flex items-center justify-between px-2">
              <div className="flex items-center gap-2.5">
                <Logo className="h-8 w-8" />
                <span className="text-base font-semibold tracking-tight">Helm</span>
              </div>
              <button
                onClick={() => setMobileNavOpen(false)}
                className="grid h-8 w-8 place-items-center rounded-lg text-[var(--color-muted)] hover:bg-[var(--color-elevated)] hover:text-[var(--color-fg)]"
                aria-label="Close menu"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <nav className="flex flex-col gap-1">
              {NAV.map(({ to, label, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  onClick={() => setMobileNavOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-[var(--color-elevated)] text-[var(--color-fg)]"
                        : "text-[var(--color-muted)] hover:bg-[var(--color-elevated)]/60 hover:text-[var(--color-fg)]",
                    )
                  }
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </NavLink>
              ))}
            </nav>
          </aside>
        </div>
      )}

      {/* sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-[var(--color-border-soft)] bg-[var(--color-surface)]/40 p-4 lg:flex">
        <div className="mb-8 flex items-center gap-2.5 px-2">
          <Logo className="h-8 w-8" />
          <span className="text-base font-semibold tracking-tight">Helm</span>
        </div>

        <nav className="flex flex-1 flex-col gap-1">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-[var(--color-elevated)] text-[var(--color-fg)]"
                    : "text-[var(--color-muted)] hover:bg-[var(--color-elevated)]/60 hover:text-[var(--color-fg)]",
                )
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        <ModeBadge mode={mode} />

        <button
          onClick={() => setPaletteOpen(true)}
          className="mt-3 flex items-center justify-between rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs text-[var(--color-muted)] hover:text-[var(--color-fg)]"
        >
          <span className="flex items-center gap-2">
            <Command className="h-3.5 w-3.5" /> Quick actions
          </span>
          <kbd className="rounded bg-[var(--color-elevated)] px-1.5 py-0.5 text-[10px]">⌘K</kbd>
        </button>
      </aside>

      {/* main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-[var(--color-border-soft)] bg-[var(--color-canvas)]/80 px-5 py-3 backdrop-blur-xl">
          <div className="flex items-center gap-2 lg:hidden">
            <button
              onClick={() => setMobileNavOpen(true)}
              className="grid h-9 w-9 place-items-center rounded-lg text-[var(--color-muted)] hover:bg-[var(--color-elevated)] hover:text-[var(--color-fg)]"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <Logo className="h-7 w-7" />
            <span className="font-semibold">Helm</span>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <ModeSwitcher />
            <div className="flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] py-1 pl-1 pr-3">
              <div className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-accent-2)] text-xs font-bold text-[#04201b]">
                {initials(profile?.display_name || user?.email)}
              </div>
              <span className="hidden max-w-[140px] truncate text-xs text-[var(--color-muted)] sm:block">
                {user?.email}
              </span>
              <button
                onClick={() => signOut().then(() => navigate("/"))}
                className="text-[var(--color-faint)] hover:text-[var(--color-down)]"
                title="Sign out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1400px] flex-1 px-5 py-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function ModeBadge({ mode }: { mode: Mode }) {
  return (
    <div
      className={cn(
        "rounded-xl border p-3 text-xs",
        mode === "live"
          ? "border-[var(--color-down)]/30 bg-[var(--color-down)]/5"
          : "border-[var(--color-border)] bg-[var(--color-surface-2)]",
      )}
    >
      <div className="mb-1 flex items-center gap-1.5 font-medium text-[var(--color-fg)]">
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            mode === "live" ? "bg-[var(--color-down)]" : "bg-[var(--color-accent)]",
          )}
        />
        {mode === "live" ? "Live trading" : mode === "paper" ? "Paper trading" : "Simulator"}
      </div>
      <p className="leading-relaxed text-[var(--color-faint)]">{MODE_BLURBS[mode]}</p>
    </div>
  );
}
