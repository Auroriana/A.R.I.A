# Part IV — context-aware follow-ups

2026-11-01, Asia/Shanghai. Completes the supplied Phase 2 context-reuse work. Local implementation only: no deployment, database migration, live generation/embedding request, new dependency or later-phase personality database.

## Investigation

The router already received conversation history and instructions to resolve pronouns from the latest relevant exchange. It could classify an opinion as social and avoid retrieval, but that branch had no attached source evidence. History could retain earlier `[S#]` markers without their original source map. Every factual research turn otherwise started with an empty evidence set. Within-turn duplicate query and passage suppression existed, including the Part II router fix, but no cross-turn source cache existed.

The current conversation uses the displayed personality response when present, which is important for references such as “the first one.” Raw drafts must not displace the list the user actually saw. History remains bounded by the existing 200-message / 160,000-character budget; this work does not silently shorten it or introduce lossy generated summaries.

## Implemented flow

1. After a completed vault response, cache only passages that were both read and cited. The assistant answer itself is never promoted into cached evidence. The optional cache holds at most 12 complete passages and 24,000 body characters; larger passages are skipped rather than truncated. This bounds the shortcut, not ordinary research.
2. Reuse the existing authenticated encryption/checkpoint primitive to bind the cache to the authenticated owner and exact vault selection. The cache has its own 15-minute expiry. Invalid, expired, tampered or differently scoped tokens are ignored; ordinary retrieval remains available. The key must remain stable across server restarts for cached tokens to remain usable.
3. Save the opaque token on the assistant message in existing browser storage. A subsequent request sends only the most recent assistant message's token. Reloading preserves it; new chats do not inherit it. A social/general reply without cached sources ends this immediate reuse chain instead of reaching back to an older topic.
4. The existing router sees recent dialogue and a small source catalog (identity metadata and capture time), not all cached excerpt text. A new `context` intent with no queries opts into historical evidence for reflection or explanation of already-established facts. There is no pronoun or opinion regex deciding the referent.
5. New details, current/latest facts, changed circumstances, procedural decisions and explicit rechecking/verification are directed to the existing lookup/case paths. Those paths do not receive cached passage bodies and may repeat an old search when freshness genuinely requires it. A `context` plan that also asks for searches is rejected rather than silently discarding those searches. A missing-cache `context` plan falls back to retrieval.
6. A context response receives the selected actual passages, with fresh response-local `[S1]…` IDs. Previous `[S#]`/`[P#]` markers are removed from research history so they cannot accidentally refer to new passages. The text of the conversation is otherwise preserved. The model is instructed to distinguish its judgment from supported facts, avoid claiming current verification, and state when the passages do not support a detail.
7. Reused references carry their original snapshot timestamp, visible inside the reference panel. The original cache token is returned unchanged: follow-up reuse never renews its expiry or makes old evidence appear freshly retrieved.
8. Personality receives the compact draft/citation-identity handoff from Part III plus snapshot status/time. It retains independent retrieval access for fresh facts or verification. It does not receive the cached raw excerpts automatically.

## History, duplicate searches and summarization

- New saved messages retain a clean `reasoningText` in addition to the UI-decorated original. Future history chooses personality text first, then clean reasoning text, then the legacy text fallback. Appended “Research: … searches” counters are no longer resent for new non-personality messages. Existing stored chats remain compatible.
- Existing within-turn normalized query suppression and chunk-ID merging remain unchanged. Cross-turn reuse is evidence-based and selected by the router, rather than an unconditional query-string cache that could suppress a requested fresh search.
- No new summarization call was added. A bounded set of original cited passages supplies evidence, while the existing compact draft supplies conclusions to personality. The full factual draft and its qualifications are retained.
- Ordinary research budgets and continuation behavior are unchanged. Complex questions can still retrieve more than the shortcut cache holds.
- Grouped and mixed citation markers are now checked against the response's usable source IDs. `[S1, S999]` and `[S1, P9]` cannot bypass factual citation validation.

## Verification and measured scope

- The complete web suite passed with 110 tests after the cache, API and browser integration changes. An additional grouped-citation regression and final targeted run then passed all 30 affected tests (111 web tests now present).
- The mocked two-turn API scenario retrieves once for the initial question, then makes **zero additional passage searches** for the reflective follow-up. The follow-up still has router and reasoning synthesis calls; personality calls depend on its information need. Vault-overview and quota RPCs still occur, so zero searches does not mean zero database operations.
- Tests cover actual-passage reuse, reference remapping, removal of stale history IDs, fresh-research routing, expiry, tampering, owner/scope isolation, bounded cache selection, unchanged expiry on reuse, legacy history behavior, missing-cache fallback, and invalid grouped citations.
- Mocked Chrome passed: source cache survives reload, the next request transmits it, displayed history is retained without research bookkeeping, personality receives snapshot status, and references display the earlier-snapshot label. Existing original/styled toggle and usage persistence checks continue to pass.
- No real token reduction or model-quality guarantee is claimed. The metadata catalog adds a small routing input; sending cached passages can use more tokens than an unsupported history-only social answer. The benefit is avoiding unnecessary retrieval while keeping source evidence available.

## Limits

These are historical snapshots, not a live coherent database cache. Note edits, deletes or AI opt-out do not invalidate already-held browser snapshots immediately; they expire within 15 minutes and must not be used as fresh verification. Owner/scope binding prevents cross-account or changed-scope reuse, but does not perform a new source-permission/version query on each reflective turn. The user already received the same excerpts with the original answer.

Correct coreference and the choice between reflection and fresh research still depend on the router model. Ambiguity instructions ask for clarification; deterministic tests verify control flow, not real-model judgment. If synthesis discovers a gap after routing chose reuse, it states the limitation rather than inventing support; the personality stage can independently retrieve. The factual synthesis call itself does not introduce a new tool loop.

The shortcut applies to vault-mode routing. Router-disabled fallback and general mode retain their existing behavior. Cache material comes from factual reasoning sources, not personality-only `[P#]` retrieval or web results. Old replies saved before this feature have no cache and continue normally.

The cache limits and TTL are explicit constants in `web/lib/followup-cache.js`, not measured quality-optimal thresholds. Live factual/opinion/ambiguous/freshness evaluation remains appropriate after deployment. Missing document embeddings from Phase 1 remain a separate unresolved implementation gap.
