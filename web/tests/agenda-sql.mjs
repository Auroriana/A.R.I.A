import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const db=new PGlite(),owner=crypto.randomUUID(),other=crypto.randomUUID(),id=crypto.randomUUID();
const scalar=async(sql,args=[])=>(await db.query(sql,args)).rows[0]?.v;
try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);insert into auth.users values('${owner}'),('${other}');create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function aria_quick_owner() returns uuid language plpgsql as $$begin if auth.uid() is distinct from '${owner}'::uuid then raise exception 'Access denied';end if;return auth.uid();end;$$;select set_config('request.jwt.claim.sub','${owner}',false);`);
 for(const path of ['013_chats_welcome.sql','014_reminders.sql','015_reminder_push.sql']){const sql=await readFile(new URL('../supabase/'+path,import.meta.url),'utf8');await db.exec(sql);await db.exec(sql);}
 await db.exec('set role authenticated');await assert.rejects(db.exec('select * from aria_reminders'),/permission denied/);
 const due=new Date(Date.now()+600000).toISOString();
 assert.equal((await scalar('select aria_reminder_save($1,$2,$3,$4,$5) v',[id,'tea',due,'Asia/Shanghai','Kettle time.'])).ok,true);
 assert.equal((await scalar('select aria_reminder_save($1,$2,$3,$4,$5) v',[id,'tea',due,'Asia/Shanghai','Other text'])).ok,true);
 assert.equal((await scalar('select aria_reminder_save($1,$2,$3,$4,$5) v',[id,'changed',due,'Asia/Shanghai',null])).ok,false);
 const sub={endpoint:'https://fcm.googleapis.com/fcm/send/fixture',keys:{auth:'a'.repeat(22),p256dh:'a'.repeat(87)}};
 await db.query('select aria_push_subscribe($1)',[JSON.stringify(sub)]);await db.query('select aria_push_subscribe($1)',[JSON.stringify(sub)]);assert.equal((await db.query('select * from aria_push_list()')).rows.length,1);
 await db.exec(`select set_config('request.jwt.claim.sub','${other}',false)`);await assert.rejects(db.query('select * from aria_reminder_list()'),/Access denied/);await assert.rejects(db.query('select * from aria_push_list()'),/Access denied/);
 await db.exec(`select set_config('request.jwt.claim.sub','${owner}',false);reset role;update aria_reminders set due_at=now()-interval '1 minute';set role authenticated;`);
 const claimed=(await db.query('select * from aria_reminder_claim()')).rows;assert.equal(claimed.length,1);assert.equal((await db.query('select * from aria_reminder_claim()')).rows.length,0);
 const chat=await scalar('select chat v from aria_chats where id=$1',[id]);assert.match(chat.messages[0].text,/Kettle time/);assert.equal(chat.id,id);
 await db.query('select aria_reminder_delivery($1,$2,true)',[id,crypto.randomUUID()]);await db.exec('reset role');assert.equal(await scalar('select push_delivered_at v from aria_reminders where id=$1',[id]),null);await db.exec('set role authenticated');await db.query('select aria_reminder_delivery($1,$2,true)',[id,claimed[0].push_lease]);assert.equal((await db.query('select * from aria_reminder_claim()')).rows.length,0);
 assert.equal((await scalar('select aria_reminder_complete($1) v',[id])).ok,true);assert.equal((await db.query('select * from aria_reminder_list()')).rows.length,0);
 console.log('PASS: migration repeatability, owner isolation, idempotency, subscription upsert, due conversation, claim exclusion, delivery and completion.');
}finally{await db.close();}
