-- Run after 007. Safe to rerun. Owner matches the existing Aria migrations.
begin;
alter table public.aria_vaults add column if not exists allow_auto_file boolean not null default false;
alter table public.aria_vaults add column if not exists is_unsorted boolean not null default false;
create unique index if not exists aria_one_unsorted on public.aria_vaults(owner_id) where is_unsorted;
-- Never turn an existing personal vault into the fallback, even if named Unsorted.
do $$
declare u uuid:='2b0adefe-04f4-4f39-9332-d0287953096b'; n text:='Unsorted'; i integer:=1;
begin
 if not exists(select 1 from public.aria_vaults where owner_id=u and is_unsorted) then
  while exists(select 1 from public.aria_vaults where owner_id=u and lower(btrim(name))=lower(n)) loop
   i:=i+1; n:='Unsorted ('||i||')';
  end loop;
  insert into public.aria_vaults(owner_id,name,is_unsorted,description) values(u,n,true,'Quick notes awaiting review.');
 end if;
end;$$;

create table if not exists public.aria_quick_notes(
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 idempotency_key uuid not null,
 text text not null check(length(text) between 1 and 12000),
 mode text not null check(mode in ('concise','detailed')),
 status text not null default 'queued' check(status in ('queued','processing','filed','failed')),
 attempts integer not null default 0,
 next_attempt_at timestamptz not null default now(), locked_at timestamptz, lease_token uuid,
 vault_id uuid references public.aria_vaults(id) on delete set null,
 note_id uuid references public.aria_notes(id) on delete set null,
 path text, title text, confidence double precision, error text,
 created_at timestamptz not null default now(), filed_at timestamptz, dismissed_at timestamptz,
 unique(owner_id,idempotency_key)
);
create index if not exists aria_quick_due on public.aria_quick_notes(owner_id,status,next_attempt_at);
alter table public.aria_quick_notes enable row level security;
drop policy if exists owner_read on public.aria_quick_notes;
create policy owner_read on public.aria_quick_notes for select to authenticated using(owner_id=auth.uid());
revoke all on public.aria_quick_notes from public,anon,authenticated;
grant select on public.aria_quick_notes to authenticated;

create or replace function public.aria_quick_owner() returns uuid
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or auth.uid()<>'2b0adefe-04f4-4f39-9332-d0287953096b'::uuid then raise exception 'Access denied' using errcode='42501'; end if;
 return auth.uid();
end;$$;

create or replace function public.aria_quick_enqueue(p_key uuid,p_text text,p_mode text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=public.aria_quick_owner(); q public.aria_quick_notes;
begin
 if p_key is null or p_text is null or length(p_text) not between 1 and 12000 or btrim(p_text)='' or p_mode is null or p_mode not in ('concise','detailed') then raise exception 'Invalid quick note'; end if;
 perform pg_advisory_xact_lock(hashtextextended('quick'||u::text,0));
 select * into q from public.aria_quick_notes where owner_id=u and idempotency_key=p_key;
 if found then
  if q.text<>p_text or q.mode<>p_mode then return jsonb_build_object('ok',false,'reason','key_reused'); end if;
  return jsonb_build_object('ok',true,'id',q.id,'status',q.status);
 end if;
 if (select count(*) from public.aria_quick_notes where owner_id=u and status in ('queued','processing'))>=100 then return jsonb_build_object('ok',false,'reason','full'); end if;
 insert into public.aria_quick_notes(owner_id,idempotency_key,text,mode) values(u,p_key,p_text,p_mode) returning * into q;
 return jsonb_build_object('ok',true,'id',q.id,'status',q.status);
end;$$;

create or replace function public.aria_quick_claim() returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=public.aria_quick_owner(); q public.aria_quick_notes;
begin
 perform pg_advisory_xact_lock(hashtextextended('quick'||u::text,0));
 -- Revoke expired leases before claiming. A late worker cannot finish or fail them.
 update public.aria_quick_notes set status=case when attempts>=5 then 'failed' else 'queued' end,
  lease_token=null,locked_at=null,error='Worker interrupted. The note is safe to retry.'
 where owner_id=u and status='processing' and locked_at<now()-interval '5 minutes';
 -- One model call at a time per owner, including overlapping HTTP workers.
 if exists(select 1 from public.aria_quick_notes where owner_id=u and status='processing') then return null; end if;
 select * into q from public.aria_quick_notes where owner_id=u and status='queued' and dismissed_at is null and next_attempt_at<=now()
 order by created_at,id for update skip locked limit 1;
 if not found then return null; end if;
 update public.aria_quick_notes set status='processing',attempts=attempts+1,locked_at=now(),lease_token=gen_random_uuid()
 where id=q.id returning * into q;
 return to_jsonb(q);
end;$$;

create or replace function public.aria_folder_map() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare u uuid:=public.aria_quick_owner(); result jsonb;
begin
 select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'name',v.name,'description',v.description,
  'allow_auto_file',v.allow_auto_file,'is_unsorted',v.is_unsorted,'folders',f.paths) order by v.created_at),'[]'::jsonb) into result
 from public.aria_vaults v cross join lateral (
  select coalesce(jsonb_agg(x.folder order by x.folder),'[]'::jsonb) paths from (
   select distinct array_to_string((string_to_array(n.path,'/'))[1:d.depth],'/') folder
   from public.aria_notes n cross join lateral generate_series(1,least(3,cardinality(string_to_array(n.path,'/'))-1)) d(depth)
   where n.vault_id=v.id and n.owner_id=u and not n.deleted
    and n.path !~* '(^|/)(98 private|80 templates|90 attachments|99 archive)(/|$)'
   order by 1 limit 80
  ) x
 ) f where v.owner_id=u and (v.allow_auto_file or v.is_unsorted);
 return result;
end;$$;

create or replace function public.aria_quick_finish(p_id uuid,p_lease uuid,p_vault uuid,p_path text,p_content text,p_confidence double precision) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=public.aria_quick_owner(); q public.aria_quick_notes; r jsonb; nid uuid;
begin
 select * into q from public.aria_quick_notes where id=p_id and owner_id=u for update;
 if not found or q.status<>'processing' or q.lease_token is distinct from p_lease or q.locked_at<now()-interval '5 minutes' then return jsonb_build_object('ok',false,'reason','stale'); end if;
 -- Recheck opt-in at commit, in case it changed during generation.
 perform 1 from public.aria_vaults where id=p_vault and owner_id=u and (allow_auto_file or is_unsorted) for share;
 if not found then return jsonb_build_object('ok',false,'reason','invalid_vault'); end if;
 if p_content is null or p_content not like ('---'||chr(10)||'ai_enabled: false'||chr(10)||'source: quick-note'||chr(10)||'quick_note_id: '||p_id||chr(10)||'%')
  or p_path is null or cardinality(string_to_array(p_path,'/'))>4
  or exists(select 1 from unnest(string_to_array(p_path,'/')) s where length(s)>60 or s ~* '^(98 private|80 templates|90 attachments|99 archive)$')
  or p_confidence is null or not (p_confidence between 0 and 1)
 then return jsonb_build_object('ok',false,'reason','invalid'); end if;
 r:=public.aria_save_note(p_vault,p_path,p_content,0,'web','[]'::jsonb);
 if not (r->>'ok')::boolean then return r; end if;
 select id into nid from public.aria_notes where vault_id=p_vault and lower(path)=lower(p_path);
 update public.aria_quick_notes set status='filed',vault_id=p_vault,path=p_path,title=regexp_replace(regexp_replace(p_path,'^.*/',''),'\.md$','','i'),
  note_id=nid,confidence=p_confidence,filed_at=now(),locked_at=null,lease_token=null,error=null where id=p_id;
 return jsonb_build_object('ok',true);
end;$$;

create or replace function public.aria_quick_fail(p_id uuid,p_lease uuid,p_error text,p_retry_after integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=public.aria_quick_owner();
begin
 update public.aria_quick_notes set status=case when attempts>=5 then 'failed' else 'queued' end,
 error=left(p_error,500),next_attempt_at=now()+make_interval(secs=>greatest(60,least(86400,coalesce(p_retry_after,60)))),locked_at=null,lease_token=null
 where id=p_id and owner_id=u and status='processing' and lease_token=p_lease and locked_at>=now()-interval '5 minutes';
 return jsonb_build_object('ok',found);
end;$$;

create or replace function public.aria_quick_retry(p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=public.aria_quick_owner();
begin
 update public.aria_quick_notes set status='queued',attempts=0,next_attempt_at=now(),error=null
 where id=p_id and owner_id=u and status='failed' and dismissed_at is null;
 return jsonb_build_object('ok',found);
end;$$;

create or replace function public.aria_quick_delete(p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=public.aria_quick_owner();
begin
 -- Keep the idempotency tombstone: a delayed outbox must not resurrect a deleted job.
 update public.aria_quick_notes set status='failed',dismissed_at=now(),error='Removed by owner.'
 where id=p_id and owner_id=u and status in ('queued','failed') and dismissed_at is null;
 return jsonb_build_object('ok',found);
end;$$;

create or replace function public.aria_quick_list(p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare u uuid:=public.aria_quick_owner(); result jsonb;
begin
 select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc,t.id),'[]'::jsonb) into result from (
 select q.id,q.text,q.mode,q.status,q.attempts,q.error,q.created_at,q.filed_at,q.next_attempt_at,q.confidence,
  coalesce(n.vault_id,q.vault_id) vault_id,coalesce(n.path,q.path) path,coalesce(n.title,q.title) title,v.name vault_name,
  n.version,coalesce(n.ai_enabled,false) ai_enabled,(q.status='filed' and (n.id is null or n.deleted)) note_deleted
 from public.aria_quick_notes q
 left join lateral (
  select a.* from public.aria_notes a where a.owner_id=u and (a.id=q.note_id or (
   not a.deleted and substring(a.content from '^---\n([\s\S]*?)\n---(?:\n|$)') ~ ('(^|\n)quick_note_id: '||q.id||'(\n|$)')))
  order by a.deleted asc,(a.id=q.note_id) desc,a.updated_at desc limit 1
 ) n on true
 left join public.aria_vaults v on v.id=coalesce(n.vault_id,q.vault_id)
 where q.owner_id=u and q.dismissed_at is null order by q.created_at desc,q.id limit 50 offset greatest(0,least(100000,coalesce(p_offset,0)))
 ) t;
 return result;
end;$$;

create or replace function public.aria_set_vault_quick(p_vault uuid,p_allow boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=public.aria_quick_owner();
begin
 update public.aria_vaults set allow_auto_file=coalesce(p_allow,false) where owner_id=u and id=p_vault;
 return jsonb_build_object('ok',found);
end;$$;

-- PostgreSQL grants EXECUTE to PUBLIC by default; restrict every new RPC explicitly.
do $$ declare f regprocedure;
begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('aria_quick_owner','aria_quick_enqueue','aria_quick_claim','aria_quick_finish','aria_quick_fail','aria_quick_retry','aria_quick_delete','aria_quick_list','aria_folder_map','aria_set_vault_quick') loop
  execute format('revoke all on function %s from public,anon',f);
  execute format('grant execute on function %s to authenticated',f);
 end loop;
end;$$;
notify pgrst, 'reload schema';
commit;
