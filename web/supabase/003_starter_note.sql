-- Run in Supabase SQL Editor after 001_aria.sql and 002_search_questions.sql.
-- Imports ONLY the non-sensitive Aria starter overview. No personal notes.
-- This explicit import makes its content available to your selected AI in vault mode.
insert into public.aria_chunks(id,owner_id,title,source_path,content,ai_enabled)
values ('a81a0000-0000-4000-8000-000000000001','2b0adefe-04f4-4f39-9332-d0287953096b',
'Aria Starter Vault','20 Topics/Aria Starter Vault.md','# Aria Starter Vault

## What is included in this starter vault?

The Aria starter vault is a folder of Markdown notes for Obsidian. Its contents include a Start Here guide, a Home index, a Questions to Test worksheet, four note templates, and the folders below. It does not contain a large research library yet.

| Folder | Purpose |
| --- | --- |
| 00 Inbox | Unprocessed captures and imports |
| 10 Sources | Original evidence and source summaries |
| 20 Topics | Concepts, people, places, and entities |
| 30 Synthesis | Connections and conclusions across notes |
| 40 Questions | Research questions and the Questions to Test worksheet |
| 50 Maps | Navigation pages, including Home |
| 80 Templates | Topic Template, Source Template, Synthesis Template, and Question Template |
| 90 Attachments | PDFs and images |
| 98 Private | Local-only material excluded from the planned cloud sync |
| 99 Archive | Inactive material |

## How to start

Open this folder as a vault in Obsidian. Enable the core Templates plugin and set its template folder to 80 Templates. The starter does not install community plugins. Add real sources and topic notes, then link related notes with Obsidian wikilinks.

## What the assistant can see

General chat does not search notes. Search my notes retrieves approved passages already imported into Supabase. The website cannot directly read a local drive. Automatic vault synchronization and cloud-to-local writing are not implemented yet.

This overview is explicitly approved as a non-sensitive starter document for the assistant. Other notes are not approved by this document. Templates default to ai_enabled: false. PDF and image extraction are not part of the current Markdown pilot.

## Related notes

[[Start Here]] and [[50 Maps/Home|Home]].',true)
on conflict (id) do update set title=excluded.title,source_path=excluded.source_path,
content=excluded.content,ai_enabled=excluded.ai_enabled,embedding=null,embedding_model=null
where aria_chunks.owner_id=excluded.owner_id;

select title,source_path,ai_enabled from public.aria_chunks
where id='a81a0000-0000-4000-8000-000000000001'
and owner_id='2b0adefe-04f4-4f39-9332-d0287953096b';
