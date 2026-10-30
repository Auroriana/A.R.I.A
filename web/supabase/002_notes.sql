-- Run once in Supabase SQL Editor, AFTER 001_aria.sql. Not yet executed anywhere.
-- Notes are readable by the owner (RLS) and writable ONLY through the two functions below.
create table public.aria_notes(
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 path text not null check(length(path) between 4 and 300),
 title text not null,
 content text not null check(length(content)<=200000),
 content_hash text not null,
 version integer not null default 1,
 origin text not null check(origin in ('local','web')),
 ai_enabled boolean not null default false,
 deleted boolean not null default false,
 updated_at timestamptz not null default now()
);
create unique index aria_notes_path on public.aria_notes(owner_id,lower(path));
alter table public.aria_notes enable row level security;
create policy owner_read on public.aria_notes for select to authenticated using(owner_id=auth.uid());
revoke all on public.aria_notes from anon,authenticated;
grant select on public.aria_notes to authenticated;

alter table public.aria_chunks add column note_id uuid references public.aria_notes(id) on delete cascade;
create index aria_chunks_note on public.aria_chunks(note_id);

-- Optimistic-concurrency save. p_base_version: 0 = create; otherwise the version the editor/agent last saw.
-- ai_enabled is derived HERE from frontmatter (strict "ai_enabled: true"); anything else fails closed.
-- Chunks are rebuilt in the same transaction; turning AI off removes them immediately.
create function public.aria_save_note(p_path text,p_content text,p_base_version integer,p_origin text,p_chunks jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); h text; t text; fm text; ai boolean; nid uuid; ver integer;
begin
 if u is null or u<>'2b0adefe-04f4-4f39-9332-d0287953096b'::uuid then return jsonb_build_object('ok',false,'reason','denied'); end if;
 if p_origin not in('local','web') or p_content is null or length(p_content)>200000 or p_base_version is null or p_base_version<0
  or p_path is null or length(p_path) not between 4 and 300 or p_path !~* '\.md$' or p_path ~ '^/' or p_path ~ '(^|/)\.'
  or p_path ~ '[:*?"<>|\\]' or p_path ~* '^(98 private|80 templates)/'
 then return jsonb_build_object('ok',false,'reason','invalid'); end if;
 perform pg_advisory_xact_lock(hashtextextended('notes'||u::text,0));
 h:=encode(sha256(convert_to(p_content,'UTF8')),'hex');
 t:=regexp_replace(regexp_replace(p_path,'^.*/',''),'\.md$','','i');
 fm:=substring(p_content from '^---\n([\s\S]*?)\n---(?:\n|$)');
 ai:=coalesce(fm ~ '(^|\n)ai_enabled:[ \t]*true[ \t]*(\n|$)',false) and p_path !~* '^40 questions/';
 select id,version into nid,ver from public.aria_notes where owner_id=u and lower(path)=lower(p_path);
 if not found then
  if p_base_version<>0 then return jsonb_build_object('ok',false,'reason','conflict','version',0); end if;
  insert into public.aria_notes(owner_id,path,title,content,content_hash,origin,ai_enabled) values(u,p_path,t,p_content,h,p_origin,ai) returning id into nid;
  ver:=1;
 else
  if ver<>p_base_version then return jsonb_build_object('ok',false,'reason','conflict','version',ver); end if;
  update public.aria_notes set title=t,content=p_content,content_hash=h,version=version+1,origin=p_origin,ai_enabled=ai,deleted=false,updated_at=now()
   where id=nid returning version into ver;
 end if;
 delete from public.aria_chunks where note_id=nid;
 if ai and jsonb_typeof(p_chunks)='array' then
  insert into public.aria_chunks(owner_id,note_id,title,source_path,content,ai_enabled)
  select u,nid,case when coalesce(e.c->>'heading','')='' then t else t||' › '||(e.c->>'heading') end,p_path,e.c->>'content',true
  from jsonb_array_elements(p_chunks) as e(c) where length(coalesce(e.c->>'content','')) between 1 and 3000 limit 500;
 end if;
 return jsonb_build_object('ok',true,'version',ver,'hash',h,'ai_enabled',ai);
end;$$;

-- Soft delete (used only by the local sync agent when a file is removed in Obsidian).
create function public.aria_delete_note(p_path text,p_base_version integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); nid uuid; ver integer;
begin
 if u is null or u<>'2b0adefe-04f4-4f39-9332-d0287953096b'::uuid then return jsonb_build_object('ok',false,'reason','denied'); end if;
 perform pg_advisory_xact_lock(hashtextextended('notes'||u::text,0));
 select id,version into nid,ver from public.aria_notes where owner_id=u and lower(path)=lower(p_path) and not deleted;
 if not found then return jsonb_build_object('ok',false,'reason','missing'); end if;
 if ver<>p_base_version then return jsonb_build_object('ok',false,'reason','conflict','version',ver); end if;
 update public.aria_notes set deleted=true,content='',content_hash='',ai_enabled=false,version=version+1,origin='local',updated_at=now() where id=nid returning version into ver;
 delete from public.aria_chunks where note_id=nid;
 return jsonb_build_object('ok',true,'version',ver);
end;$$;

revoke all on function public.aria_save_note(text,text,integer,text,jsonb) from public,anon;
revoke all on function public.aria_delete_note(text,integer) from public,anon;
grant execute on function public.aria_save_note(text,text,integer,text,jsonb) to authenticated;
grant execute on function public.aria_delete_note(text,integer) to authenticated;
