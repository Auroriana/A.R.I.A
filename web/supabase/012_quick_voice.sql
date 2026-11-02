-- Run after 008 and 010. Safe to rerun.
-- Quick Note keeps a snapshot of the personality instructions in force when the note was sent,
-- so the background worker can write Aria's understanding in her voice even when the browser is closed.
begin;
alter table public.aria_quick_notes add column if not exists personality text check(personality is null or length(personality)<=16000);
drop function if exists public.aria_quick_enqueue(uuid,text,text);
create or replace function public.aria_quick_enqueue(p_key uuid,p_text text,p_mode text,p_personality text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=public.aria_quick_owner(); q public.aria_quick_notes; v text:=nullif(btrim(coalesce(p_personality,'')),'');
begin
 if p_key is null or p_text is null or length(p_text) not between 1 and 12000 or btrim(p_text)='' or p_mode is null or p_mode not in ('concise','detailed') then raise exception 'Invalid quick note'; end if;
 perform pg_advisory_xact_lock(hashtextextended('quick'||u::text,0));
 select * into q from public.aria_quick_notes where owner_id=u and idempotency_key=p_key;
 if found then
  if q.text<>p_text or q.mode<>p_mode then return jsonb_build_object('ok',false,'reason','key_reused'); end if;
  return jsonb_build_object('ok',true,'id',q.id,'status',q.status);
 end if;
 if (select count(*) from public.aria_quick_notes where owner_id=u and status in ('queued','processing'))>=100 then return jsonb_build_object('ok',false,'reason','full'); end if;
 insert into public.aria_quick_notes(owner_id,idempotency_key,text,mode,personality) values(u,p_key,p_text,p_mode,left(v,16000)) returning * into q;
 return jsonb_build_object('ok',true,'id',q.id,'status',q.status);
end;$$;
revoke all on function public.aria_quick_enqueue(uuid,text,text,text) from public,anon;
grant execute on function public.aria_quick_enqueue(uuid,text,text,text) to authenticated;
notify pgrst, 'reload schema';
commit;
