# Unified Capri conversation

The chat is now one conversation. The interface uses Capri’s black, green, and red palette, her supplied avatar, a camera placeholder, a voice-message placeholder, photo/PDF attachment, and the supplied Overclock icon beside the microphone. Overclock controls the existing deep-research budget. Camera and voice capture/transcription/playback are intentionally not implemented yet.

## Activation

Apply `web/supabase/migrations/20261106062904_conversation_stream.sql` **after** the existing migrations through `016_reminder_cron.sql`, then deploy the updated API and public files together. The SQL was created with the Supabase CLI and tested in local PostgreSQL via PGlite; it has not been applied to a live project by this change. The repository’s older numbered SQL files remain in their original directory; do not run a fresh automatic migration push against an empty database with only the new `migrations/` directory.

The migration copies all retained server conversations without deleting their source rows. Existing browser conversations are imported once, scoped to the account. Conversations already removed by the old ten-chat retention cannot be recovered from those tables; any separate History vault archives remain intact. A compatibility trigger mirrors writes from older clients into the new stream.

## Message storage and delivery

- `aria_messages` stores individual messages, indexed by owner and sequence. `GET /api/messages` reads 40 records using `before` or `after` cursors. Updates advance the sequence so other devices receive edits. IDs prevent duplicate messages during retries. The client loads older pages only on demand and keeps model context bounded separately from the visible history.
- IndexedDB keeps a durable outbound queue and a bounded recent cache, plus the local unfinished-reply state. Sync transmits only portable changed messages, in batches bounded by message count and UTF-8 byte size. Account checks prevent a late network response from populating another account’s conversation.
- Due reminders become `reminder.due` messages before push transport is attempted. Quick-note filing atomically creates a `note.filed` message containing its note link. Both can arrive while foreground research is running. Polling runs every 30 seconds when visible and on focus/online; normal local writes trigger an earlier sync.
- The existing authoring model chooses `messages: string[]` boundaries, including one-word responses or longer Markdown blocks. There is no added model call just to split text. Older single-answer responses remain supported. References remain linked to the original turn across its bubbles.

This remains a **single-owner application**, matching the existing authenticated-owner guard. The message schema is owner-partitioned, but a public multi-user product also needs enrollment, worker credential changes, per-owner resource quotas, and operational load testing. The retained message list grows as a user explicitly loads more pages; the UI does not yet virtualize an arbitrarily long loaded transcript. The database and initial network load do not fetch the whole history.

## Notes and reminders

Explicit note and reminder requests work in the main chat. A missing reminder time becomes a chat question; the pending reminder survives reload. Relative durations, today/tomorrow with a clock time, a standalone AM/PM time, and ISO local dates are supported. Ambiguous dates are not silently guessed. The user can keep chatting while a queued note is filed; its message badge opens the note or its status/retry controls.

There is no Search Notes switch. Capri’s existing turn router selects vault retrieval when saved information is relevant and regular chat when it is not. Current reminder questions use live server records through the agenda route. Historical reminder questions use the searchable Reminders vault.

Reminder overviews are generated Markdown notes in a dedicated **Reminders** vault, under `Overviews/YYYY-MM-DD/`. Every distinct state gets an immutable snapshot with a UTC generation timestamp and the requested display timezone. Repeated reads of the same daily state reuse the existing note. Saves, completions, opening checks, direct overview requests, and the reminder worker maintain snapshots. The overview includes today’s items, completed items due today, and all pending reminders. Snapshots are AI-enabled so RAG can find them. Creation can fail if the existing vault limit is reached; the reminder itself remains saved, and the interface reports the archive failure.

The reminder popup and its notification-settings entry point have been removed. Existing push subscriptions remain active; the full overview lives in Notes. No scheduled random proactive chatter or pattern-based schedule inference has been added.

## Terminals

`mountTerminals()` exposes `open`, `read`, `finish`, `show`, and `clear` for future activity types. Desktop opens a 50/50 split. Mobile keeps the full-width conversation beneath a hideable overlay. New windows choose randomized bounded positions and announce their arrival with red lightning. They can be dragged, resized, minimized, expanded, or selected from the focus menu. Resize observers keep their controls inside the available surface. Hiding the panel is respected until it is reopened.

Only matched notes create retrieval terminals. Evidence events describe which passages actually enter the model context; reading/accessed notes are green and omitted notes are red. Multiple passages from the same note are grouped, so a partially read note is not mislabeled as wholly skipped. Capri’s eye moves among the evidence terminals, alongside a reading cursor, status animation, animated clock, and text reveal. These are presentation effects over real activity events, not model thought streams. Eight live windows bound animation work; older documents remain accessible through citations and Notes. Reduced-motion preferences disable decorative motion.

## Notifications and future mobile integration

`notification-events.js` defines a versioned transport-neutral envelope (`type`, stable event/message IDs, timestamp, title/body, and an internal destination URL). The in-app database message is independent of browser push configuration. The browser adapter uses the existing VAPID subscription flow; per-device receipts stop a successful device from being sent the same retry intended for a failed device. Fan-out concurrency is bounded. Expired subscriptions are removed, and database leases exclude concurrent claims.

Native iOS APNs and Android FCM adapters are **not implemented**. They should accept this envelope and provide device registration, credentials, invalid-token cleanup, and delivery receipts using the same stable message ID. A 75-second push budget bounds worker fan-out, and unstarted jobs release their leases for the next invocation. Delivery is at least once: a crash after provider acceptance and before recording the receipt can still duplicate a notification. Clients should collapse notifications by message ID. Production delivery still requires the existing authenticated worker/cron configuration; browser polling alone does not run while the app is closed.

## Validation

- `node --test web/tests/conversation.test.mjs` exercises parsing, model-authored bubbles, timezone overviews, merging, and push retries.
- `node web/tests/conversation-sql.mjs` exercises repeatable migration, legacy import, paging, edit sync, RLS/owner isolation, idempotency, leases, per-device receipts, and atomic note-completion messages.
- `node web/tests/conversation-browser.mjs` exercises the main chat flows with deterministic API fixtures in Chrome. Set `CHROMIUM_PATH` outside the default Windows installation. It writes desktop and mobile screenshots into `.local/`.
- The wider web unit suite currently has five failures also present in the original checkout: the personality catalog count, HTTP follow-up cache, and three research-budget/evidence tests. These were not silently weakened or removed. The tests affected by the intentional automatic-routing and evidence-event changes were updated to their new contracts.

Live model quality, push delivery on a real iPhone, and production-scale throughput still require deployment and device testing.

## November 7 chat refinements

The composer remains available while Capri works. User messages enter a fixed 60-second collection window starting with the first message; further messages inside that window share the model request, with explicit message boundaries. Later messages start another window. Explicit write operations are processed separately so different reminders/notes retain their own idempotency keys. Attachment and request-size limits can also split a batch.

The authoring model returns messages plus delaySeconds (0–900). Its instructions favor immediate or short delays, reserve longer waits for rare casual cases, and make urgent replies and action confirmations immediate after processing. A response arriving while earlier replies await delivery joins their delivery window. Already composed replies are supplied as context so Capri can avoid repetition. These are chosen delays, not measured probability guarantees.

Queues, unfinished work, and generated delayed replies persist in account-scoped IndexedDB. **This is browser-side scheduling:** the page must be running to process/deliver on time; suspended or closed tabs resume overdue work when reopened. This does not yet provide a server worker for delayed ordinary chat, or cross-device takeover of its local queue. Reminder delivery still uses the existing server worker. A model failure retains Resume reply for the failed turn.

Recent messages render from the browser cache after authentication, before background settings/vault/reminder sync. The cache contains up to 120 messages. Model context independently fetches up to 120 recent server messages, supplemented by loaded history within the existing 200-message / 160,000-character budget; scrolling is no longer required to include recent context. Reply quotes and pending unsent responses are included. Background sync updates changed bubbles instead of clearing the transcript.

Message groups use rounded outer corners, tight joins, and an avatar on the final incoming bubble. Hover/focus the three-dot menu (always available on touch) for date, time, token number, and Reply. Notes/reminders use corner icons. Progress uses three animated typing dots. Reminder facts pass through the personality formatter instead of printing the overview note; the saved note remains accessible from the icon.

Capri can choose public web search on a turn, with no approval or mandatory vault-first lookup when Web search is set to Capri decides (the new default, migrated once for existing browser settings). Search is a separate Google Search grounding call, independent of the selected speaking model. WEB_SEARCH_MODEL can override the default gemini-2.5-flash; tool/model compatibility failures can fall back to gemini-3.5-flash-lite. Invalid keys, quota failures, unavailable grounding, and empty sources are passed back to the personality formatter as failure evidence. They never become fabricated search results or unsupported claims that payment is required. Provider quotas and context limits still apply.

Validation: node --test web/tests/chat-refinement.test.mjs and npm run test:chat:browser --prefix web. The browser fixture advances a controlled clock and checks batching, two pending responses delivered together, reply context, reminder voice, no dialog, incremental sync, reload, and desktop/mobile layouts. The older conversation-browser fixture describes the previous immediate-send UI; use the new chat browser fixture for the refined flow. A real local search attempt on November 7 was rejected with an invalid API key; live provider search remains unverified until valid credentials are configured. No credentials are included in logs or this document.
