-- Run after 010. Safe to rerun.
-- 1) chunks remember their order inside a note (seq)
-- 2) aria_save_note stores seq
-- 3) aria_expand_sections returns the rest of the section(s) a search hit belongs to
-- After running this, click the reindex button (⟲) under the notes explorer once per vault.
begin;
alter table public.aria_chunks add column if not exists seq integer;
create index if not exists aria_chunks_note_seq on public.aria_chunks(note_id,seq);

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
 -- Older sync clients must not resurrect a path left behind by a move.
 if exists(select 1 from public.aria_notes where vault_id=p_vault and lower(path)=lower(p_path) and deleted and moved_to is not null) then return jsonb_build_object('ok',false,'reason','moved'); end if;
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
  insert into public.aria_chunks(owner_id,vault_id,note_id,title,source_path,content,ai_enabled,seq)
  select u,p_vault,nid,case when coalesce(e.c->>'heading','')='' then t else t||' › '||(e.c->>'heading') end,p_path,e.c->>'content',true,e.n::integer
  from jsonb_array_elements(p_chunks) with ordinality as e(c,n) where length(coalesce(e.c->>'content','')) between 1 and 3000 order by e.n limit 500;
 end if;
 return jsonb_build_object('ok',true,'version',ver,'hash',h,'ai_enabled',ai);
end;$$;

-- Given hit chunk ids, return the other chunks of the same section (same heading path, including
-- sub-headings) in reading order. A hit in a note's preface expands only the preface.
create or replace function public.aria_expand_sections(p_ids uuid[],p_max integer default 8)
returns table(id uuid,title text,source_path text,content text,vault_name text)
language sql stable security invoker set search_path='' as $$
 select c.id,c.title,c.source_path,c.content,v.name
 from public.aria_chunks h
 join public.aria_chunks c on c.note_id=h.note_id
 join public.aria_vaults v on v.id=c.vault_id
 where h.id=any(p_ids) and h.owner_id=auth.uid() and h.ai_enabled and h.note_id is not null
   and c.owner_id=auth.uid() and c.ai_enabled
   and (c.title=h.title or (position(' › ' in h.title)>0 and starts_with(c.title,h.title||' › ')))
   and not (c.id=any(p_ids))
 group by c.id,c.title,c.source_path,c.content,v.name,c.note_id,c.seq
 order by c.note_id,c.seq nulls last,c.id
 limit greatest(1,least(coalesce(p_max,8),40));
$$;
revoke all on function public.aria_expand_sections(uuid[],integer) from public,anon;
grant execute on function public.aria_expand_sections(uuid[],integer) to authenticated;
notify pgrst, 'reload schema';
commit;
