// Generates an inspectable SQL import locally. Does not contact Supabase or AI.
import {readFile,writeFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const note=await readFile(new URL('vault/Aria Knowledge/20 Topics/Aria Starter Vault.md',root),'utf8');
if(!note.startsWith('---\n')&&!note.startsWith('---\r\n'))throw new Error('Expected note frontmatter.');
const frontmatter=note.split(/^---\s*$/m)[1];
if(!/^ai_enabled: true\s*$/m.test(frontmatter))throw new Error('Starter note must explicitly opt in.');
const content=note.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/,'').trim();
if([...content].length>3000)throw new Error('Starter passage exceeds database limit.');
const literal=value=>"'"+value.replaceAll("'","''")+"'";
const sql=`-- Run in Supabase SQL Editor after 001_aria.sql and 002_search_questions.sql.
-- Imports ONLY the non-sensitive Aria starter overview. No personal notes.
-- This explicit import makes its content available to your selected AI in vault mode.
insert into public.aria_chunks(id,owner_id,title,source_path,content,ai_enabled)
values ('a81a0000-0000-4000-8000-000000000001','2b0adefe-04f4-4f39-9332-d0287953096b',
'Aria Starter Vault','20 Topics/Aria Starter Vault.md',${literal(content)},true)
on conflict (id) do update set title=excluded.title,source_path=excluded.source_path,
content=excluded.content,ai_enabled=excluded.ai_enabled,embedding=null,embedding_model=null
where aria_chunks.owner_id=excluded.owner_id;

select title,source_path,ai_enabled from public.aria_chunks
where id='a81a0000-0000-4000-8000-000000000001'
and owner_id='2b0adefe-04f4-4f39-9332-d0287953096b';
`;
await writeFile(new URL('web/supabase/003_starter_note.sql',root),sql);
console.log('Prepared 003_starter_note.sql: one approved starter note, no upload performed.');
