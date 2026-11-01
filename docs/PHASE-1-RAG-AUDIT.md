# Phase 1, Part II — semantic embeddings and retrieved context

2026-11-01, Asia/Shanghai. Investigation of existing code plus read-only checks of the connected ARIA Database, matched to `web/.env.example`. No note bodies, titles, paths or vector values were fetched from the database. No live embedding/generation calls, data changes, migrations or deployment were performed.

## Finding: the embedding integration is incomplete

ARIA has a remote Gemini embedding adapter, persistent vector columns and a similarity-search branch. It does **not currently have an operational document-embedding index**. The live database contains **430 chunks and zero stored vectors**. Thus current retrieval cannot gain semantic matches, even if a query embedding is generated. This is measured, not inferred from the feature flag.

Read-only snapshot (counts may change with subsequent use):

| Measurement | Result |
|---|---:|
| Stored chunks / AI-enabled chunks | 430 / 430 |
| Chunks with vectors / matching model vectors | 0 / 0 |
| Minimum / mean / maximum chunk characters | 6 / 458 / 2,472 |
| Notes / deleted note tombstones | 168 / 20 |
| Active AI-enabled notes | 139 |
| Active notes with incorrect SHA-256 content hash | 0 |
| Extra exact-content copies within the same owner and vault | 17 |

The duplicate count groups by content internally and returns only a count. It does not establish that all copies are redundant evidence: identical wording can belong to different documents or sections. No records were deleted or merged.

## Embedding and indexing lifecycle

| Question | Verified implementation |
|---|---|
| Provider/model | Google Gemini API, `gemini-embedding-2`, requested output dimension 768. `web/lib/providers.js: embed`. Not a local model. |
| Indexing entry points | Web note save, sync upload, imports through note save, history archival, note moves, and Quick Note AI opt-in all eventually call `aria_save_note` with `chunkMarkdown` output. Quick Notes are initially saved with an empty chunk list and become searchable on opt-in. |
| Markdown preparation | LF normalization; frontmatter removed from the searchable presentation; formatting metadata rendered by `noteIndexText`; headings and paragraphs guide splitting, with headings inside fenced code ignored. Canonical Markdown remains separately stored. |
| Size and overlap | Default target maximum 2,500 characters, no deliberate overlap. Oversized paragraphs split by Unicode code point, avoiding broken surrogate pairs. Some packing checks use JavaScript UTF-16 length, so this is not an exact token budget. SQL accepts at most 3,000 characters per chunk, up to 500 chunks per save. A short note may legitimately fit in one whole chunk. |
| Persistence | Canonical documents and SHA-256 hashes are in `aria_notes`. Chunk text, generated full-text-search vector, optional `vector(768)` embedding and model identifier are in `aria_chunks`. These database values survive app/server restarts; no restart experiment was performed. Query vectors are ephemeral. |
| New documents | Save creates canonical note and AI-enabled text chunks. No document embedding request is made and no embedding/model values are supplied to the insert. |
| Modified documents | Optimistic version check; update canonical content/hash/version; delete old chunks and insert new text chunks. Any existing document vectors would be discarded rather than incrementally reused. |
| Unchanged files | Local sync computes SHA-256 of LF-normalized content. Matching local/remote hashes produce `adopt`, not an upload; base state is persisted under `.local`. File sync is already incremental. There are no document embeddings to redundantly recompute today. |
| Unchanged explicit saves | The database does not short-circuit on equal hashes: a valid same-content save still increments the version and replaces chunks. History archiving also resubmits existing parts. This is redundant indexing/database work and would destroy any manually populated vectors, but is not currently embedding inference expenditure. |
| Deletions and moves | Deletion writes a tombstone and removes associated chunks. Local disappearance deletes remotely only when the base/remote hashes agree; incomplete scans and mass-deletion checks protect against accidental removal. Ordinary remote deletion can be resurrected by a remaining local file under existing sync policy. Moves rebuild destination chunks and record a source tombstone that prevents resurrection. |
| Query generation | Only initial fallback/non-router searches embed when `ENABLE_SEMANTIC_SEARCH=true`. Normal routed searches and later research queries pass `initial=false`; personality search always passes a null vector. No query-vector cache is implemented. The adapter rejects wrong dimensions and non-finite values; it does not reject an all-zero vector. |
| Model changes | Model ID and dimension are hardcoded in provider, SQL, schema constraints and quota settings. Search checks stored model IDs, but there is no versioned embedding configuration, automatic invalidation, migration or reindex job. Editing only the provider model could compare incompatible spaces if it still returns 768 dimensions. |
| Physical search indexes | Live database has a GIN text-search index and B-tree ID/note/vault/owner indexes. No HNSW or IVFFlat index exists. Optional cosine scoring is a database expression; lack of an ANN index is not itself a generation-token problem. |

Google currently supports 768 dimensions for this model, automatically normalizes reduced-dimensional output, and recommends task instructions in the text for asymmetric retrieval; `task_type` is not supported for embedding-2. ARIA sends raw query text. Dimension handling is compatible, but retrieval-specific query/document formatting has not been implemented or quality-tested. Do not add an embedding-001-style task parameter. References: [Gemini embeddings](https://ai.google.dev/gemini-api/docs/embeddings), [model specification](https://ai.google.dev/gemini-api/docs/models/gemini-embedding-2).

### Incremental indexing conclusion

Adding another file hash is unnecessary. The missing layer is document embedding and chunk-level reuse, not file change detection. A follow-up implementation should reuse the current note hash, associate each chunk vector with its exact embedding input and configuration (model, dimensions, input formatting/chunker version), reuse unchanged chunk vectors, and only publish results if the note version/hash still matches. Deletion or AI opt-out must remove vectors with chunks; model changes need deliberate invalidation/backfill. Retain keyword search while coverage is incomplete and make coverage visible.

This is an implementation proposal, not code delivered in this audit. A durable backfill, quota handling, race-safe vector writes and changes to transactional save behavior exceed a confirmed low-risk Phase 1 fix. The required behavior “embed stored documents during indexing and reuse them” remains unmet and explicitly tracked.

## Retrieval pipeline and budgets

1. **Routing:** the router sees message, history and vault overview before note retrieval. Social/vault-map intents request no chunks. Lookup/case intents propose up to three queries; invalid routing falls back to the original message. A configured reasoning model can perform routing, so this is not necessarily a cheap-model call.
2. **Query processing:** `keywordQuery` removes stop words, expands a small family/date synonym map and keeps up to 24 terms (or a 200-character fallback). Further research uses an LLM planner with at most four queries per round, each up to 200 characters, and normalized prior-query suppression. There is no separate learned reranker.
3. **Database ranking:** deployed `aria_search` matches migration 007. It builds exact and OR/broad queries using PostgreSQL's `simple` text configuration. Keyword score is `2 × exact text rank + broad text rank + 2 × broad title rank`. Semantic score is cosine similarity only when both query/stored vectors exist and the stored model matches. Candidates need a positive keyword score or semantic score above 0.5. Final score is `keyword-match bonus of 1 + keyword score + semantic score`.
4. **Filtering/top-K:** owner, AI-enabled and optional vault filters apply. Results scoring below 40% of the best candidate are discarded; at most six remain, ordered by score then ID. This relative threshold can discard useful weaker matches when one match dominates. The API returns no numeric scores, so application-level selection cannot rerank by global relevance across searches. The selected user vault constrains reasoning search; personality retrieval searches all owner-accessible vaults, which is an existing scope-policy difference to resolve before external-vault support.
5. **Merging:** repeated chunk IDs merge, with the latest search number recorded as `seenAt`. Without IDs, fallback identity is vault/path/content. Different IDs containing identical text are not merged. Cross-document near-duplicate detection is absent; preserving source provenance would be required before introducing it. Indexed conversation archives include original answers, personality answers and source excerpts, creating another route for factual duplication.
6. **Prompt assembly:** the app selects complete passages newest-search-first under `RAG_LIMITS.evidenceChars=180000`. Within a tied search, returned order is retained. It supplies stable `[S1]`, `[S2]` IDs in discovery order. Oversized/older omitted passages retain IDs/title/path/vault/link metadata with `passageOmitted`; they cannot be cited as read evidence. The cap counts passage bodies only, not metadata, history, search logs, instructions or attachments. There is no summarization/compression stage.
7. **Continuation:** case research can request further searches until the planner stops; no fixed overall search/source/round cap. The 120-second checkpoint slice and provider/request deadlines are timing controls, not cumulative token budgets. Search logs and omitted-source catalogs can grow despite the passage-body cap.
8. **Forwarding:** each research-planning call and final factual answer receives current selected evidence again. Lookup normally bypasses gap planning after a successful search; social goes directly to conversational synthesis after routing. The personality engine receives the draft/history/other-chat overview, plus up to six independently retrieved memory chunks if requested or forced by its opinion fallback. It does not automatically receive the entire factual evidence array. Memory can be resent to web assessment and composition.
9. **Citations:** synthesis validates single `[S#]` markers against included passages; original source excerpts persist for the UI. Personality carries allowed original IDs and assigns `[P#]` IDs to its memory search, removing unknown markers with a warning. The factual validator's regex does not fully validate grouped markers such as `[S1, S999]`; citation grammar alignment is an outstanding source-integrity issue for the later citation work, not an assurance that every citation form is validated.
10. **Reuse across turns:** old answers remain conversation memory but do not become fresh source evidence. This protects current procedural grounding, yet can cause repeated retrieval; source-aware reusable evidence with freshness/scope rules is absent. Do not simply skip retrieval based on pronouns or a previous answer's existence.

### Where database work becomes generative token expenditure

| Operation | Existing cost boundary |
|---|---|
| Document embedding | Missing; zero document vectors measured. Future embedding API input is a separate cost. |
| Query embedding | `embed(query)` invokes the embedding API on eligible initial searches. Separate from generation; currently yields no semantic matches because stored vectors are absent. |
| Vector ranking / fetching chunks | `aria_search` runs in PostgreSQL and returns up to six rows. Scoring 430 rows does not send 430 rows to a model. |
| Query planning/rewriting | `generate(request, {phase:'route'/'planning'})` incurs generative input/output usage. |
| Retrieved context | `researchStep` serializes `evidenceFor(state)` into a request text part; the provider call is the precise boundary at which those bytes become generation input. Each later call resending that evidence incurs its own input usage, subject to provider caching semantics. |
| Personality context | `personalize` serializes draft/history/overview/memories into each plan, assessment and rewrite request; those are additional generative inputs. |
| Answer generation | Provider candidate/output and possible thinking tokens, accounted under Part I. |

Illustrative upper bounds, not observed usage: six normal 2,500-character chunks contain 15,000 characters, approximately 3,750 tokens for ASCII under the local estimator, before metadata/history/instructions. Three routed searches can accumulate 18 distinct chunks. The research body cap permits 180,000 characters, approximately 45,000 ASCII tokens **per call**, not per conversation. Actual database chunks average 458 characters, but no claim is made that search returns an average sample. Neither these bounds nor the zero-vector snapshot explains the historical 11,845 total by itself.

### Budget decision

No lower token cap or new automatic compression was introduced. The existing flow already adapts work by intent and planner stopping; a budget is a ceiling, not a target, so a short lookup sends the actual returned passages rather than padding to 180,000 characters. However, there is no configurable whole-prompt/cumulative budget, no relevance-aware cross-round pruning, and no smaller memory budget by intent. These are candidates for measured Phase 2 work. Adding arbitrary simple/complex limits now would risk dropping evidence without a quality baseline. The report distinguishes these gaps from completed fixes.

## Confirmed low-risk fix and verification

The router accepted up to three queries but did not deduplicate within its initial plan. A regression fixture reproduced two case/whitespace variants sent to the same vault plus an identical query for a different vault: **three database searches before the fix, two after**. `parseRoute` now deduplicates normalized query + vault combinations while retaining first-occurrence wording/order and keeping distinct vault scopes. Later gap-planner behavior and model-call policy are unchanged. This eliminates one redundant retrieval in that fixture; no generative token savings are claimed.

Added a second regression exercising the actual 180,000-character ceiling with 66 × 3,000-character passages across 11 searches. It confirms complete-passage omission, stable source IDs, acceptance of included evidence citations and rejection of omitted evidence citations. Existing large-research tests continue past 24 sources; no new research cap was imposed.

Verification: **39 focused tests passed** across RAG, note indexing/sync planning, provider/embedding adapter and token accounting. The router test failed before the fix and passed afterward. Live SQL was read-only, inspecting schema, deployed function definitions, indexes and aggregate counts only. No UI was changed in Part II.

## Outstanding work

- Document embedding/reuse/backfill and semantic coverage reporting are missing; normal routed query embeddings are bypassed. This is the highest-priority functional gap, not an optimization victory.
- Same-content explicit saves replace chunks, and model changes lack a coordinated invalidation strategy. Reuse existing note hashes; add chunk/config identity only when implementing vector lifecycle.
- Distinct-ID duplicate content, archived-source duplication, all-owner personality scope, grouped citation validation, and total-context growth remain documented issues.
- Retrieval relevance, the 40% threshold, embedding task formatting and adaptive budgets require representative factual/opinion/complex-task evaluation. No private content was exported and no paid/live LLM benchmark was run.
- Phase 1 audit is complete. Await the user's next directive before implementing Phase 2 or a broader indexing redesign.
