# ARIA Phase 1 — investigation and usage diagnostics

Date: 2026-11-01 (Asia/Shanghai). This report records the initial Part I investigation and transparent accounting changes. Part II was subsequently supplied and completed in the [embedding and RAG audit](PHASE-1-RAG-AUDIT.md), including live read-only database verification. That supplement supersedes the initial uncertainties about deployed schema and vector coverage. No later-phase architecture was implemented. Changes are local; nothing was deployed and no live model calls or database writes were made.

## What the two historical numbers establish

The supplied 4,186 and 11,845 totals cannot be decomposed retrospectively from this repository. No matching provider response records, saved request settings or per-call measurements were supplied. It would be incorrect to attribute their difference to RAG alone or claim measured token savings.

The code explains several possible contributors, now observable individually. The opinion-specific path is confirmed in a mocked API regression: with personality memory enabled, web set to `ask`, no prior vault searches and a planner returning no query, “What do you think of her?” causes a forced keyword vault search and three personality calls (memory planner, web-need assessment, final composition). These occur in addition to the reasoning pipeline. The fixture uses 120 tokens per call and totals 360; those are synthetic values, not measurements of the historical conversation.

## Required checks and evidence

| Check | Finding |
|---|---|
| Per-request or cumulative? | Per assistant reply in `public/shell.js`. The reasoning endpoint sums its generation calls and preserves that subtotal across checkpoints. Streaming snapshots replace the current call's usage rather than accumulating snapshots. Personality usage is then added once. An approved web follow-up adds further work to that same reply. The composer starts with a local draft estimate, then displays current response usage. This is not a lifetime/chat total. |
| Authoritative or estimated? | Successful Gemini and Claude calls normally use provider metadata. Missing metadata falls back to an explicitly labeled byte-based estimate. Quota reservations use conservative byte/output allowances and are not the displayed usage or actual cost. |
| Both models counted? | Yes, after successful personality completion. Routing, analyzing, reasoning, personality and grounded web work are now itemized by model and phase. Personality disabled means no personality generation. The acknowledgment API exists but the current shell does not invoke it. |
| Additional inference rounds? | Yes. Router and research gap checks are independent inference calls; search RPCs themselves are not generation. Personality planning and web assessment are additional calls. Grounded web search is a separate Gemini generation. Research can continue across HTTP checkpoints without a fixed overall round cap. |
| Cached and thinking tokens? | Cache details were dropped before this change. They now survive normalization, aggregation and the UI, without adding cached subsets twice. Gemini provider totals include thought tokens; Claude output is kept inclusive, without inventing a separate thought count. |
| Repeated RAG context? | Research planning and synthesis each receive the selected evidence. The personality handoff sends the draft, history and other-chat overview, not the complete reasoning evidence array. Independent personality memory retrieval can fetch overlapping facts and send them to assessment and composition. Thus identical full evidence in both model pipelines is not universally true. |
| Repeated history? | Yes. `conversationMemory` retains up to 200 messages / 160,000 serialized characters, with each message truncated to 40,000 characters. Routing, research and personality calls resend history. Personality also receives other-chat summaries (up to four 1,500-character messages per other saved chat). Whether that repetition is unnecessary for any specific call remains a quality question for Phase 2. |
| Repeated system prompts? | Yes. Each call includes its role instructions; personality planning and composition repeat the personality identity and guard text. Custom prompt fields can each reach 16,000 characters. No explicit prompt-cache setup is present; provider cache hits can still be reported. |
| Embeddings included? | Previously absent from displayed generation usage. Successful query embedding calls and local token estimates are now tracked separately, never added to generation totals. The adapter returns only vectors, so these embedding counts are estimates rather than authoritative billing metadata. |

## Retrieval and embeddings inspection

- The default router reasons before searching note contents, although it first loads the vault overview. Social and vault-map routes avoid note-content retrieval. Invalid routing falls back to an initial search. Disabling the router performs that initial retrieval before planning.
- Query embedding runs only for `initial=true` with `ENABLE_SEMANTIC_SEARCH=true`. Normal routed pending searches pass `initial=false`, as do later gap searches; personality searches always pass a null embedding. Therefore enabling semantic search does not make normal routed searches semantic. This is a confirmed implementation limitation, not evidence of redundant embedding work.
- `embed` requests 768 dimensions and validates the returned vector. No repeated embedding loop was found in the inspected chat path.
- Normal save/indexing code creates heading-aware chunks of up to 2,500 characters, with no overlap. SQL accepts up to 3,000 characters per chunk. Normal saves delete/reinsert chunks without embedding values or model IDs, so embeddings are not generated or preserved by that workflow. Live database vector coverage was not measured.
- Search migration 007 combines keyword ranking with optional cosine similarity for matching embedding-model IDs, applies owner/AI-enabled/vault scope, discards scores below 40% of the best match, and returns at most six chunks. A semantic-only candidate needs a score above 0.5. Correction from Part II: the initial inspection missed the relative-score filter in 007; the deployed function has now been verified to include it.
- Evidence is deduplicated by chunk ID, selected with a 180,000-character content budget, and retains stable source IDs. Recent evidence is preferred. Omitted chunks retain catalog metadata, and synthesis rejects citations to unavailable/unknown evidence. This is selective retrieval, but repeated rounds can still produce large prompts.
- The personality engine already decides on optional memory retrieval. However, the opinion keyword fallback can force a search even when its planner requested none. This conflicts with the desired information-need principle and belongs in a measured Phase 2 change, not a silent Phase 1 behavioral rewrite.

## Changes made

1. Preserved Gemini cache-read metadata and Claude cache-read/cache-write metadata. Cache subsets are excluded from fallback total arithmetic.
2. Added a numeric per-call ledger: role, phase, model, provider counts/estimate flag, elapsed milliseconds and approximate prompt sizes for system instructions, history, retrieved material, other-chat overview and draft. Estimates use UTF-8 bytes / 4 and rough attachment allowances; they are not exact token attribution or additive billing categories.
3. Fixed the Claude reasoning path's missing-metadata fallback, which previously could display an estimated zero; grounded web generation also now has a meaningful fallback and its own ledger entry.
4. Added successful RAG/semantic search counts, retrieval elapsed time, and separate query-embedding call/token estimates. Checkpoints and existing browser storage carry these fields without schema migrations.
5. Added a compact expandable per-reply usage panel, retaining the existing numeric composer meter and visual styling. Historical replies without a ledger remain readable and show unavailable details rather than fabricated call counts.
6. Added accounting/privacy regression tests and expanded mixed-provider and browser coverage. Diagnostic objects contain no prompts, query text, note content, titles, API keys or user identifiers.

## Verification

- 98 web tests passed, including cumulative streaming snapshots, cached subsets, mixed Claude/Gemini accounting, personality opinion diagnostics, numeric-only telemetry, checkpoint serialization, existing RAG and citation behavior.
- Six root filesystem tests passed outside the sandbox. Initial sandbox attempts failed at `realpath` with EPERM; this was environmental, not a code regression.
- Mocked Chrome test passed: draft/live/final usage, persistence after reload, expandable call details, mobile panel bounds and no browser JavaScript errors. Screenshot: `reports/token-usage-mobile.png`. Browser localhost access required running outside the sandbox. An initial whole-page overflow assertion exposed existing mobile page/drawer behavior; the regression checks the changed panel itself, with the history drawer closed.
- JavaScript syntax checks and Git whitespace check passed. No live API expenditure was used for these tests.

## Outstanding issues and Phase 2 handoff

- Historical 11,845-token attribution remains unresolved. Replay representative interactions after deployment with the same settings, inspect each call and retain only numeric results. Compare quality/citations as well as usage; do not infer savings from fixture counts.
- Completed-call accounting is not a billing ledger. Failed/interrupted calls and work lost before a checkpoint can incur provider usage that is not retained. If personality fails after earlier internal calls, its endpoint does not deliver those partial totals. Repeating an authorized web action can add usage to the existing reply.
- No whole-response wall-clock latency, monetary estimate, authoritative embedding usage or provider-internal tool-round count is implemented. Per-call elapsed time includes local/quota overhead; retrieval time includes lookup/embedding work. Component estimates omit some framing and cannot exactly reconcile to provider tokenization.
- Phase 2 should evaluate the forced opinion retrieval/assessment, history and other-chat reuse, research evidence duplication and handoff size while preserving autonomy and grounding. Router model selection can use the configured reasoning model rather than the light default; measure its cost before changing it.
- Part II verified deployed schema and vector coverage: 430 chunks, zero vectors. Semantic activation and document embedding remain implementation follow-up. Do not enable extra embeddings or rebuild indexes under the guise of accounting fixes.
- Citation transformation quality, supplemental personality knowledge and multimodal architecture remain later-phase work. No personality database, pipeline redesign or prompt reduction was introduced.

## Provider accounting references

Checked against [Gemini UsageMetadata](https://ai.google.dev/api/generate-content#usagemetadata) and [Claude prompt-cache accounting](https://platform.claude.com/docs/en/build-with-claude/prompt-caching): Gemini cached content is already included in prompt totals; Claude total input is uncached input plus cache creation plus cache reads. Provider totals take precedence. The Supabase skill was consulted for the repository retrieval audit; its changelog URL could not be read by the browsing tool because of an unsupported Markdown content type. No Supabase feature or schema was modified.
