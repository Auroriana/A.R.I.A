-- Run after deploying the worker. Add these in Supabase Vault first:
-- aria_reminder_worker_url = https://YOUR-HOST/api/reminder-worker
-- aria_reminder_worker_secret = server REMINDER_WORKER_SECRET (32+ random characters)
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create or replace function public.aria_reminder_tick() returns void
language plpgsql security definer set search_path='' as $$
declare target text; secret text;
begin
 if not exists(select 1 from public.aria_reminders where completed_at is null and due_at<=now() and push_delivered_at is null and (push_attempt_at is null or push_attempt_at<now()-interval '5 minutes')) then return; end if;
 select decrypted_secret into target from vault.decrypted_secrets where name='aria_reminder_worker_url';
 select decrypted_secret into secret from vault.decrypted_secrets where name='aria_reminder_worker_secret';
 if target is null or target !~ '^https://' or length(coalesce(secret,''))<32 then raise exception 'Configure reminder worker URL and secret in Supabase Vault'; end if;
 perform net.http_post(url:=target,headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||secret),body:='{}'::jsonb,timeout_milliseconds:=120000);
end;$$;
revoke all on function public.aria_reminder_tick() from public,anon,authenticated;
do $$ declare j record;
begin
 for j in select jobid from cron.job where jobname='aria-reminders' loop perform cron.unschedule(j.jobid); end loop;
 perform cron.schedule('aria-reminders','* * * * *','select public.aria_reminder_tick()');
end;$$;
