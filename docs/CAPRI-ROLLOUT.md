# Capri rollout and acceptance checks

## Database and deployment

1. In the existing Supabase project, check that migration 012 has been applied. Quick Notes use the personality column on aria_quick_notes and the four-argument aria_quick_enqueue function.
2. Run `web/supabase/013_chats_welcome.sql` in that project's SQL Editor. It reuses the existing owner check, adds versioned chat storage and a welcome-line pool, restricts writes to authenticated owner RPCs, and refreshes the Data API schema. It can be run twice.
3. Deploy the updated web directory to the existing Vercel project. The change uses existing environment variables. The Obsidian sync agent needs no update.
4. Open each browser that has old chats and sign in. Leave it online until the history has synced. Previously local chats become eligible for upload when that browser runs the new version. The sidebar keeps the ten most recent conversations across devices. Attachments, resume checkpoints and unfinished replies remain on the originating device. A chat exceeding the approximately 1 MB sync request limit stays local and shows a sync error.

## Check the live result

- Open the app on two devices. Both should start in empty chat. Complete a turn on A, then foreground B. Open the sidebar entry on B and continue it. Return to A and check both the words and the expression. Delete the chat and check the other sidebar again. Sync also runs roughly every 30 seconds while chat is visible.
- Introduce someone and then comment on Capri's greeting. Check that the second line addresses the current speaker. The token panel should show one personality call for a direct reply. The personality details identify the retrieved records. Try the eyes offer and a rough-shift conversation and judge the actual wording against the owner's examples.
- Ask about a specific saved note. Check the answer against its cited passage. Pause and resume research on its originating browser. The final reply should be in Capri's voice with a separate expression cue.
- Save a Quick Note containing a question, a date and a number. Check that Expanded documents the question and retains the date and number. Open a new chat and use New welcome lines in settings to check the greeting pool.

## Extending the sprite and voice

The model chooses a named expression. The server validates it, and the browser stores it on the completed message. The eyes renderer sets data-expression on capri-face and emits a bubbling capri-expression event with detail.expression. A future sprite can subscribe to that event. A voice player can animate the mouth from its own playback timing while retaining the eyes selected for the reply.

Edit the Markdown under personality/Capricorn and rebuild with `node tools/build-capricorn-vault.mjs`. Keep owner calibration distinct from attributed transcript dialogue. Mark private performance cards server_only so they stay out of the public vault viewer.
