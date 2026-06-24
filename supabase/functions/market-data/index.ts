// Returns quotes for symbols and (optionally) candles for one symbol.
// Falls back to deterministic synthetic data when no Alpaca keys are set.
import { handleOptions, json } from "../_shared/cors.ts";
import { requireUser } from "../_shared/auth.ts";
import { getQuotes, getCandles } from "../_shared/quotes.ts";

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  try {
    await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const symbols: string[] = body.symbols ?? [];
    const candleSymbol: string | undefined = body.candleSymbol;
    const days: number = body.days ?? 90;

    const quotes = await getQuotes(symbols);
    const candles = candleSymbol ? await getCandles(candleSymbol, days) : undefined;

    return json({ quotes, candles });
  } catch (e) {
    if (e instanceof Response) return e;
    return json({ error: (e as Error).message }, 500);
  }
});
