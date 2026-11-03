# Personality-first conversation

Each turn starts with a local keyword lookup over the personality catalog. The personality model receives the retrieved records, short transcript samples and the current conversation. It can reply immediately or ask for general reasoning or vault research. For delegated turns, Capri receives the findings and their source IDs before writing the visible reply. A retry can resume from the saved route or findings on the originating device.

The browser shows one reply and its personality lookup details. Completed messages sync through Supabase. Checkpoints, permission prompts and attachment bytes stay local.

## Earlier architecture snapshot

### Previous implementation

Chat uses route/planning/answer calls with authenticated note retrieval. The final draft and a compact source identity map are passed to a separate personality endpoint. That endpoint can decide to search permitted AI-enabled notes and can propose web research with user approval. It has its own usage accounting. The identity map is not the supporting passage text: valid citation IDs alone do not prove a rewritten claim still follows from its source.

The existing personality planner is a separate generation when memory or web access is enabled. This remains an overhead; this work does not claim to eliminate it. The factual retriever supports an optional embedding path; the new personality folder does not yet have embeddings or a vector index. No semantic personality retrieval or conversation-scoped personality cache is claimed.

## Changes in this task

Capricorn is the visible website name; Capri is the conversational identity. Existing storage keys, cookies, database table names and API identifiers remain compatible. The personality switch is always enabled in normalized server settings and the browser. The previous stock personality variants migrate to the new compact core; custom personality text is preserved. The default personality model uses the existing everyday model to reduce exposure to the old default's small configured daily quota. Saved explicit model choices remain intact.

Answer-generation calls also receive the compact core so a separately failed personality pass does not leave a draft with the old stock persona. Planning and verification retain their evidence-oriented instructions. Failed personality passes remain visible as failures and can be retried from the saved handoff without rerunning factual research. There is no hidden paid fallback or unlimited retry loop. No software can guarantee a completed model response during quota exhaustion, provider failure or user cancellation.

The editable Markdown vault and generated browser catalog separate core identity, evidence, behavioral proposals and engineering notes. There are no sprite or voice service calls. Proposed presentation IDs are documentation only.

## Dedicated personality retrieval contract — next stage

Use a separate namespace with stable note IDs, version/content hash, module, evidence status and language. Index semantically meaningful sections, including the status and relevant condition in every chunk. Exclude research-method and engineering documents from runtime behavioral selection. Store embeddings only after selecting and measuring an actual embedding pipeline; do not describe keyword lookup as semantic retrieval.

Allow the personality model's existing response/tool process to request a module only when the core is insufficient. A greeting should usually finish without a database operation. Bound retrieval to two rounds, three passages per round, and a measured context budget; these are starting design limits, not deployed behavior. Reuse only still-relevant cached passage IDs whose content hashes match. Do not blindly append all prior modules.

Keep personality evidence and factual evidence separate. A behavioral card can guide delivery but cannot establish an insurance rule, a fact about the user or a claim about canon. Any newly retrieved fact that changes the draft needs reconciliation before final delivery. Preserve claim-to-source associations, not merely the presence of citation markers.

## Evaluation scenarios

1. Greeting: short core-guided reply, no unnecessary personality retrieval.
2. Simple task: clear result with light character presence, no theatrical preamble.
3. User frustration: specific repair, reduced teasing, no defensiveness.
4. Betrayal hypothetical: distinguish adaptation from verified canon.
5. Canon catchphrase request: do not invent a quote.
6. Citation-heavy rewrite: retain numbers, negation, scope and source relationships.
7. Provider failure: show saved original explicitly and offer bounded user-triggered retry.
8. Saved disabled setting: personality still runs under the new always-on requirement.
9. Custom instructions: retain user edits while keeping Capricorn identity and factual integrity.
10. Voice/facial request: identify unverified details instead of fabricating measurements.

Automated tests verify settings normalization, core injection, catalog consistency and existing application behavior. They do not establish audiovisual fidelity or real model quality. No live token/latency improvement measurements, live database changes, deployment, or provider evaluation were performed. The original filesystem suite previously encountered Windows sandbox realpath errors; the web test suite is the relevant regression baseline here.

## Roadmap

First obtain and annotate the supplied primary clip, then reconcile the core and cards against it. Next evaluate character consistency using real provider responses and a source-supported rubric. Add dedicated conditional personality retrieval and versioned cache only after that evidence pass. Improve claim-level citation checking and planner overhead separately. Implement voice and sprite rendering last, using a validated structured schema and supported presets; do not infer emotions solely from keywords.

## Recorded verification for this revision

- 117 web tests passed, including stock-prompt migration, mandatory personality normalization, generated core consistency, corrected-speaker provenance and empty-response failure handling.
- The local Chrome regression passed settings persistence, the personality handoff, original/styled toggling, failure recovery after reload, retry without another research call, vault browsing, corrected-source search and mobile overflow checks. The first sandboxed browser attempt could not reach localhost; the same local test passed with the required sandbox permission.
- The vault contains 100 Markdown notes and 90 ingest records. Word counts include source transcripts, metadata and repeated provenance blocks; they are not counts of independent facts.
- The supplied transcript and final speaker correction are now incorporated. Direct video/audio verification, a live semantic personality index and deployment are still pending.
