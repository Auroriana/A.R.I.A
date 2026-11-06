# Capri

**Call me Capri.**

A personal knowledge and research assistant that turns Markdown notes into searchable, cited answers—with a workspace for reading, editing, organizing, and capturing information.

Capri uses **Retrieval-Augmented Generation (RAG)** to find relevant passages from your knowledge base before answering. Your notes remain the reference material; Gemini helps locate, connect, and explain them. Instead of placing the entire collection into every prompt, Capri builds a focused evidence context for each question.

Built for a personal Obsidian workflow, with a browser interface backed by Supabase and a Node.js API configured for Vercel.

> **Project status:** Actively developed for personal use. Features below are present in the repository; some require database migrations, environment configuration, or local sync pairing before they work in a deployment. Repository tests use fixtures and mocked services and do not establish live deployment readiness.

## What you can do

- Ask questions about approved notes and inspect the source passages behind an answer.
- Research questions that require several searches, procedures, or documents.
- Search one vault or let Capri work across available vaults.
- Read and edit Markdown in a folder-based workspace with links and tabs.
- Capture rough information through Quick Note and have an organized copy filed for review.
- Pair cloud vaults with local Obsidian folders through the supplied sync agent.
- Attach screenshots or PDFs to a conversation for Gemini to read.

## Features

### Questions answered from your notes

Capri chats normally and infers when a request needs evidence from your approved knowledge base. There is no manual Search Notes switch.

Vault answers include source references and formatted excerpts. Capri checks that cited source IDs exist in the evidence actually supplied to the final model. This prevents nonexistent source references; it does not independently prove that every cited claim is correct.

The answer prompts ask Capri to distinguish source evidence, facts supplied by the user, and its own suggestions. They also ask it to flag conflicting notes, missing information, and relevant discrepancies in a case.

### Adaptive research

Capri can change its research depth to match the question:

1. A small-model router classifies the request as a vault overview, direct lookup, or more involved case.
2. It chooses search terms and relevant vaults using vault descriptions and folder information.
3. Direct lookups with retrieved evidence can proceed to an answer without the full research loop.
4. More involved questions enter repeated searches and gap checks before final synthesis.

The research planner can request up to four searches per round. It filters repeated queries, deduplicates passages, and preserves stable citation IDs. There is no fixed total research-round cap; model quotas and execution constraints still apply. The final evidence context holds up to 180,000 characters of complete passages, favoring recently retrieved evidence.

Search activity is visible in the interface, including queries, matching notes, and preparation stages. Provider-supplied Gemini thought summaries appear separately when available; these are not raw internal reasoning.

### Efficient model routing

Routing and research planning use `gemini-3.5-flash-lite`; final answers use the model selected in the interface. This lets smaller models handle search coordination while retaining a separate choice for synthesis.

The repository provides six configurable Gemini chat choices. Their IDs and quota settings are defined in [`web/lib/models.js`](web/lib/models.js). Availability depends on the connected Google API project.

Keyword retrieval works without embeddings. Optional semantic retrieval uses Gemini Embedding 2 with 768-dimensional vectors; document and query embeddings must use the same compatible model. The repository does not yet provide a complete bulk document-embedding pipeline.

### Pause and resume research

Research advances through checkpointed operations so longer investigations can span multiple HTTP requests. Pause stops the current step; Resume continues from the last completed checkpoint. Reloading restores a Resume control.

Checkpoints are encrypted, bound to the owner and request, and expire after seven days. Rotating the Gemini API key invalidates existing checkpoints. Closing the browser stops chat research; it does not become a background task. Resuming a step whose response was lost may consume model quota again.

### Markdown workspace

- Folder explorer with search, collapsible folders, resizing, and a mobile overlay.
- Multiple note tabs, breadcrumbs, and Read, Edit, and Source views.
- Source editing beside a rendered preview, with keyboard shortcuts for saving and switching views.
- Draft preservation across refresh in the same browser tab and version checks when saving.
- Wikilinks, aliases, relative Markdown links, heading targets, and block references.
- Incoming and outgoing note references, plus suggestions when typing `[[`.
- Note moves within or between vaults, including drag-and-drop within the current vault.

The renderer supports headings, nested lists, task lists, tables, code, quotations, and validated color formatting. It builds safe DOM elements instead of executing arbitrary HTML.

Moving a note preserves its ID and updates its search chunks. Existing path-based links are not automatically rewritten, so review them after a move.

### Imports that preserve the original text

Paste Import keeps the original body unchanged. Large imports split at existing line breaks into numbered notes. Saved content is read back and compared with the submitted text.

Optional AI formatting adds validated positional layout hints rather than asking the model to rewrite the body. These hints live in `aria_format` frontmatter. Obsidian preserves that metadata, but interpreting Capri-specific layouts there would require a plugin.

Inputs that cannot be stored unchanged are rejected instead of silently modified.

### Quick Note capture

Ask Capri to note something directly in chat. She preserves the exact original and files a note containing it alongside an organized version, while the conversation can continue.

- Only explicitly opted-in vaults receive automatic placements.
- Uncertain or invalid placements go to **Unsorted** for review.
- Newly filed notes start with AI search disabled.
- The chat badge opens the filed note or its pending status and retry control. The Notes workspace provides editing, search settings, and moving.
- A browser outbox preserves unsent captures across reloads in the same browser.
- A durable server queue handles acknowledged submissions, with duplicate protection and controlled retries.

Filing while the browser is closed requires the optional background worker and cron configuration. Quick Note sends the submitted capture to Gemini for processing even when the resulting note's AI-search flag is off.

### Obsidian synchronization

A local agent connects explicitly paired folders with cloud vaults. It supports three-way change detection, version checks, and conflict copies rather than silently overwriting concurrent edits. A Windows installer can run it at sign-in.

Obsidian does not need to be open, but the computer and agent must be running for synchronization. The cloud copy remains available independently of the local computer.

Attachments, Obsidian settings, hidden entries, and designated private/template folders are excluded. Deletion behavior is conservative; this is not a destructive mirror or a replacement for backups.

See [Obsidian sync setup](docs/OBSIDIAN-SYNC.md) before pairing a vault.

### Conversations and attachments

Chat is one continuous, account-scoped message stream. The newest messages load first; scrolling up loads older pages. Individual messages sync through Supabase, with an IndexedDB outbox for pending writes. Capri infers when to search notes, and both ordinary conversation and research receive bounded model context. Previous answers provide context, not fresh evidence for procedural claims.

Quick notes and reminders work directly in chat. Dated reminder overviews live in their own searchable vault; today's reminder questions use live server records. Desktop activity terminals share the screen with chat, while mobile uses a hideable overlay. See [conversation setup and rollout](docs/CONVERSATION-STREAM.md) for the required migration, notification architecture, and implementation limits.

PNG, JPEG, WebP, and PDF attachments are supported, up to four files and approximately 2.8 MB total. Reading accuracy depends on the model and source quality. These chat attachments are separate from vault attachment synchronization.

## How it works

| Component | Role |
| --- | --- |
| Browser workspace | Chat, note editing, imports, Quick Note, and local conversation storage |
| Node.js API | Authentication, research orchestration, provider calls, and checkpoint handling |
| Supabase | Authentication, notes, searchable chunks, vaults, quotas, and capture queue |
| Gemini | Question routing, research planning, answer generation, and optional embeddings |
| Local sync agent | Exchanges Markdown changes between paired Obsidian folders and cloud vaults |

The frontend uses **plain JavaScript, HTML, and CSS**. The backend and local tools use **Node.js ES modules**, with **PostgreSQL/SQL migrations** for the database and **PowerShell** for Windows sync installation. The app does not require React or a frontend compilation step.

## Getting started

### Requirements

- Node.js 22 or newer.
- A Supabase project and an owner account.
- A Gemini API key with access to the configured models.
- Optional: Vercel hosting and Obsidian for local Markdown editing.

### Run locally

```bash
git clone https://github.com/Auroriana/Caprigit
cd A.R.I.A
```

Copy `web/.env.example` to `web/.env.local`, then configure your own project and owner values:

| Variable | Purpose |
| --- | --- |
| `SUPABASE_URL` | Your Supabase project origin |
| `SUPABASE_PUBLISHABLE_KEY` | Your project's publishable key |
| `OWNER_USER_ID` | UUID of the permitted owner account |
| `GEMINI_API_KEY` | Server-side Gemini credential |
| `GEMINI_FREE_TIER_CONFIRMED` | Set to `true` only after checking the API project's billing tier |
| `ENABLE_SEMANTIC_SEARCH` | Leave `false` until compatible document embeddings exist |

The example and SQL contain owner-specific values. Review the migrations and replace owner identifiers for your installation. Install the required schema using the [web setup guide](web/README.md); review the later migration and activation steps before enabling newer features. The two `002` migration files serve different purposes, so do not assume one supersedes the other.

Then start the app:

```bash
cd web
npm run dev
```

Open **http://127.0.0.1:3000**. No dependency installation or frontend build step is required for the core application.

For Vercel, use `web` as the root directory, **Other** as the framework preset, and `public` as the output directory. Leave install/build commands empty and configure the server environment variables. See the [deployment instructions](web/README.md#deploy-to-vercel) for the complete workflow.

## Privacy and usage controls

Capri is designed for one owner. Protected API requests check the owner's identity, and browser sessions use HttpOnly cookies. Model credentials stay on the server. Normal browser API calls stay on the website's origin.

Vault search is restricted to approved, AI-enabled material and the permitted vault scope. Quota reservations precede model calls, and the current configuration does not automatically fall back to a paid provider. DeepSeek is disabled in this release.

The free-tier confirmation setting is an operator assertion, not a check of Google's live billing state or a guaranteed spending cap. External provider terms still apply to submitted content. Cloud-backed notes and model processing do not make this a fully local or end-to-end encrypted application. The app repository ignores the local `vault/` directory and local secret files; maintain an independent backup of your notes.

## Roadmap

The original [setup plan](docs/SETUP-PLAN.md) records the broader direction. Parts have since been implemented; the following separates remaining planned capabilities from proposed follow-up work.

| Area | Remaining direction | Status |
| --- | --- | --- |
| Retrieval | Explicit graph traversal and a measured reranking stage | Planned in the original architecture; current retrieval does not implement these |
| Semantic indexing | Incremental bulk document embeddings with compatible query embeddings | Full pipeline remains to be implemented |
| Evaluation | Compare retrieval coverage, supported answers, citations, latency, and total billed usage on real questions | Evaluation fixtures exist; live benchmarking remains ongoing work |
| Provider choice | Evaluate DeepSeek or other providers against the same evidence | DeepSeek deferred and disabled |
| Budgeting | Stronger cost accounting and enforceable application spending reservations | Broader design exists; current quota controls are not a monetary cap |
| Documents | Extract and index vault PDFs, images, and other attachments | Future vault capability; chat attachments already exist |
| Reliability | Verify live database isolation, sync recovery, cron filing, and restricted-network access | Deployment-specific validation remains necessary |
| Workspace | Automatic link rewrites, richer tab layouts, and optional Obsidian layout support | Possible extensions; not implemented or scheduled |

This roadmap describes direction, not promised release dates.

## Development and validation

From the repository root:

```bash
npm test
npm test --prefix web
node tools/audit-vault.mjs --vault "/path/to/your/vault"
```

The local audit reports aggregate Markdown size and capacity estimates without uploading notes or calling a model. Automated suites cover areas including retrieval orchestration, citation IDs, checkpoints, note handling, imports, quota logic, and sync planning. Additional browser and local SQL checks are documented in the feature guides and may require separate tooling.

Mocked tests validate application behavior; real model quality, hosted database policies, deployment access, and scheduled workers need live checks. This README was prepared from repository source and documentation, not a new end-to-end deployment test.

## Documentation

- [Web configuration and deployment](web/README.md)
- [Notes workspace, conversations, and resumable research](docs/NOTES-WORKSPACE.md)
- [Quick Note and note moves](docs/QUICK-NOTES.md)
- [Automatic Obsidian sync](docs/OBSIDIAN-SYNC.md)
- [Original architecture and setup plan](docs/SETUP-PLAN.md)
- [RAG evaluation cases](eval/rag-cases.json)

