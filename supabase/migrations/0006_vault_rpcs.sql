-- Service-role-only helpers to store/reveal per-user broker API keys in Vault.
-- Edge functions call these with the service role; they are not exposed to
-- anon/authenticated clients.

create or replace function public.vault_create_secret(p_secret text, p_name text)
returns uuid
language plpgsql
security definer
set search_path = public, vault
as $$
declare sid uuid;
begin
  select vault.create_secret(p_secret, p_name) into sid;
  return sid;
end$$;

create or replace function public.vault_reveal_secret(p_id uuid)
returns text
language plpgsql
security definer
set search_path = public, vault
as $$
declare val text;
begin
  select decrypted_secret into val from vault.decrypted_secrets where id = p_id;
  return val;
end$$;

revoke execute on function public.vault_create_secret(text, text) from anon, authenticated, public;
revoke execute on function public.vault_reveal_secret(uuid) from anon, authenticated, public;
grant execute on function public.vault_create_secret(text, text) to service_role;
grant execute on function public.vault_reveal_secret(uuid) to service_role;
