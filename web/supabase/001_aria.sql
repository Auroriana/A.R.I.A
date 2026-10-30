-- Run once in Supabase SQL Editor. Owner-bound pilot schema.
create extension if not exists vector with schema extensions;
create table public.aria_chunks (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 title text not null, source_path text not null, content text not null check(length(content)<=3000),
 ai_enabled boolean not null default false,
 embedding extensions.vector(768),
 embedding_model text check(embedding_model is null or embedding_model='gemini-embedding-2'),
 fts tsvector generated always as (to_tsvector('simple',title || ' ' || content)) stored,
 created_at timestamptz not null default now()
);
create index aria_chunks_fts on public.aria_chunks using gin(fts);
alter table public.aria_chunks enable row level security;
create policy owner_read on public.aria_chunks for select to authenticated using(owner_id=auth.uid() and ai_enabled);
revoke all on public.aria_chunks from anon,authenticated;
grant select on public.aria_chunks to authenticated;
create table public.aria_calls(id bigint generated always as identity primary key,owner_id uuid not null,model text not null,tokens integer not null,created_at timestamptz not null default now());
alter table public.aria_calls enable row level security;
revoke all on public.aria_calls from anon,authenticated;
-- Reservations are retained after upstream failure: fail closed, no accidental retry spending.
create function public.aria_reserve(p_model text,p_tokens integer) returns boolean
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); rpm integer; rpd integer; tpm integer; n integer; total integer;
begin
 if u is null or u<>'2b0adefe-04f4-4f39-9332-d0287953096b'::uuid then return false; end if;
 if p_model in ('gemini-3.5-flash-lite','gemini-3.1-flash-lite') then rpm:=15;rpd:=500;tpm:=250000;
 elsif p_model in ('gemini-3.8-flash','gemini-3.6-flash','gemini-3-flash','gemini-2.5-flash') then rpm:=5;rpd:=20;tpm:=250000;
 elsif p_model='gemini-embedding-2' then rpm:=100;rpd:=1000;tpm:=30000;
 else return false; end if;
 if p_tokens is null or p_tokens<1 or p_tokens>tpm then return false; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 select count(*),coalesce(sum(tokens),0) into n,total from public.aria_calls where owner_id=u and model=p_model and created_at>now()-interval '60 seconds';
 if n>=rpm or total+p_tokens>tpm then return false;end if;
 select count(*) into n from public.aria_calls where owner_id=u and model=p_model and created_at>now()-interval '24 hours';
 if n>=rpd then return false;end if;
 if p_model<>'gemini-embedding-2' then
 select count(*) into n from public.aria_calls where owner_id=u and model<>'gemini-embedding-2' and created_at>now()-interval '24 hours';
 if n>=50 then return false;end if;end if;
 insert into public.aria_calls(owner_id,model,tokens) values(u,p_model,p_tokens);
 return true;
end;$$;
revoke all on function public.aria_reserve(text,integer) from public,anon;
grant execute on function public.aria_reserve(text,integer) to authenticated;
create function public.aria_search(p_query text,p_embedding extensions.vector(768) default null)
returns table(id uuid,title text,source_path text,content text)
language sql stable security invoker set search_path='' as $$
 with candidates as (
 select c.*,ts_rank(c.fts,websearch_to_tsquery('simple',left(p_query,4000))) as keyword_score,
 case when p_embedding is not null and c.embedding is not null and c.embedding_model='gemini-embedding-2'
 then 1-(c.embedding operator(extensions.<=>) p_embedding) else 0 end as semantic_score
 from public.aria_chunks c where c.owner_id=auth.uid() and c.ai_enabled
 ) select id,title,source_path,content from candidates
 where keyword_score>0 or semantic_score>0.5
 order by (case when keyword_score>0 then 1 else 0 end)+semantic_score+keyword_score desc limit 4;
$$;
revoke all on function public.aria_search(text,extensions.vector) from public,anon;
grant execute on function public.aria_search(text,extensions.vector) to authenticated;
