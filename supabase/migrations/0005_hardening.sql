-- Security hardening from advisor lints: pin function search_path, prevent
-- the trigger function from being callable via RPC, relocate pg_net.

alter function public.set_updated_at() set search_path = '';
alter function public.prevent_mutation() set search_path = '';
alter function public.handle_new_user() set search_path = public, pg_temp;

revoke execute on function public.handle_new_user() from anon, authenticated, public;

-- Note: pg_net is a Supabase-managed extension and must remain in `public`
-- (it does not support SET SCHEMA); its advisor warning is benign.
