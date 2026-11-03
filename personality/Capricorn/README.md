# Capricorn personality vault

Preferred name: **Capri**. Website name: **Capricorn**.

Open this folder as an Obsidian vault, browse Markdown directly, or open **Personality vault** in Capricorn settings. The website catalog is a read-only generated copy; edit the Markdown and run `node tools/build-capricorn-vault.mjs` to rebuild both the catalog and the runtime core.

- [[00 Evidence/Research report]] — seven requested analysis dimensions, sources and unresolved questions.
- [[00 Evidence/Observation protocol]] — how future video observations become trustworthy records.
- [[01 Core/Always present]] — persistent identity and default settings instruction.
- **02 Construct** — separate Speech, Emotions, Behavior, Expression, Voice and Quirks folders, with 38 detailed adaptation cards.
- **04 Transcript analysis** — 45 source-linked close readings and 7 corrected-ending records, grouped into Speech, Emotions, Behavior and Corrected ending.
- [[00 Evidence/Transcript synthesis]] — the updated seven-part analysis using your supplied dialogue.
- [[03 Engineering/Retrieval map]] — query-to-record map and generated ingest catalog.
- [[03 Engineering/Architecture and validation]] — implemented behavior, retrieval contract and remaining work.

This is a substantial provisional design database, **not thousands of established facts about the character**. The linked video was inaccessible. Every construct card is marked adaptation. Transcript analysis now supports specific speech patterns, with your corrected ending recorded separately. Facial reactions and acoustic qualities still lack direct audiovisual verification. The evidence report explains that distinction rather than hiding it in a footnote.

`ai_enabled: false` deliberately prevents ordinary factual note search from treating these behavioral instructions as evidence about the world. This folder is the editable local database, not a newly provisioned Supabase vault. Every chat turn retrieves guidance from the local catalog before Capri decides whether she needs reasoning or notes. Owner-calibration cards marked server_only stay outside the public vault browser. Personality retrieval requires no cloud database migration.
