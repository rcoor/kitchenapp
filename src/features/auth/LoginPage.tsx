import * as React from "react";
import { motion } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { Logo } from "@/components/Logo";

export function LoginPage() {
  const [mode, setMode] = React.useState<"signin" | "signup">("signin");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (!data.session) {
          // project requires email confirmation before a session is issued
          toast.info("Confirm your email", "Check your inbox, then sign in.");
          setMode("signin");
        } else {
          toast.success("Account created", "You're signed in.");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      toast.error("Authentication failed", (err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      <div className="pointer-events-none absolute -left-40 top-0 h-[420px] w-[420px] rounded-full bg-[var(--color-accent)]/10 blur-[120px]" />
      <div className="pointer-events-none absolute -right-40 bottom-0 h-[420px] w-[420px] rounded-full bg-[var(--color-accent-2)]/10 blur-[120px]" />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="card w-full max-w-md p-8"
      >
        <div className="mb-7 flex items-center gap-3">
          <Logo className="h-9 w-9" />
          <div>
            <div className="text-lg font-semibold tracking-tight">Helm</div>
            <div className="text-xs text-[var(--color-muted)]">AI trading desk</div>
          </div>
        </div>

        <h1 className="text-xl font-semibold tracking-tight">
          {mode === "signin" ? "Welcome back" : "Create your desk"}
        </h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          {mode === "signin"
            ? "Sign in to your trading desk."
            : "Start in the simulator — no broker or money required."}
        </p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          <Button type="submit" size="lg" className="w-full" disabled={loading}>
            {loading ? <Spinner /> : mode === "signin" ? "Sign in" : "Create account"}
          </Button>
        </form>

        <div className="mt-5 text-center text-xs text-[var(--color-muted)]">
          {mode === "signin" ? "New here?" : "Already have an account?"}{" "}
          <button
            className="font-medium text-[var(--color-accent)] hover:underline"
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          >
            {mode === "signin" ? "Create an account" : "Sign in"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
