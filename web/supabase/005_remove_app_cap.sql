-- Run after the existing migrations to remove the shared 50-call daily app cap.
-- Keeps owner authorization and the existing per-model quota reservations. Safe to rerun.
create or replace function public.aria_reserve(p_model text,p_tokens integer) returns boolean
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
 insert into public.aria_calls(owner_id,model,tokens) values(u,p_model,p_tokens);
 return true;
end;$$;
revoke all on function public.aria_reserve(text,integer) from public,anon;
grant execute on function public.aria_reserve(text,integer) to authenticated;
