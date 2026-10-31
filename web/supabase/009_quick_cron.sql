-- Run after 008, once the worker endpoint and Vercel environment are deployed.
-- First create two secrets in Supabase Vault (Dashboard, never commit their values):
-- aria_quick_worker_url = https://YOUR-PRODUCTION-HOST/api/quick-worker
-- aria_quick_worker_secret = the same random 32+ character QUICK_WORKER_SECRET in Vercel
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create or replace function public.aria_quick_tick() returns void
language plpgsql security definer set search_path='' as $$
declare target text; secret text;
begin
 if not exists(select 1 from public.aria_quick_notes where dismissed_at is null and
  ((status='queued' and next_attempt_at<=now()) or (status='processing' and locked_at<now()-interval '5 minutes'))) then return; end if;
 select decrypted_secret into target from vault.decrypted_secrets where name='aria_quick_worker_url';
 select decrypted_secret into secret from vault.decrypted_secrets where name='aria_quick_worker_secret';
 if target is null or target !~ '^https://' or length(coalesce(secret,''))<32 then raise exception 'Configure the Quick Note worker URL and secret in Supabase Vault'; end if;
 perform net.http_post(url:=target,headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||secret),body:='{}'::jsonb,timeout_milliseconds:=120000);
end;$$;
revoke all on function public.aria_quick_tick() from public,anon,authenticated;
do $$ declare j record;
begin
 for j in select jobid from cron.job where jobname='aria-quick-notes' loop perform cron.unschedule(j.jobid); end loop;
 perform cron.schedule('aria-quick-notes','* * * * *','select public.aria_quick_tick()');
end;$$;
