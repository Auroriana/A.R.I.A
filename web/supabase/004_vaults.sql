-- Run AFTER 001_aria.sql, 002_notes.sql, 002_search_questions.sql and 003_starter_note.sql. Safe to rerun.
-- Adds vaults: every note and search passage belongs to one vault, and search can target one vault or all.
-- Existing notes and the starter passage move into a vault called "Aria Knowledge".
do $$ begin
 if to_regclass('public.aria_notes') is null then raise exception 'Run 002_notes.sql before 004_vaults.sql'; end if;
end $$;

create table if not exists public.aria_vaults(
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 name text not null check(length(btrim(name)) between 1 and 80),
 created_at timestamptz not null default now()
);
create unique index if not exists aria_vaults_name on public.aria_vaults(owner_id,lower(btrim(name)));
alter table public.aria_vaults enable row level security;
drop policy if exists owner_read on public.aria_vaults;
create policy owner_read on public.aria_vaults for select to authenticated using(owner_id=auth.uid());
revoke all on public.aria_vaults from anon,authenticated;
grant select on public.aria_vaults to authenticated;

insert into public.aria_vaults(id,owner_id,name)
values('a81a0000-0000-4000-8000-0000000000f1','2b0adefe-04f4-4f39-9332-d0287953096b','Aria Knowledge')
on conflict (id) do nothing;

-- Existing rows are backfilled into the default vault by the column default.
alter table public.aria_notes add column if not exists vault_id uuid not null
 default 'a81a0000-0000-4000-8000-0000000000f1' references public.aria_vaults(id) on delete cascade;
alter table public.aria_notes alter column vault_id drop default;
-- aria_chunks keeps the default so 003_starter_note.sql (which names no vault) still lands in the starter vault.
alter table public.aria_chunks add column if not exists vault_id uuid not null
 default 'a81a0000-0000-4000-8000-0000000000f1' references public.aria_vaults(id) on delete cascade;
create index if not exists aria_chunks_vault on public.aria_chunks(vault_id);

-- Paths are now unique per vault, not per owner.
drop index if exists public.aria_notes_path;
create unique index if not exists aria_notes_vault_path on public.aria_notes(vault_id,lower(path));

-- Old signatures are removed so nothing can write or search without naming a vault.
drop function if exists public.aria_save_note(text,text,integer,text,jsonb);
drop function if exists public.aria_delete_note(text,integer);
drop function if exists public.aria_search(text,extensions.vector);

create or replace function public.aria_create_vault(p_name text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); n text:=btrim(coalesce(p_name,'')); vid uuid;
begin
 if u is null or u<>'2b0adefe-04f4-4f39-9332-d0287953096b'::uuid then return jsonb_build_object('ok',false,'reason','denied'); end if;
 if length(n) not between 1 and 80 or n ~ '[[:cntrl:]]' then return jsonb_build_object('ok',false,'reason','invalid'); end if;
 perform pg_advisory_xact_lock(hashtextextended('vaults'||u::text,0));
 if exists(select 1 from public.aria_vaults where owner_id=u and lower(btrim(name))=lower(n)) then return jsonb_build_object('ok',false,'reason','exists'); end if;
 if (select count(*) from public.aria_vaults where owner_id=u)>=20 then return jsonb_build_object('ok',false,'reason','limit'); end if;
 insert into public.aria_vaults(owner_id,name) values(u,n) returning id into vid;
 return jsonb_build_object('ok',true,'id',vid,'name',n);
end;$$;

create or replace function public.aria_save_note(p_vault uuid,p_path text,p_content text,p_base_version integer,p_origin text,p_chunks jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); h text; t text; fm text; ai boolean; nid uuid; ver integer;
begin
 if u is null or u<>'2b0adefe-04f4-4f39-9332-d0287953096b'::uuid then return jsonb_build_object('ok',false,'reason','denied'); end if;
 if p_vault is null or not exists(select 1 from public.aria_vaults where id=p_vault and owner_id=u) then return jsonb_build_object('ok',false,'reason','invalid_vault'); end if;
 if p_origin not in('local','web') or p_content is null or length(p_content)>200000 or p_base_version is null or p_base_version<0
  or p_path is null or length(p_path) not between 4 and 300 or p_path !~* '\.md$' or p_path ~ '^/' or p_path ~ '(^|/)\.'
  or p_path ~ '[:*?"<>|\\]' or p_path ~* '^(98 private|80 templates)/'
 then return jsonb_build_object('ok',false,'reason','invalid'); end if;
 perform pg_advisory_xact_lock(hashtextextended('notes'||u::text,0));
 h:=encode(sha256(convert_to(p_content,'UTF8')),'hex');
 t:=regexp_replace(regexp_replace(p_path,'^.*/',''),'\.md$','','i');
 fm:=substring(p_content from '^---\n([\s\S]*?)\n---(?:\n|$)');
 ai:=coalesce(fm ~ '(^|\n)ai_enabled:[ \t]*true[ \t]*(\n|$)',false) and p_path !~* '^40 questions/';
 select id,version into nid,ver from public.aria_notes where vault_id=p_vault and lower(path)=lower(p_path);
 if not found then
  if p_base_version<>0 then return jsonb_build_object('ok',false,'reason','conflict','version',0); end if;
  insert into public.aria_notes(owner_id,vault_id,path,title,content,content_hash,origin,ai_enabled) values(u,p_vault,p_path,t,p_content,h,p_origin,ai) returning id into nid;
  ver:=1;
 else
  if ver<>p_base_version then return jsonb_build_object('ok',false,'reason','conflict','version',ver); end if;
  update public.aria_notes set title=t,content=p_content,content_hash=h,version=version+1,origin=p_origin,ai_enabled=ai,deleted=false,updated_at=now()
   where id=nid returning version into ver;
 end if;
 delete from public.aria_chunks where note_id=nid;
 if ai and jsonb_typeof(p_chunks)='array' then
  insert into public.aria_chunks(owner_id,vault_id,note_id,title,source_path,content,ai_enabled)
  select u,p_vault,nid,case when coalesce(e.c->>'heading','')='' then t else t||' › '||(e.c->>'heading') end,p_path,e.c->>'content',true
  from jsonb_array_elements(p_chunks) as e(c) where length(coalesce(e.c->>'content','')) between 1 and 3000 limit 500;
 end if;
 return jsonb_build_object('ok',true,'version',ver,'hash',h,'ai_enabled',ai);
end;$$;

create or replace function public.aria_delete_note(p_vault uuid,p_path text,p_base_version integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); nid uuid; ver integer;
begin
 if u is null or u<>'2b0adefe-04f4-4f39-9332-d0287953096b'::uuid then return jsonb_build_object('ok',false,'reason','denied'); end if;
 perform pg_advisory_xact_lock(hashtextextended('notes'||u::text,0));
 select id,version into nid,ver from public.aria_notes where owner_id=u and vault_id=p_vault and lower(path)=lower(p_path) and not deleted;
 if not found then return jsonb_build_object('ok',false,'reason','missing'); end if;
 if ver<>p_base_version then return jsonb_build_object('ok',false,'reason','conflict','version',ver); end if;
 update public.aria_notes set deleted=true,content='',content_hash='',ai_enabled=false,version=version+1,origin='local',updated_at=now() where id=nid returning version into ver;
 delete from public.aria_chunks where note_id=nid;
 return jsonb_build_object('ok',true,'version',ver);
end;$$;

-- p_vault null = search every vault.
create or replace function public.aria_search(p_query text,p_embedding extensions.vector(768) default null,p_vault uuid default null)
returns table(id uuid,title text,source_path text,content text,vault_name text)
language sql stable security invoker set search_path='' as $$
 with query as (
   select websearch_to_tsquery('simple',left(p_query,4000)) as exact_query,
   to_tsquery('simple',replace(plainto_tsquery('simple',left(p_query,4000))::text,' & ',' | ')) as broad_query
 ), candidates as (
   select c.id,c.title,c.source_path,c.content,c.vault_id,
   ts_rank(c.fts,q.exact_query)*2+ts_rank(c.fts,q.broad_query)
     +ts_rank(to_tsvector('simple',c.title),q.broad_query)*2 as keyword_score,
   case when p_embedding is not null and c.embedding is not null and c.embedding_model='gemini-embedding-2'
   then 1-(c.embedding operator(extensions.<=>) p_embedding) else 0 end as semantic_score
   from public.aria_chunks c cross join query q
   where c.owner_id=auth.uid() and c.ai_enabled and (p_vault is null or c.vault_id=p_vault)
 ) select k.id,k.title,k.source_path,k.content,v.name
 from candidates k join public.aria_vaults v on v.id=k.vault_id
 where k.keyword_score>0 or k.semantic_score>0.5
 order by (case when k.keyword_score>0 then 1 else 0 end)+k.semantic_score+k.keyword_score desc,k.id limit 4;
$$;

revoke all on function public.aria_create_vault(text) from public,anon;
revoke all on function public.aria_save_note(uuid,text,text,integer,text,jsonb) from public,anon;
revoke all on function public.aria_delete_note(uuid,text,integer) from public,anon;
revoke all on function public.aria_search(text,extensions.vector,uuid) from public,anon;
grant execute on function public.aria_create_vault(text) to authenticated;
grant execute on function public.aria_save_note(uuid,text,text,integer,text,jsonb) to authenticated;
grant execute on function public.aria_delete_note(uuid,text,integer) to authenticated;
grant execute on function public.aria_search(text,extensions.vector,uuid) to authenticated;
notify pgrst, 'reload schema';
