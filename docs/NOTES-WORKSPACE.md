# Notes workspace and resumable chat

The main page now hosts the notes workspace at `/#notes`; `/notes.html` redirects there. Aria's black-and-white theme is retained.

- The explorer displays folders first, then notes, with indentation guides, collapsible folders, search, selected rows and no `.md` extensions. Folder paths remain in tooltips and breadcrumbs. Empty folders are remembered in this browser; folders with notes are represented by real Markdown paths.
- Click a note or link to navigate. Ctrl/Cmd-click opens another note tab. Dirty drafts remain in their own tabs and survive refresh in the same browser tab. Closing a dirty note requires an explicit discard. Saving checks the cloud version and preserves your draft on conflict.
- Read, Edit (source beside preview), and Source modes share the same rendering as Aria's source excerpts. Ctrl/Cmd+S saves; Ctrl/Cmd+E switches editing/reading. Nested steps fold; `If yes` and `If no` branches start collapsed. Bold, headings, lists, task lists, tables, inline code, safe color spans and blockquotes render without executing raw HTML. Quoted examples are purple and italic.
- Wikilinks, display labels, aliases, relative Markdown links, headings and block IDs are supported. Type `[[` for suggestions. Missing links can create notes; ambiguous names require a folder. Outgoing References and incoming Linked from links appear above the note. Retrieval sees link targets separately in its evidence context.
- Paste import keeps the exact clipboard text. Clipboard HTML supplies style positions only. Aria format asks Gemini for positions and layout types, never replacement text. A validator rejects invalid ranges and verifies that the original body is unchanged. These optional hints live in `aria_format` frontmatter. Imported styles are also projected into search excerpts without altering the canonical note. Obsidian preserves these custom properties but needs a plugin to interpret Aria-specific layout hints; ordinary Markdown and inline color spans work directly.

## Conversations and research

The latest 10 conversations are stored in IndexedDB, scoped to the signed-in account on that browser. Creating an 11th removes the oldest. They persist across refresh/sign-in, but are not a cross-device cloud chat archive. Pending requests and encrypted checkpoints are saved with their conversation. Attachment data for a pending request is removed when its answer completes.

Both Chat and Vault mode receive previous messages from that conversation. Memory includes up to 160,000 characters / 200 messages; very long older context falls out of the input window, while the saved conversation remains available. Previous answers supply conversational context, not fresh procedural evidence. Current operator corrections take precedence.

Vault research has no fixed total round or search-count cap. It ends when the planner has no new queries. Each browser request performs one search, one planning call, or final synthesis. Checkpoints carry accumulated evidence and are authenticated/encrypted with a key derived from the server's Gemini key, bound to the owner and original request, and valid for seven days. An API-key rotation invalidates checkpoints. Aria advances automatically through successful steps, so research spans multiple hosting request windows. Pause cancels the current step; Resume restarts from the last completed step. Refresh restores the Resume control. A closed browser does not continue research in the background.

Individual Gemini calls can still fail or time out, and genuine provider quotas remain. Resume retries the unfinished step, so a call whose response was lost may consume quota again. No automatic model fallback is used. The latest complete passages fit a bounded model context; all collected sources keep stable citation IDs. Omitted passages cannot be cited without being retrieved into the current context again.

Images and PDFs now reach Gemini as validated `inlineData` in both modes. PNG/JPEG/WebP screenshots under the upload threshold retain their original bytes to keep text legible. Other or larger images use the existing conversion. Four attachments / about 2.8 MB total are supported. Actual reading accuracy depends on image quality and the model.

No new SQL migration is required for these changes. Deploy/restart the updated web app and use the existing vault schema. Automatic vault sync is prepared separately in [OBSIDIAN-SYNC.md](OBSIDIAN-SYNC.md). This is the requested core workflow, not complete Obsidian feature parity: split tab groups, drag-and-drop tab layouts, automatic link rewrites on rename, attachment sync and Obsidian-specific plugins are not implemented.

## Validation

The Node suite covers reference resolution, exact-text preservation, layout validation, retrieval beyond the former limit, checkpoint tampering/isolation, screenshot delivery, conversation retention, pagination and sync mapping validation. `node web/tests/workspace-browser.cjs` checks the actual browser workflow against a local fixture server, including resumed requests after reload, source formatting, imports and mobile width. It uses the existing bundled Playwright/Chrome paths. Provider/database responses are mocked; deployment, real Gemini OCR and the Windows scheduled task have not been exercised live by this change.

Reference behavior was checked against [Obsidian links](https://obsidian.md/help/links), [tabs](https://obsidian.md/help/tabs), [formatting](https://obsidian.md/help/syntax), and [Gemini image input](https://ai.google.dev/gemini-api/docs/image-understanding).
