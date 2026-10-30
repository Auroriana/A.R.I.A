# Aria chat — Vercel starter

Dependency-free static frontend and Node.js API. All browser requests stay on your website origin. Server-side Supabase password login uses an HttpOnly, SameSite cookie; sessions expire after at most one hour and require sign-in again. Owner UUID is checked on every protected request. No API key reaches the browser.

## Set up Supabase

1. In SQL Editor, run `supabase/001_aria.sql` once. It creates owner-scoped, read-only approved passages plus persistent quota reservations and search functions. The supplied owner UUID is embedded in the quota function. This migration has not been run remotely.
2. In Authentication → Users, use the owner account with UUID `2b0adefe-04f4-4f39-9332-d0287953096b`. Confirm the user email in the dashboard if needed. Disable public signups under Authentication settings. Never use service-role credentials in the browser.
3. Optional: add a short, non-sensitive passage through Table Editor → aria_chunks. Set owner_id to your UUID, title and source_path to its original note title/path, content to its exact text (maximum 3,000 characters), ai_enabled to true. Leave embeddings empty for keyword search. This is manual seeding, not automated vault sync.

## Run locally

Copy `.env.example` to `.env.local`. Enter a NEW Gemini API key after rotating the one shared in chat. Confirm in AI Studio that the selected key's project is Free, then set GEMINI_FREE_TIER_CONFIRMED=true. This switch is an operator assertion, not a billing API check. Linking billing to that project later can cause charges; the app cannot enforce Google's billing tier.

From this folder: `npm run dev`. Open http://127.0.0.1:3000. No install/build step is needed. Run `npm test` for mocked provider and authentication tests.

## Deploy to Vercel

Push the app code to your chosen GitHub repository (the parent .gitignore excludes vault/ and secrets). Import that repository into Vercel. Set Root Directory to `web`, Framework Preset to Other, Output Directory to `public`, and leave Build/Install commands empty. Use Node 22 or 24. Add the variables from `.env.example` to Vercel Settings → Environment Variables. The real project URL is the origin, without `/rest/v1/`.

Set GEMINI_API_KEY only in server environment variables; no PUBLIC/NEXT_PUBLIC prefix. SUPABASE_PUBLISHABLE_KEY is the public key supplied by you, not a service-role key. Redeploy after changing environment variables.

Test the deployed URL from your restricted network: sign in, ask a general question, then query a seeded note in Search my notes mode. Browser calls only the Vercel origin. The server must be able to reach Supabase and Google's API. Authentication/session and provider responses are never cached.

## Model routing and zero-budget policy

| Model | Purpose | Supplied RPM / RPD |
|---|---|---|
| Gemini 3.5 Flash Lite | Default everyday chat and synthesis | 15 / 500 |
| Gemini 3.1 Flash Lite | Manual alternative | 15 / 500 |
| Gemini 3.8 Flash | Complex synthesis selected manually | 5 / 20 |
| Gemini 3.6 Flash | Comparison | 5 / 20 |
| Gemini 3 Flash | Comparison / compatibility | 5 / 20 |
| Gemini 2.5 Flash | Earlier-model baseline | 5 / 20 |
| Gemini Embedding 2 | Optional semantic retrieval, 768 dimensions | 100 / 1,000; 30,000 TPM |
| DeepSeek | Disabled; no funded budget | No requests |

Model IDs are configurable in lib/models.js AND the SQL quota function. IDs/access can differ from dashboard display labels; an unavailable ID produces a clear error without falling back. Verify actual availability with your account before use. No automatic retries, no hidden model calls for planning, no paid fallback. App cap: 50 generation attempts per rolling 24 hours across models. Provider daily limits may reset differently; the app uses conservative rolling windows and counts failed attempts. Usage elsewhere in your Google project is not visible to this app. Tokens are conservatively reserved using UTF-8 request bytes plus the output limit, rather than estimating words. Records contain counts, not prompts; retain recent records and prune old ones periodically through SQL administration.

## Search and future sync

Keyword search works with seeded approved chunks. Optional semantic search uses Gemini Embedding 2 for query embeddings when ENABLE_SEMANTIC_SEARCH=true; document chunks must first have embeddings from the same model, 768 dimensions, and embedding_model='gemini-embedding-2'. Do not enable this merely to search an empty database. A bulk importer/embedding job is not part of this starter.

Source excerpts are returned with citations and safely rendered as text. Citation IDs are checked for existence; their factual support still needs human review. This simple retrieval baseline uses lexical rank plus cosine similarity, not the planned graph traversal/reranker. Vault mode omits chat history to avoid reusing stale evidence; phrase follow-up questions explicitly. General chat includes bounded history and never claims vault access. Chats stay in browser memory and disappear on refresh or sign-out.

The selected starter vault remains at ../vault/Aria Knowledge relative to the web folder. The personal vault at D:\Archive\Lumina Records\Lumina Records is not read or changed. Later cloud-to-local writing needs an opt-in local agent: download pending note drafts, validate paths, preview differences, resolve conflicts, and write into an Inbox. The cloud cannot directly write to your local drive.

## Verification limits

Automated tests mock provider responses. Real Gemini calls, Supabase SQL execution/RLS isolation, Vercel deployment, and restricted-network access require configured accounts and must be checked before using private notes. Free Gemini content-use terms apply; start with non-sensitive samples.
