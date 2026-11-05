-- Apply after 014. Delivery adapters can be extended for Electron/APNs/FCM.
begin;
create table if not exists public.aria_push_subscriptions (
 owner_id uuid not null references auth.users on delete cascade,
 endpoint text not null,
 subscription jsonb not null,
 primary key(owner_id,endpoint)
);
alter table public.aria_push_subscriptions enable row level security;
revoke all on public.aria_push_subscriptions from public,anon,authenticated;
create or replace function public.aria_push_subscribe(p_subscription jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare u uuid:=public.aria_quick_owner(); target_endpoint text:=p_subscription->>'endpoint';
begin
 if target_endpoint is null or length(target_endpoint)>2048 or target_endpoint !~ '^https://(fcm.googleapis.com|updates.push.services.mozilla.com|web.push.apple.com|([a-z0-9-]+\.)?notify.windows.com)/' or octet_length(p_subscription::text)>5000 then raise exception 'Invalid subscription'; end if;
 perform pg_advisory_xact_lock(hashtextextended('push'||u::text,0));
 if (select count(*) from public.aria_push_subscriptions where owner_id=u)>=10 and not exists(select 1 from public.aria_push_subscriptions where owner_id=u and endpoint=target_endpoint) then raise exception 'Device limit reached'; end if;
 insert into public.aria_push_subscriptions values(u,target_endpoint,p_subscription) on conflict(owner_id,endpoint) do update set subscription=excluded.subscription;
end;$$;
create or replace function public.aria_push_list() returns setof public.aria_push_subscriptions
language sql security definer set search_path='' as $$ select * from public.aria_push_subscriptions where owner_id=public.aria_quick_owner(); $$;
create or replace function public.aria_push_remove(p_endpoint text) returns void
language sql security definer set search_path='' as $$ delete from public.aria_push_subscriptions where owner_id=public.aria_quick_owner() and endpoint=p_endpoint; $$;

-- Server creates the conversation even when no application is open. Stable IDs
-- make worker retries and client sync converge on one opening message.
create or replace function public.aria_reminder_conversations() returns void
language plpgsql security definer set search_path='' as $$
declare u uuid:=public.aria_quick_owner(); r public.aria_reminders; stamp bigint; opening text;
begin
 for r in select * from public.aria_reminders where owner_id=u and completed_at is null and due_at<=now() loop
  stamp:=floor(extract(epoch from r.due_at)*1000)::bigint;
  opening:=coalesce(r.notification,'Hey, this is your reminder.')||E'\n\n'||r.text||E'\n\n'||to_char(r.due_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')||' ('||r.timezone||')';
  insert into public.aria_chats(owner_id,id,updated,chat) values(u,r.id,stamp,jsonb_build_object('id',r.id,'title','Reminder · '||left(r.text,50),'updated',stamp,'mode','general','vault','all','messages',jsonb_build_array(jsonb_build_object('id',r.id::text||'/opening','turn',r.id::text||'/opening','started',stamp,'edited',0,'role','model','text',opening)))) on conflict(owner_id,id) do nothing;
 end loop;
end;$$;
create or replace function public.aria_reminder_claim() returns setof public.aria_reminders
language plpgsql security definer set search_path='' as $$
declare u uuid:=public.aria_quick_owner();
begin
 perform public.aria_reminder_conversations();
 return query update public.aria_reminders set push_attempt_at=now(),push_lease=gen_random_uuid() where (owner_id,id) in (
  select owner_id,id from public.aria_reminders where owner_id=u and completed_at is null and due_at<=now() and push_delivered_at is null and (push_attempt_at is null or push_attempt_at<now()-interval '5 minutes') order by due_at limit 10 for update skip locked
 ) returning *;
end;$$;
create or replace function public.aria_reminder_delivery(p_id uuid,p_lease uuid,p_delivered boolean) returns void
language sql security definer set search_path='' as $$ update public.aria_reminders set push_delivered_at=case when p_delivered then now() else null end where owner_id=public.aria_quick_owner() and id=p_id and push_lease=p_lease and completed_at is null; $$;
revoke all on function public.aria_push_subscribe(jsonb),public.aria_push_list(),public.aria_push_remove(text),public.aria_reminder_conversations(),public.aria_reminder_claim(),public.aria_reminder_delivery(uuid,uuid,boolean) from public,anon;
grant execute on function public.aria_push_subscribe(jsonb),public.aria_push_list(),public.aria_push_remove(text),public.aria_reminder_conversations(),public.aria_reminder_claim(),public.aria_reminder_delivery(uuid,uuid,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
