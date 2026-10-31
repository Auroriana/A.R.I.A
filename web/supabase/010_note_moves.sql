-- Run after 008. Safe to rerun. Update/restart the local sync agent with this release.
begin;
alter table public.aria_notes add column if not exists moved_to uuid references public.aria_notes(id) on delete set null;

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
  insert into public.aria_chunks(owner_id,vault_id,note_id,title,source_path,content,ai_enabled)
  select u,p_vault,nid,case when coalesce(e.c->>'heading','')='' then t else t||' › '||(e.c->>'heading') end,p_path,e.c->>'content',true
  from jsonb_array_elements(p_chunks) as e(c) where length(coalesce(e.c->>'content','')) between 1 and 3000 limit 500;
 end if;
 return jsonb_build_object('ok',true,'version',ver,'hash',h,'ai_enabled',ai);
end;$$;


create or replace function public.aria_move_note(p_vault uuid,p_path text,p_base_version integer,p_to_vault uuid,p_to_path text,p_chunks jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=public.aria_quick_owner(); n public.aria_notes; r jsonb;
begin
 if p_to_path is null or length(p_to_path) not between 4 and 300 or p_to_path !~* '\.md$' or p_to_path ~ '^/'
  or p_to_path ~ '(^|/)\.' or p_to_path ~ '[:*?"<>|\\[:cntrl:]]' or p_to_path ~* '^(98 private|80 templates)/'
  or exists(select 1 from unnest(string_to_array(p_to_path,'/')) s where s='' or s ~ '[ .]$' or s ~* '^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)')
 then return jsonb_build_object('ok',false,'reason','invalid'); end if;
 if not exists(select 1 from public.aria_vaults where id=p_to_vault and owner_id=u) then return jsonb_build_object('ok',false,'reason','invalid_vault'); end if;
 perform pg_advisory_xact_lock(hashtextextended('notes'||u::text,0));
 select * into n from public.aria_notes where owner_id=u and vault_id=p_vault and lower(path)=lower(p_path) and not deleted for update;
 if not found then return jsonb_build_object('ok',false,'reason','missing'); end if;
 if p_base_version is null or n.version<>p_base_version then return jsonb_build_object('ok',false,'reason','conflict'); end if;
 if p_to_vault=n.vault_id and lower(p_to_path)=lower(n.path) then return jsonb_build_object('ok',true,'version',n.version,'path',n.path,'vault',n.vault_id); end if;
 if exists(select 1 from public.aria_notes where vault_id=p_to_vault and lower(path)=lower(p_to_path) and id<>n.id and (not deleted or moved_to is distinct from n.id)) then return jsonb_build_object('ok',false,'reason','exists'); end if;
 delete from public.aria_notes where vault_id=p_to_vault and lower(path)=lower(p_to_path) and deleted and moved_to=n.id;
 -- Keep the real note ID (including Quick history references). Reindex at the destination.
 update public.aria_notes set vault_id=p_to_vault,path=p_to_path where id=n.id;
 r:=public.aria_save_note(p_to_vault,p_to_path,n.content,n.version,'web',p_chunks);
 if not (r->>'ok')::boolean then raise exception 'Move save failed'; end if;
 -- A case-only rename shares the same case-insensitive path key: no second row needed.
 if p_to_vault<>n.vault_id or lower(p_to_path)<>lower(n.path) then
  insert into public.aria_notes(owner_id,vault_id,path,title,content,content_hash,version,origin,ai_enabled,deleted,moved_to)
  values(u,n.vault_id,n.path,n.title,'',n.content_hash,n.version+1,'web',false,true,n.id);
 end if;
 return jsonb_build_object('ok',true,'version',(r->>'version')::integer,'path',p_to_path,'vault',p_to_vault);
end;$$;
revoke all on function public.aria_move_note(uuid,text,integer,uuid,text,jsonb) from public,anon;
grant execute on function public.aria_move_note(uuid,text,integer,uuid,text,jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
