// Runs a data-source skill's pipeline for one installation and upserts the
// resulting normalized signals. Custom-code bricks only run for built-in
// skills or skills authored by the installing user (share-safety).
import { handleOptions, json } from "../_shared/cors.ts";
import { requireUser, adminClient } from "../_shared/auth.ts";
import { runPipeline, type Pipeline } from "../_shared/pipeline.ts";

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  try {
    const user = await requireUser(req);
    const { installation_id } = await req.json();
    if (!installation_id) return json({ error: "installation_id required" }, 400);

    const db = adminClient();

    const { data: inst, error: instErr } = await db
      .from("data_source_installations")
      .select("*")
      .eq("id", installation_id)
      .eq("user_id", user.id)
      .single();
    if (instErr || !inst) return json({ error: "Installation not found" }, 404);

    const { data: skill, error: skillErr } = await db
      .from("data_source_skills")
      .select("*")
      .eq("id", inst.skill_id)
      .single();
    if (skillErr || !skill) return json({ error: "Skill not found" }, 404);

    // merge defaults from config_schema with the user's saved config
    const config: Record<string, unknown> = {};
    for (const field of (skill.config_schema as Array<Record<string, unknown>>) ?? []) {
      if (field.default !== undefined) config[String(field.key)] = field.default;
    }
    Object.assign(config, (inst.config as Record<string, unknown>) ?? {});

    const allowCustomCode = skill.is_builtin || skill.author_id === user.id;

    let result;
    try {
      result = await runPipeline(skill.pipeline as Pipeline, config, {
        signalKind: skill.signal_kind,
        allowCustomCode,
      });
    } catch (runErr) {
      await db
        .from("data_source_installations")
        .update({
          last_run_at: new Date().toISOString(),
          last_status: "error",
          last_error: (runErr as Error).message,
        })
        .eq("id", inst.id);
      return json({ error: (runErr as Error).message }, 422);
    }

    const rows = result.signals
      // Keep any non-empty signal: a ticker, a numeric value, or a typed event
      // (e.g. a House PTR filing, which carries no symbol until its PDF is parsed).
      .filter((s) => s.symbol || s.numeric_value != null || s.event_type)
      .map((s) => ({
        user_id: user.id,
        installation_id: inst.id,
        skill_id: skill.id,
        skill_slug: skill.slug,
        signal_kind: s.signal_kind,
        symbol: s.symbol,
        event_type: s.event_type,
        observed_at: s.observed_at,
        numeric_value: s.numeric_value,
        confidence: s.confidence,
        payload: s.payload,
        dedupe_key: s.dedupe_key,
      }));

    let inserted = 0;
    if (rows.length) {
      const { error: upErr, count } = await db
        .from("signals")
        .upsert(rows, { onConflict: "installation_id,dedupe_key", ignoreDuplicates: true, count: "exact" });
      if (upErr) {
        await db
          .from("data_source_installations")
          .update({ last_run_at: new Date().toISOString(), last_status: "error", last_error: upErr.message })
          .eq("id", inst.id);
        return json({ error: upErr.message }, 500);
      }
      inserted = count ?? rows.length;
    }

    await db
      .from("data_source_installations")
      .update({
        last_run_at: new Date().toISOString(),
        last_status: "ok",
        last_error: null,
      })
      .eq("id", inst.id);

    return json({ ok: true, produced: result.signals.length, inserted, log: result.log });
  } catch (e) {
    if (e instanceof Response) return e;
    return json({ error: (e as Error).message }, 500);
  }
});
