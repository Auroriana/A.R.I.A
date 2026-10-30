-- Run after 001_aria.sql. Safe to rerun. Preserve ownership and approval checks.
-- Natural-language questions should not require EVERY word to occur in a note.
create or replace function public.aria_search(p_query text,p_embedding extensions.vector(768) default null)
returns table(id uuid,title text,source_path text,content text)
language sql stable security invoker set search_path='' as $$
 with query as (
   select websearch_to_tsquery('simple',left(p_query,4000)) as exact_query,
   to_tsquery('simple',replace(plainto_tsquery('simple',left(p_query,4000))::text,' & ',' | ')) as broad_query
 ), candidates as (
   select c.*,ts_rank(c.fts,q.exact_query)*2+ts_rank(c.fts,q.broad_query)
     +ts_rank(to_tsvector('simple',c.title),q.broad_query)*2 as keyword_score,
   case when p_embedding is not null and c.embedding is not null and c.embedding_model='gemini-embedding-2'
   then 1-(c.embedding operator(extensions.<=>) p_embedding) else 0 end as semantic_score
   from public.aria_chunks c cross join query q
   where c.owner_id=auth.uid() and c.ai_enabled
 ) select id,title,source_path,content from candidates
 where keyword_score>0 or semantic_score>0.5
 order by (case when keyword_score>0 then 1 else 0 end)+semantic_score+keyword_score desc,id limit 4;
$$;
revoke all on function public.aria_search(text,extensions.vector) from public,anon;
grant execute on function public.aria_search(text,extensions.vector) to authenticated;
