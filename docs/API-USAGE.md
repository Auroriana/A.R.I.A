# Capri API usage and token inventory

Source audit: 2026-11-07. Model names below are repository settings, not a claim of live provider availability or current pricing. No Groq integration or new paid-provider fallback was enabled.

## Calls that use model tokens

| Job | Current caller / model choice | Inputs | Output and light-model suitability |
| --- | --- | --- | --- |
| Conversation decision and casual reply | `personality.js`, `capri-turn`; configured personality model | Current message, bounded conversation, small personality passages, examples | Reply bubbles/expression or route. Good future light-model candidate, with routing evaluations. |
| Research intent and search query routing | `rag.js`, `route`; configured analyzing model | Question, conversation, vault directory, cached source identities | Short structured query plan. Strong light-model candidate. |
| Research gap checks | `rag.js`, `planning`; analyzing model | Question, selected evidence, prior queries, requirements | More queries or stop. Light candidate; must preserve all requested topics. |
| Factual answer / attachment reading | `rag.js` and general `/api/chat`; configured reasoning model or chat selection | Question, history, selected notes and images/PDFs | Main answer. Escalate based on complexity and modality, not every request. |
| MIR verification | `rag.js`, `verify`; reasoning model | Draft plus evidence | Structured issues, possible targeted re-search and revision. Candidate for stronger reasoning on difficult requests. |
| Additional memory/web decision | `personality.js`, `memory-plan` | Draft, source identity map and conversation | Query or no query. Light candidate; avoid if draft already suffices. |
| Optional web permission assessment | `personality.js`, `web-assessment`, only ask mode | Remaining factual gaps and provisional sources | Structured need/permission question. Light candidate or combine with initial router. |
| Public web research | `web-search.js`; `WEB_SEARCH_MODEL` or Gemini 2.5 Flash, then configured-code Flash Lite alternatives | Short public-only query; Google Search tool | Grounded briefing and source URLs. Needs a search-capable backend; a plain Groq completion alone would not replace search. |
| Final personality delivery | `personality.js`, `rewrite` / `personality-answer` | Factual draft, conversation, small character snippets, optional selected memory/web findings | Natural message array and expression, preserving facts and numbers. Light candidate if faithful. |
| Acknowledgments and action confirmations | `personality.js`, `ack`, operational rewrite from `shell.js` | Request plus confirmed saved/pending operation | Short reply; missing reminder time now uses a deterministic question. Strong light candidate or templates. |
| Reminder notification wording | `agenda.js`; fixed planner model | Clean reminder action, due time, personality instructions | Generated once on save; delivery uses stored text without another model call. Strong light candidate or templates. |
| Welcome messages | `chat-routes.js`; fixed planner model | Personality snippets/examples | 12 cached short lines, refreshed on demand/expiry. Strong light candidate. |
| Quick Note organization and filing choice | `quick-queue.js`, `quick-note.js`; fixed Flash Lite | Exact capture plus eligible folder/vault map | Organized copy, title, location and confidence. Preserve original text. Light candidate with placement validation. |
| Note layout suggestions | `note-format.js`; selected Gemini model | Numbered source lines | Positional format hints, not replacement text. Light candidate; currently up to 8,192 output tokens. |
| Note segmentation | `note-segment.js`; selected Gemini model | Note lines and sections | Structured segment metadata. Light candidate after boundary/coverage tests. |
| Vault description | `vault-describe.js`; selected Gemini model | Approved note paths/headings and vault names | Short description; light candidate. |
| Optional semantic note search | `providers.js`, `embed`; Gemini Embedding 2 | Search query | Query vector when semantic search is enabled. Embeddings must match document indexing; cannot replace with ordinary chat. |
| Optional personality vector build/search | `tools/embed-capricorn-vault.mjs`, personality embedding/semantic modules | Character passages or query | Compatible embedding vectors. Runtime default character retrieval is local keyword matching. |
| Recovery attempts | `generation-recovery.js`, quota wrapper, browser retry | Reuses current request/checkpoint; prose continuation includes partial answer | Additional tokens when retrying. JSON is regenerated whole; prose continues up to 3 calls per completion; transient turn errors retry up to 5 times with backoff. |

The ordinary social path generally needs one conversation call. A researched answer can use a conversation route, research route, one or more gap checks, synthesis, optional verification, memory planning, and delivery rewriting. Each repeated step resends some context. A 70k **total** is not necessarily 70k output tokens: input, output, thinking, and tool prompts must be read separately.

## APIs that do not consume LLM tokens

Supabase authentication/session refresh, note reads and writes, keyword search, vault metadata, chat synchronization, checkpoint encryption, reminder save/list/completion, daily reminder overview archiving, queue claims, indexing text chunks, and push subscription receipts are database/network operations. Reminder push delivery uses Web Push, not an LLM. In-page sound, speech recognition provided by the browser (where used), markdown rendering, source highlighting, local character lookup, and local sync are not chat-completion calls. Hosting/database/search services may have their own charges independent of model tokens.

## Token display and scope

The composer shows an approximate **input** count for the draft, bounded history, and attachments. It cannot yet know the router's future evidence or system prompt. Each delivered message's three-dot menu shows **input / output / total**, with a Token details disclosure containing per-call model, role, phase, latency, thinking, caching and approximate prompt components. Byte estimates use UTF-8 bytes / 4, and attachments use a rough 4,096-token allowance per file.

Provider counts are preferred; missing input/output counts are estimated. Cached counts are subsets of input, not an extra bill. Failed or interrupted requests can cost tokens without returning usage. The chat ledger covers completed chat/personality/web calls in that turn, including output-continuation calls. Reminder wording, Quick Note jobs, welcome generation, import formatting, segmentation, vault descriptions, and offline embedding builds are **not yet included in an account-wide usage ledger**. No monetary estimate is shown because verified prices and a complete billing ledger are absent.

## Retrieval limits now in use

Before model context construction, passages are ranked by distinct query matches with title weighting, then provider score. Duplicate chunks, weak matches relative to the strongest match, and passages over the size budget are excluded. Each search admits at most 6 complete passages within 18,000 characters; the combined evidence budget is also 18,000 characters, with relevance and repeated matches ahead of recency. Secondary personality memory admits at most 4 passages / 10,000 characters. Automatic broad section expansion is disabled. Quick research remains bounded to 2 planning rounds / 8 searches; MIR to 4 / 16. These are passage budgets, not guarantees of total request tokens. Long chat history, personality prompts, repeated planning and attachments still add cost.

Future allocation policy is specified in [MODEL-ROUTER-INSTRUCTIONS.md](MODEL-ROUTER-INSTRUCTIONS.md). Provider assignments remain a later decision.
