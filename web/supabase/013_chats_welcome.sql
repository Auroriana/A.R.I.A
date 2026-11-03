-- Apply after 012. Uses the existing single-owner check from 008.
begin;
create table if not exists public.aria_chats (
 owner_id uuid not null references auth.users on delete cascade,
 id uuid not null,
 version bigint not null default 1,
 updated bigint not null,
 chat jsonb,
 primary key(owner_id,id)
);
create table if not exists public.aria_welcome (
 owner_id uuid primary key references auth.users on delete cascade,
 lines jsonb not null,
 generated_at timestamptz not null default now()
);
alter table public.aria_chats enable row level security;
alter table public.aria_welcome enable row level security;
revoke all on public.aria_chats,public.aria_welcome from public,anon,authenticated;
grant select on public.aria_chats,public.aria_welcome to authenticated;
drop policy if exists owner_read on public.aria_chats;
create policy owner_read on public.aria_chats for select to authenticated using(owner_id=(select auth.uid()));
drop policy if exists owner_read on public.aria_welcome;
create policy owner_read on public.aria_welcome for select to authenticated using(owner_id=(select auth.uid()));

-- A null payload is a durable tombstone, including deletion before first upload.
create or replace function public.aria_chat_save(p_id uuid,p_version bigint,p_chat jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=public.aria_quick_owner(); r public.aria_chats; stamp bigint;
begin
 perform pg_advisory_xact_lock(hashtextextended('chats'||u::text,0));
 select * into r from public.aria_chats where owner_id=u and id=p_id;
 if found and r.chat is null then return jsonb_build_object('deleted',true); end if;
 if p_chat is not null then
   if jsonb_typeof(p_chat) is distinct from 'object' or p_chat->>'id' is distinct from p_id::text
      or jsonb_typeof(p_chat->'messages') is distinct from 'array' or octet_length(p_chat::text)>1200000
      or coalesce(p_chat->>'updated','') !~ '^[0-9]{1,14}$' then raise exception 'Invalid chat'; end if;
   if p_version is distinct from coalesce(r.version,0) then
     return jsonb_build_object('conflict',true,'version',r.version,'chat',r.chat);
   end if;
 end if;
 stamp:=coalesce((p_chat->>'updated')::bigint,r.updated,0);
 insert into public.aria_chats(owner_id,id,version,updated,chat) values(u,p_id,1,stamp,p_chat)
 on conflict(owner_id,id) do update set version=aria_chats.version+1,updated=excluded.updated,chat=excluded.chat
 returning * into r;
 update public.aria_chats set chat=null,version=version+1 where owner_id=u and id in (
   select id from public.aria_chats where owner_id=u and chat is not null order by updated desc,id offset 10
 );
 return jsonb_build_object('version',r.version,'deleted',p_chat is null or exists(
   select 1 from public.aria_chats where owner_id=u and id=p_id and chat is null));
end;$$;
create or replace function public.aria_welcome_save(p_lines jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare u uuid:=public.aria_quick_owner();
begin
 if p_lines is null or jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines) not between 1 and 12 or octet_length(p_lines::text)>8000 then raise exception 'Invalid welcome lines'; end if;
 insert into public.aria_welcome(owner_id,lines) values(u,p_lines)
 on conflict(owner_id) do update set lines=excluded.lines,generated_at=now();
end;$$;
revoke all on function public.aria_chat_save(uuid,bigint,jsonb),public.aria_welcome_save(jsonb) from public,anon;
grant execute on function public.aria_chat_save(uuid,bigint,jsonb),public.aria_welcome_save(jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
