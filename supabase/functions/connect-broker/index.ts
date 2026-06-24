// Stores a user's Alpaca API key/secret in Vault and records references on
// broker_accounts. Raw secrets never touch any client-readable table.
import { handleOptions, json } from "../_shared/cors.ts";
import { requireUser, adminClient } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  try {
    const user = await requireUser(req);
    const db = adminClient();
    const { mode, api_key, api_secret, label } = await req.json();

    if (mode !== "paper" && mode !== "live") {
      return json({ error: "mode must be 'paper' or 'live'" }, 400);
    }
    if (!api_key || !api_secret) {
      return json({ error: "api_key and api_secret are required" }, 400);
    }

    const { data: keyId, error: e1 } = await db.rpc("vault_create_secret", {
      p_secret: api_key,
      p_name: `alpaca_${mode}_key_${user.id}_${Date.now()}`,
    });
    if (e1) return json({ error: e1.message }, 500);

    const { data: secretId, error: e2 } = await db.rpc("vault_create_secret", {
      p_secret: api_secret,
      p_name: `alpaca_${mode}_secret_${user.id}_${Date.now()}`,
    });
    if (e2) return json({ error: e2.message }, 500);

    const { error: upErr } = await db.from("broker_accounts").upsert(
      {
        user_id: user.id,
        broker: "alpaca",
        mode,
        label: label ?? `Alpaca ${mode}`,
        key_secret_id: keyId,
        secret_secret_id: secretId,
        is_active: true,
      },
      { onConflict: "user_id,broker,mode" },
    );
    if (upErr) return json({ error: upErr.message }, 500);

    return json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    return json({ error: (e as Error).message }, 500);
  }
});
