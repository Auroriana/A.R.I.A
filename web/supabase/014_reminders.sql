-- Apply after 013_chats_welcome.sql. All operations use the authenticated owner.
begin;
create table if not exists public.aria_reminders (
 owner_id uuid not null references auth.users on delete cascade,
 id uuid not null,
 text text not null check(length(text) between 1 and 4000),
 due_at timestamptz not null,
 timezone text not null,
 notification text,
 push_attempt_at timestamptz,
 push_lease uuid,
 push_delivered_at timestamptz,
 completed_at timestamptz,
 created_at timestamptz not null default now(),
 primary key(owner_id,id)
);
alter table public.aria_reminders enable row level security;
revoke all on public.aria_reminders from public,anon,authenticated;
create or replace function public.aria_reminder_save(p_id uuid,p_text text,p_due timestamptz,p_timezone text,p_notification text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=public.aria_quick_owner(); r public.aria_reminders;
begin
 if p_id is null or p_text is null or length(trim(p_text)) not between 1 and 4000 or p_due is null or not exists(select 1 from pg_timezone_names where name=p_timezone) then raise exception 'Invalid reminder'; end if;
 perform pg_advisory_xact_lock(hashtextextended('reminders'||u::text,0));
 select * into r from public.aria_reminders where owner_id=u and id=p_id;
 if found then return jsonb_build_object('ok',r.text=p_text and r.due_at=p_due and r.timezone=p_timezone); end if;
 if p_due<=now() or p_due>now()+interval '366 days' then raise exception 'Choose a future reminder'; end if;
 if (select count(*) from public.aria_reminders where owner_id=u and completed_at is null)>=200 then raise exception 'Complete some reminders before adding more'; end if;
 insert into public.aria_reminders(owner_id,id,text,due_at,timezone,notification) values(u,p_id,p_text,p_due,p_timezone,left(p_notification,180));
 return jsonb_build_object('ok',true);
end;$$;
create or replace function public.aria_reminder_list() returns setof public.aria_reminders
language sql security definer set search_path='' as $$
 select * from public.aria_reminders where owner_id=public.aria_quick_owner() and completed_at is null order by due_at,id limit 200;
$$;
create or replace function public.aria_reminder_complete(p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=public.aria_quick_owner();
begin
 update public.aria_reminders set completed_at=coalesce(completed_at,now()) where owner_id=u and id=p_id;
 return jsonb_build_object('ok',found);
end;$$;
revoke all on function public.aria_reminder_save(uuid,text,timestamptz,text,text),public.aria_reminder_list(),public.aria_reminder_complete(uuid) from public,anon;
grant execute on function public.aria_reminder_save(uuid,text,timestamptz,text,text),public.aria_reminder_list(),public.aria_reminder_complete(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
