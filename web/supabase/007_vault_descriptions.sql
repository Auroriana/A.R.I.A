-- Run after 006. Safe to rerun.
alter table public.aria_vaults add column if not exists description text not null default '' check(length(description)<=500);

create or replace function public.aria_set_vault_description(p_vault uuid,p_description text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); d text:=left(btrim(coalesce(p_description,'')),500);
begin
 if u is null or u<>'2b0adefe-04f4-4f39-9332-d0287953096b'::uuid then return jsonb_build_object('ok',false,'reason','denied'); end if;
 update public.aria_vaults set description=d where id=p_vault and owner_id=u;
 if not found then return jsonb_build_object('ok',false,'reason','missing'); end if;
 return jsonb_build_object('ok',true);
end;$$;

-- Map of every vault for the planner/answer: name, description, searchable note count, top folders.
create or replace function public.aria_vault_overview() returns jsonb
language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'name',v.name,'description',v.description,
   'searchableNotes',s.n,'topFolders',s.folders) order by v.created_at),'[]'::jsonb)
 from public.aria_vaults v
 cross join lateral (
  select (select count(*) from public.aria_notes n where n.vault_id=v.id and not n.deleted and n.ai_enabled) as n,
   (select coalesce(jsonb_agg(t.f order by t.f),'[]'::jsonb) from (
     select distinct split_part(n.path,'/',1) as f from public.aria_notes n
     where n.vault_id=v.id and not n.deleted and n.ai_enabled and position('/' in n.path)>0 order by 1 limit 15) t) as folders
 ) s
 where v.owner_id=auth.uid();
$$;

-- Same search, but drops passages scoring under 40% of the best match (less noise, fewer sources).
create or replace function public.aria_search(p_query text,p_embedding extensions.vector(768) default null,p_vault uuid default null)
returns table(id uuid,title text,source_path text,content text,vault_name text)
language sql stable security invoker set search_path='' as $$
 with query as (
   select websearch_to_tsquery('simple',left(p_query,4000)) as exact_query,
   to_tsquery('simple',replace(plainto_tsquery('simple',left(p_query,4000))::text,' & ',' | ')) as broad_query
 ), candidates as (
   select c.id,c.title,c.source_path,c.content,c.vault_id,
   ts_rank(c.fts,q.exact_query)*2+ts_rank(c.fts,q.broad_query)+ts_rank(to_tsvector('simple',c.title),q.broad_query)*2 as keyword_score,
   case when p_embedding is not null and c.embedding is not null and c.embedding_model='gemini-embedding-2'
   then 1-(c.embedding operator(extensions.<=>) p_embedding) else 0 end as semantic_score
   from public.aria_chunks c cross join query q
   where c.owner_id=auth.uid() and c.ai_enabled and (p_vault is null or c.vault_id=p_vault)
 ), scored as (
   select k.id,k.title,k.source_path,k.content,v.name as vault_name,
   (case when k.keyword_score>0 then 1 else 0 end)+k.semantic_score+k.keyword_score as score
   from candidates k join public.aria_vaults v on v.id=k.vault_id
   where k.keyword_score>0 or k.semantic_score>0.5
 ), ranked as (select s.*,max(s.score) over () as top from scored s)
 select r.id,r.title,r.source_path,r.content,r.vault_name from ranked r
 where r.score>=r.top*0.4 order by r.score desc,r.id limit 6;
$$;

revoke all on function public.aria_set_vault_description(uuid,text) from public,anon;
revoke all on function public.aria_vault_overview() from public,anon;
revoke all on function public.aria_search(text,extensions.vector,uuid) from public,anon;
grant execute on function public.aria_set_vault_description(uuid,text) to authenticated;
grant execute on function public.aria_vault_overview() to authenticated;
grant execute on function public.aria_search(text,extensions.vector,uuid) to authenticated;
notify pgrst, 'reload schema';