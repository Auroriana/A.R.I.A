# Part III — reasoning and autonomous personality handoff

2026-11-01, Asia/Shanghai. Phase 2 began with the supplied Part III only. Part IV has not been supplied or implemented. Local changes only; no deployment, database mutation, live model call, new dependency or personality knowledge database.

## Architecture verified

ARIA already resembles Scenario B, not Scenario A. `researchStep` supplies factual evidence to routing/research/synthesis as appropriate. The browser then passes the resulting answer to `personalize`; it does not pass the full reasoning evidence array to that model. There was no justified 4,000-token-to-300-token RAG replacement to make.

| Stage | Model input before these changes | Remaining repetition |
|---|---|---|
| Reasoning route | Role prompt, question, conversation history, vault overview, attachments; initially empty evidence | History and instructions recur in later calls. |
| Research planner / factual synthesis | Role prompt, question, history, vault overview, selected evidence, search log, discrepancies/warnings, attachments | Evidence can be supplied to several planner calls and final synthesis. |
| Personality information planner | Core personality + guard + task prompt; question, full reasoning draft, history, other-chat summaries, optional acknowledgment | Draft/history/overview repeat in composition and optional web assessment. It previously lacked an explicit prior-search flag and source-identity map. |
| Personality composition | Same base context plus independently retrieved memories, web evidence/request, allowed citation IDs | Independent retrieval can overlap reasoning's facts, but the full reasoning RAG dataset is not automatically duplicated. |

The selected reasoning model handles route/synthesis (or the default light router); the analyzing model handles gap planning. Personality uses its separately configured model. The personality planner and composition both run with the core personality instructions. Composition is explicitly allowed to restructure, react, judge, ask a useful follow-up and correct a mismatched topic. It remains a reasoning author, not a mechanical text filter.

## Confirmed problems addressed

1. A regex matching words such as “think” and “opinion” overrode a planner's decision to request no information. With memory enabled and no prior search, it forced a vault search and a second model assessment. This resent the complete draft/history/overview despite no model-identified gap.
2. The initial personality planner could not see whether factual research had already searched, although the endpoint received the count. It saw citation IDs in the draft but no mapping to source identities.
3. Citation instructions simultaneously described citations as optional and required retaining markers on rewritten cited claims. That ambiguity weakened the handoff's grounding contract.

## Implemented handoff

`public/personality-handoff.js` constructs an explicit payload from the existing question, unabridged draft, conversation history, other-chat overview, core settings and concise preference. It adds the prior-search count and a citation map containing only referenced source IDs, titles, paths and vault names. Uncited/omitted passages and duplicate IDs are excluded from the map. Source excerpts, files, checkpoints, request usage and unrelated request properties are not forwarded.

The full draft remains the factual handoff: conclusions, caveats and inline source associations are retained without an extra summarization-model call or arbitrary truncation. Metadata gives source identity, not evidence for new claims. Raw excerpts remain attached to the original response in the existing UI. The server validates the optional map's shape/size and independently strips all fields other than citation identity before generating prompts. Older saved handoffs without the new map continue to work.

`personalize` now exposes `vaultsChecked` and `citationSources` to its planner. It instructs the personality model to reuse supplied conclusions and qualifications, but explicitly permits factual or personal retrieval for a missing, uncertain or verification-sensitive point even after reasoning searched. An opinion alone is not treated as a gap.

The regex override is removed. A planner returning null queries proceeds to composition. A model-proposed web query still follows the existing vault-first/assessment path; web access still requires user approval. The user’s memory/web switches still govern available operations. Updated search status reaches final composition after independent retrieval.

Citation guidance now requires retaining attribution on retained source-derived factual claims, preserving uncertainty and distinguishing judgment from facts. A citation may be dropped when the associated claim is dropped; no rule forces factual claims into an otherwise conversational reply. Original `[S#]` identities and independently retrieved `[P#]` sources remain supported, including grouped markers and unknown-marker filtering.

## Measured checks

- The established no-gap opinion fixture previously made three personality calls and one vault search. It now makes **two calls and zero vault searches**. One complete-context web-assessment call is avoided. The mocked accounting fixture changes from 360 to 240 tokens because every mocked response reports 120; those are test values, not measured API savings.
- A fixture with a missing project deadline still performs autonomous personality retrieval after two reasoning searches, returns `[P1]` evidence, and retains the draft's `[S2]` attribution.
- A model-proposed current-information gap still triggers the assessment and offers web research without executing an unapproved search. Existing approved-web and disabled-web cases pass.
- Handoff tests preserve the entire draft, its uncertainty language and the latest conversation list; they assert that large raw passages, attachments and checkpoints are absent. A metadata map adds a small amount of input compared with the previous draft-only mapping. No blanket percentage reduction is claimed.
- **104 web tests passed.** The mocked Chrome flow verifies the actual browser request includes the compact citation map and search count, excludes raw source excerpts, preserves the original/styled toggle, saves settings and survives reload with correct usage. The old browser fixture expected an acknowledgment call the current shell does not make; its expected total was corrected from 476 to 466 (456 reasoning + 10 personality).
- Git whitespace check passed. No UI layout changes were made.

## Limits and next work

- No live model quality evaluation was run. Prompt adherence, citation entailment and personality fidelity require representative real-output review; deterministic tests verify plumbing and permitted control flow, not semantic equivalence of every generated response.
- Removing the keyword fallback means a planner that fails to propose a genuinely needed query will not be rescued by that heuristic. The planner is now explicitly instructed to identify current-information needs. Monitor this tradeoff using the per-call diagnostics before further changes.
- Full history and other-chat context remain available and repeated. Context selection/compression and follow-up reuse belong to the not-yet-supplied Part IV; they were not silently reduced here.
- The personality engine retains its existing one-round vault planning and optional web assessment, not a new unlimited tool loop. A later missing need discovered during final prose generation cannot issue another tool call within that call. Future multi-step retrieval remains separate architecture work.
- A source-identity map is not an authenticated proof or an entailment checker. The original grounding pipeline, archived handoffs and existing citation validation limitations remain relevant. Personality retrieval still uses its existing owner-accessible vault scope.
- The Phase 1 findings about missing document embeddings, vector reuse and model invalidation remain outstanding. This change does not implement those features.

Part III is complete. Await Part IV or another explicit directive before continuing.
