-- Apply after 016. Append-only conversation storage; keep all retained legacy chats.
begin;
create table if not exists public.aria_messages (
 owner_id uuid not null references auth.users on delete cascade,
 id text not null check(length(id) between 1 and 100),
 seq bigint generated always as identity,
 message jsonb not null,
 primary key(owner_id,id),
 unique(seq),
 check(jsonb_typeof(message)='object' and message->>'role' in ('user','model') and message->>'id'=id)
);
create index if not exists aria_messages_page on public.aria_messages(owner_id,seq desc);
alter table public.aria_messages enable row level security;
revoke all on public.aria_messages from public,anon,authenticated;
grant select on public.aria_messages to authenticated;
drop policy if exists owner_read on public.aria_messages;
create policy owner_read on public.aria_messages for select to authenticated using(owner_id=(select auth.uid()));

create or replace function public.aria_message_save(p_messages jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=public.aria_quick_owner(); m jsonb; result jsonb;
begin
 if jsonb_typeof(p_messages) is distinct from 'array' or jsonb_array_length(p_messages) not between 1 and 40 or octet_length(p_messages::text)>1050000 then raise exception 'Invalid message batch';end if;
 for m in select value from jsonb_array_elements(p_messages) loop
  if jsonb_typeof(m) is distinct from 'object' or coalesce(length(m->>'id'),0) not between 1 and 100 or coalesce(length(m->>'turn'),0) not between 1 and 100 or coalesce(m->>'role','') not in ('user','model') or jsonb_typeof(m->'text') is distinct from 'string' or length(m->>'text')>100000 or coalesce(m->>'started','') !~ '^[0-9]{1,15}$' or coalesce(m->>'edited','') !~ '^[0-9]{1,15}$' then raise exception 'Invalid message';end if;
  if m->>'id' like 'note:%' then raise exception 'Reserved event identifier';end if;
  insert into public.aria_messages(owner_id,id,message) values(u,m->>'id',m)
  on conflict(owner_id,id) do update set message=excluded.message,seq=default
  where (excluded.message->>'edited')::bigint>(aria_messages.message->>'edited')::bigint;
 end loop;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'seq',seq)),'[]'::jsonb) into result from public.aria_messages where owner_id=u and id in(select value->>'id' from jsonb_array_elements(p_messages));return result;
end;$$;
create or replace function public.aria_message_page(p_before bigint default null,p_after bigint default null,p_limit integer default 40)
returns table(seq bigint,message jsonb) language plpgsql security definer set search_path='' as $$
declare u uuid:=public.aria_quick_owner();
begin
 if p_limit not between 1 and 40 or (p_before is not null and p_after is not null) then raise exception 'Invalid page';end if;
 if p_after is not null then return query select m.seq,m.message from public.aria_messages m where m.owner_id=u and m.seq>p_after order by m.seq limit p_limit;
 else return query select m.seq,m.message from public.aria_messages m where m.owner_id=u and (p_before is null or m.seq<p_before) order by m.seq desc limit p_limit;end if;
end;$$;

-- Preserve source IDs, so importing a browser copy converges with the server copy.
insert into public.aria_messages(owner_id,id,message)
select c.owner_id,coalesce(m->>'id',c.id::text||'/'||(ordinality-1)),m||jsonb_build_object(
 'id',coalesce(m->>'id',c.id::text||'/'||(ordinality-1)),
 'turn',coalesce(m->>'turn',m->>'id',c.id::text||'/'||(ordinality-1)),
 'started',case when coalesce((m->>'started')::bigint,0)<946684800000 then c.updated+ordinality else (m->>'started')::bigint end,
 'edited',coalesce((m->>'edited')::bigint,0))
from public.aria_chats c cross join lateral jsonb_array_elements(c.chat->'messages') with ordinality as parts(m,ordinality)
where c.chat is not null order by c.updated,ordinality on conflict(owner_id,id) do nothing;

-- Older clients may still write whole chats. Mirror before their ten-chat retention runs.
create or replace function public.aria_chat_to_stream() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.chat is not null then
  insert into public.aria_messages(owner_id,id,message)
  select new.owner_id,m->>'id',m from jsonb_array_elements(new.chat->'messages') m where m->>'id' is not null
  on conflict(owner_id,id) do update set message=excluded.message where coalesce((excluded.message->>'edited')::bigint,0)>coalesce((aria_messages.message->>'edited')::bigint,0);
 end if;return new;
end;$$;
drop trigger if exists aria_chat_stream on public.aria_chats;
create trigger aria_chat_stream after insert or update of chat on public.aria_chats for each row execute function public.aria_chat_to_stream();

create or replace function public.aria_reminder_conversations() returns void
language plpgsql security definer set search_path='' as $$
declare u uuid:=public.aria_quick_owner();
begin
 insert into public.aria_messages(owner_id,id,message)
 select u,r.id::text||'/opening',jsonb_build_object('id',r.id::text||'/opening','turn',r.id::text||'/opening','role','model','started',floor(extract(epoch from r.due_at)*1000)::bigint,'edited',0,'text',coalesce(r.notification,'Hey, it’s time.')||E'\n\n'||r.text,'event','reminder.due','reminder',r.id)
 from public.aria_reminders r where r.owner_id=u and r.completed_at is null and r.due_at<=now()
 on conflict(owner_id,id) do nothing;
end;$$;
create index if not exists aria_reminders_due on public.aria_reminders(owner_id,due_at) where completed_at is null;
create or replace function public.aria_reminder_overview_rows(p_timezone text default 'UTC') returns setof public.aria_reminders
language sql security definer set search_path='' as $$
 select * from public.aria_reminders where owner_id=public.aria_quick_owner() and (completed_at is null or (due_at at time zone p_timezone)::date=(now() at time zone p_timezone)::date) order by due_at,id;
$$;

-- A completed note becomes a message in the same transaction as filing, even with the app closed.
create or replace function public.aria_quick_message() returns trigger
language plpgsql security definer set search_path='' as $$
declare stamp bigint:=floor(extract(epoch from now())*1000)::bigint; mid text:='note:'||new.id;
begin
 if new.status='filed' and old.status is distinct from 'filed' then
  insert into public.aria_messages(owner_id,id,message) values(new.owner_id,mid,jsonb_build_object('id',mid,'turn',mid,'role','model','started',stamp,'edited',stamp,'text','Also, finished that note: '||coalesce(new.title,new.path),'event','note.filed','note',jsonb_build_object('id',new.id,'vault',new.vault_id,'path',new.path,'title',new.title))) on conflict(owner_id,id) do nothing;
 end if;return new;
end;$$;
drop trigger if exists aria_quick_stream on public.aria_quick_notes;
create trigger aria_quick_stream after update of status on public.aria_quick_notes for each row execute function public.aria_quick_message();
create or replace function public.aria_quick_status(p_id uuid) returns jsonb
language sql security definer set search_path='' as $$
 select jsonb_build_object('id',q.id,'status',q.status,'error',q.error,'title',q.title,'path',coalesce(n.path,q.path),'vault',coalesce(n.vault_id,q.vault_id),'content',left(n.content,18000))
 from public.aria_quick_notes q left join public.aria_notes n on n.id=q.note_id and n.owner_id=q.owner_id and not n.deleted
 where q.owner_id=public.aria_quick_owner() and q.id=p_id;
$$;

-- Receipts are per target, not just per job. Retrying one device does not notify all others again.
create table if not exists public.aria_notification_receipts (
 owner_id uuid not null references auth.users on delete cascade,
 reminder_id uuid not null,
 target text not null,
 delivered_at timestamptz not null default now(),
 primary key(owner_id,reminder_id,target),
 foreign key(owner_id,reminder_id) references public.aria_reminders(owner_id,id) on delete cascade
);
alter table public.aria_notification_receipts enable row level security;
revoke all on public.aria_notification_receipts from public,anon,authenticated;
create or replace function public.aria_notification_targets(p_id uuid) returns jsonb
language sql security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('subscription',s.subscription)),'[]'::jsonb) from public.aria_push_subscriptions s
 where s.owner_id=public.aria_quick_owner() and not exists(select 1 from public.aria_notification_receipts r where r.owner_id=s.owner_id and r.reminder_id=p_id and r.target=s.endpoint);
$$;
create or replace function public.aria_notification_ack(p_id uuid,p_lease uuid,p_target text) returns void
language plpgsql security definer set search_path='' as $$
declare u uuid:=public.aria_quick_owner();
begin
 if length(p_target)>2048 or not exists(select 1 from public.aria_reminders where owner_id=u and id=p_id and push_lease=p_lease and completed_at is null) then return;end if;
 insert into public.aria_notification_receipts(owner_id,reminder_id,target) values(u,p_id,p_target) on conflict do nothing;
end;$$;

revoke all on function public.aria_chat_to_stream(),public.aria_quick_message() from public,anon,authenticated;
create or replace function public.aria_reminder_release(p_id uuid,p_lease uuid) returns void
language sql security definer set search_path='' as $$
 update public.aria_reminders set push_attempt_at=null,push_lease=null
 where owner_id=public.aria_quick_owner() and id=p_id and push_lease=p_lease and push_delivered_at is null;
$$;
revoke all on function public.aria_reminder_release(uuid,uuid) from public,anon;
grant execute on function public.aria_reminder_release(uuid,uuid) to authenticated;
revoke all on function public.aria_message_save(jsonb),public.aria_message_page(bigint,bigint,integer),public.aria_reminder_overview_rows(text),public.aria_quick_status(uuid),public.aria_notification_targets(uuid),public.aria_notification_ack(uuid,uuid,text) from public,anon;
grant execute on function public.aria_message_save(jsonb),public.aria_message_page(bigint,bigint,integer),public.aria_reminder_overview_rows(text),public.aria_quick_status(uuid),public.aria_notification_targets(uuid),public.aria_notification_ack(uuid,uuid,text) to authenticated;
notify pgrst,'reload schema';
commit;
