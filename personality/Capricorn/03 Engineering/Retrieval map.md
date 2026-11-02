---
id: capri.engineering.retrieval-map
kind: implementation-contract
ai_enabled: false
---
# Retrieval map

`retrieval-catalog.json` is a generated, versioned ingest catalog. It contains the actual Markdown records, stable IDs, source IDs, provenance, modules and content hashes. It now also produces web/lib/personality-data.js for the live local retriever. This is weighted keyword RAG, not a semantic index. No embeddings have been generated or uploaded. Rebuild after any source correction; invalidate stored vectors and conversation cache entries whose hashes change.

## Routing examples

| Information need | Retrieve first | Useful contrast | Exclude |
|---|---|---|---|
| How does Capri praise? | T1-C07, C13 | C30 gratitude accounting | Treating praise as unconditional kindness |
| How does she explain technical work? | T1-C20, C23, C32 | T2-E04 repairs | Claims of omniscience |
| How does she manipulate? | T1-C27, C30, C33 | C34 practical reasoning | Assistant behavior that enacts coercion |
| What makes the humor distinctive? | T1-C29, C37, C41 | T2-E04 literalized idiom | Generic cyberpunk slang lists |
| Is she always theatrical? | T1-C23, C35, C45 | T2-E02, E06 | A single maximum-energy response style |
| How does she express curiosity? | T1-C01, C02, C43 | T2-E07 possibility | Assuming curiosity is always innocent |
| What about facial expressions? | Evidence report, observation protocol | Proposed Expression cards | Claims of observed facial motion |
| What about her voice? | Transcript synthesis voice section | Voice design cards, T2-E01 | Numeric pitch/accent guesses |
| Should she say boot up? | T2 correction ledger | T2-E01 | Original T1 ending attribution |

## Chunk contract

Each note is deliberately one behavioral mechanism with its context, analysis and adaptation. Prefer one note per chunk when it fits the selected embedding model. If splitting becomes necessary, repeat the stable ID, source ID, provenance, speaker correction status and title in each child chunk. Keep an excerpt joined to its scope and evidence status. Never detach a fictional threat from the instruction explaining that it is analysis rather than an assistant rule.

Keep source-linked interpretation and assistant adaptation distinguishable at query time. A request to explain the character can retrieve both but should label them. A runtime request to compose a friendly answer should primarily use the core and relevant adaptation cards. Raw transcripts, the original superseded ending, engineering documents and correction ledgers are not ordinary runtime style instructions.

## Metadata and reuse

IDs identify records; content hashes identify revisions. A speaker correction invalidates the previous content even if the filename remains the same. The corrected ending has separate T2 IDs to avoid accidentally reusing an old speaker assignment. No personally identifying chat memories are part of this catalog. General knowledge RAG should not search this personality namespace by default.

Vector search may discover related concepts across module boundaries. Module filtering is a preference, not an absolute rule: an emotional question may need Speech and Behavior evidence. Rerank for provenance, situational fit, contradiction coverage and nonduplication. Return the evidence status to the model, not only the text. Measure retrieval and response quality before adding more records merely to increase size.
