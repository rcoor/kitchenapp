# Helm — AI Trading Desk

A transparent, AI-assisted US-equities trading platform with two faces — a
**test/simulated** face and a **real** broker face — built on React + Vite and
Supabase. It reasons over live prices plus pluggable alternative-data signals
(starting with **US senator trades**), produces buy/sell/hold recommendations
with Claude, and records every decision and order immutably so you can travel
back in time and review exactly what happened.

> ⚠️ Educational/informational tool, not financial advice. Live trading is
> gated off by default and uses real money only after you explicitly connect
> live broker keys and switch to Live mode.

## Highlights

- **Three execution faces via one interface** — `sim` (offline fill engine with
  modeled fees + slippage), `paper` (Alpaca paper), `live` (Alpaca live, gated).
- **Data sources as installable, shareable skills.** Each source is a plugin
  with a customizable **pipeline of bricks** — `http_request`, `scrape` (target a
  specific element id/selector), `json_select`, `map`, `filter`, `dedupe`,
  `emit`, plus a **custom-code** brick. Skills can be authored, installed,
  configured, and shared to a catalog. Senator-trades ships built-in.
- **AI recommendations** — `recommend` freezes the exact inputs into an
  immutable snapshot, reasons with Claude (structured output), and stores a
  decision + per-symbol recommendations. Falls back to a transparent heuristic
  when no API key is configured.
- **Full transparency / time travel** — append-only `decisions`, `order_events`,
  `signal_snapshots`, and `portfolio_snapshots` (enforced by DB triggers). The
  History view replays any past decision with its frozen prices + signals.
- **Auth + secrets** — Supabase Auth, RLS on every table, per-user Alpaca keys
  encrypted in Supabase Vault, all privileged calls behind Edge Functions. The
  browser only ever holds the publishable key + the user JWT.

## Stack

- **Frontend:** React 19, Vite 6, TypeScript, Tailwind CSS v4, Framer Motion,
  TanStack Query, React Router, lightweight-charts, cmdk.
- **Backend:** Supabase — Postgres + RLS, Auth, Vault, Edge Functions (Deno),
  Realtime. Project ref: `xhscpwtvvjalfpzfarqw`.
- **Integrations:** Alpaca (market data + execution), Anthropic (reasoning).

## Local development

```bash
npm install
cp .env.example .env        # already pre-filled with the project URL + publishable key
npm run dev                 # http://localhost:5173
npm run typecheck && npm run build && npm run lint
```

### Server-side secrets (Edge Function env)

These are **never** read by the browser. Set them on the Supabase project so the
AI and (optional global) Alpaca paper keys work:

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
# optional global paper fallback (per-user keys via Settings are preferred):
supabase secrets set ALPACA_API_KEY=...  ALPACA_API_SECRET=...
```

Without `ANTHROPIC_API_KEY`, recommendations use the built-in heuristic.
Without Alpaca keys, market data is deterministic synthetic data and trading
works in `sim` mode.

## Layout

```
src/
  features/{auth,dashboard,markets,trading,recommendations,sources,history,settings,account}
  components/{ui,...}        # design system + shell + command palette
  lib/                       # supabase client, types, utils, query client
supabase/
  migrations/                # schema, RLS, audit triggers, vault RPCs, seed
  functions/                 # market-data, broker-execute, ingest-source, recommend, connect-broker
```

## Status (MVP)

Done: schema + RLS + audit, auth, sim/paper broker engine, market data + charts,
the data-source skill system with the senator-trades source, AI recommendations,
manual trade flow, History/time-travel, automation settings + guardrails, and the
2026 design pass.

Next: a background scheduler (pg_cron + pg_net) to run ingestion and auto-mode
execution on a schedule; live-trading enable flow; more built-in source skills
(news, SEC Form 4, social); a visual drag-and-drop pipeline builder; backtesting.
