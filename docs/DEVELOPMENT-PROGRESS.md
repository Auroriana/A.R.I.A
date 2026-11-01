# ARIA development progress

## 2026-11-01 — Phase 2, Part III complete

- Verified that the existing handoff sends a reasoning draft rather than the full RAG dataset. Added explicit citation identities and prior-search status without copying raw passages or shortening factual qualifications/history.
- Removed opinion-keyword forced retrieval/assessment when the personality planner requests no additional information. The established fixture moves from three calls/one search to two calls/zero searches; no real API savings claimed.
- Independent personality retrieval after factual research and approved web access remain available. Clarified citation preservation for retained factual claims.
- 104 web tests and mocked end-to-end browser handoff/persistence check passed. No deployment or live model/database calls.
- Full findings and limitations: [Part III model handoff](PART-III-MODEL-HANDOFF.md). Await Part IV; history compression/reuse and later personality architecture were not implemented.

## 2026-11-01 — Phase 1, Parts I–II complete

- Part I was supplied first; Part II subsequently received and audited. Await explicit next-phase instructions.
- Added numeric per-call usage diagnostics, cached input visibility, clearly labeled prompt estimates, separate embedding estimates, retrieval counters/timing and an expandable reply panel.
- Preserved existing routing, retrieval, personality autonomy, prompts and source/citation behavior. No deployment, live model calls, database mutations or new dependencies.
- Verified 98 web tests, six root tests and the mocked browser regression. Sandbox restrictions required external execution for filesystem/browser/Git checks.
- Confirmed potential follow-up costs: repeated history/system context and the personality opinion path's forced search plus assessment. Historical 4,186/11,845 totals cannot be attributed without matching telemetry.
- Semantic searches are bypassed by the normal router; normal note indexing does not generate embeddings. Documented for follow-up, not changed.
- Limitations: successful-call ledger only, approximate component/embedding tokens, no monetary or full-response latency measurement. No token savings claimed.
- Full evidence, remaining issues and Phase 2 handoff: [Phase 1 audit](PHASE-1-AUDIT.md).

### Part II additions

- Read-only live database check: 430 text chunks, zero vectors; 139 active searchable notes; zero invalid active-note hashes. No private note contents retrieved or data changed.
- Verified deployed search uses top six, semantic threshold >0.5, and a 40%-of-best score filter (correcting the initial report's omission). No vector index exists.
- Existing SHA-256 file sync is incremental. Document embedding/reuse/backfill is missing; same-content explicit saves still rebuild chunks. Model/config invalidation is absent. These require follow-up implementation, not another file hash.
- Fixed duplicate queries within the router's initial plan, preserving different vault scopes. Synthetic regression: three searches reduced to two, with no claim of generation-token savings.
- Added actual evidence-cap/citation regression; 39 focused tests passed. No arbitrary retrieval cap, prompt reduction or pipeline redesign.
- Details, lifecycle findings, cost boundaries and deferred work: [Part II audit](PHASE-1-RAG-AUDIT.md).
