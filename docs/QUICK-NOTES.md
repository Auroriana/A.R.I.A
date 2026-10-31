# Quick Note implementation and activation

## Moving notes and the simpler interface

Run `web/supabase/010_note_moves.sql` after 008 before deploying this update. Update/restart your local sync agent from this repository as well. No new environment variables are needed.

Quick Note now has a compact composer and history list. Right-click a filed note (or use its `⋯` button) and choose **Move to…**. Select any of your vaults, then choose a folder or type a new folder path. Manual filing does not require automatic-filing opt-in. The Notes explorer and open note tabs have the same right-click action. Drag notes or tabs onto an explorer folder or **/ Vault root** to move within the current vault. The destination expands and selects the moved note. Save unsaved drafts before moving; collisions and concurrent edits are rejected without overwriting another note.

Use the sidebar button above the editor to collapse/expand the left explorer, drag its right edge to resize it (or focus the divider and use arrow keys), and use the expand-all/collapse-all buttons for folders. Desktop width and collapse preference persist in this browser. On mobile the explorer opens as an overlay.

Moves preserve the note ID and text, update its search chunks, and leave a source-path move marker in one database transaction. Quick history follows the same note ID. Returning the same note to its previous location is supported; unrelated existing/deleted filenames are protected. Explicit Markdown links are left as written; review path-based/relative links after changing folders or vaults.

The updated sync agent recognizes the move marker. It archives an unchanged old local copy in the vault’s hidden `.aria-moved` folder and pulls the destination through its normal sync. Locally edited old copies remain untouched and report a move conflict; copy those edits into the destination before manually retiring the old file. Both vaults need local sync pairing for a cross-vault move to appear in both Obsidian vaults. Older sync clients cannot re-upload moved source paths; they report a save failure until updated. Ordinary deletions keep the existing conservative sync behavior.

## Refined plan

- `008_quick_notes.sql` adds an owner-readable queue, per-vault filing opt-in, and a dedicated Unsorted vault. It is safe to rerun, including when a personal vault is already named Unsorted.
- One active lease per owner serializes model calls across cron and browser kicks. Claims use a transaction advisory lock plus `FOR UPDATE SKIP LOCKED`. An expired lease is replaced after five minutes; old workers cannot finish/fail the replacement's job.
- `aria_quick_finish` calls the existing `aria_save_note` **inside the same transaction** that marks the job filed. This replaces the proposed two-request save/finish sequence and recovery scan: a lost response cannot leave an unrecorded saved note. Filename conflicts use suffixes without another model call. Deleted note paths are not overwritten.
- Enqueue deduplicates by owner and client key; reusing a key with different text is rejected. Deleting pending/failed history keeps an idempotency tombstone, so late browser retries cannot resurrect it. Processing jobs cannot be deleted mid-save.
- Folder maps contain opted-in vault names/descriptions and up to 80 folder paths per vault, three levels deep. No existing note titles or contents go to the model. Private, template, attachment and archive folders are excluded at every level. The fallback vault is always eligible.
- The worker pins the existing planner model, reserves quota, makes one call per attempt, validates output, and composes frontmatter itself. Confidence below .75, malformed/truncated output, unsafe paths or disallowed destinations route to Unsorted with the original and no untrusted expansion. New folders require confidence at least .90. Generation/network failures retry with backoff; quota refusal/429 stops that run and waits 15 minutes. Five failed/interrupted attempts require manual Retry.
- The original request text remains exact in the queue and in the initially filed note. Later manual editing and the existing Obsidian sync/editor can normalize Markdown line endings. The immutable original remains available in Quick history.
- History follows an original note ID, or a moved note carrying the same frontmatter ID after the original is deleted. Copying a note retains that marker; if the original is deleted and several copies exist, history chooses the most recently edited live copy. AI toggles check the displayed version and save with optimistic concurrency; chunks are rebuilt by the existing save function.
- The client persists an account-scoped outbox before clearing the composer; browsers with Web Locks serialize storage updates across tabs. The same send key survives network errors and reloads. Only server-confirmed jobs can progress while the app is closed. History pages contain 50 notes; polling runs while Quick is visible.

## Activate on Supabase and Vercel

1. Run `web/supabase/008_quick_notes.sql` in your project's SQL Editor after 007. It uses the same owner UUID as the existing migrations.
2. Set Vercel server environment variables: `QUICK_WORKER_SECRET`, `ARIA_EMAIL`, and `ARIA_PASSWORD`. The email/password must sign into the existing Supabase owner account. Existing Gemini and Supabase settings are still required. This keeps the owner password in Vercel's server environment; no service-role key is used.
3. Generate a secret locally with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Keep it in your password manager and the two secret stores, never in source control.
4. Deploy the updated `web` app. In Supabase Vault, create secrets named `aria_quick_worker_url` (the production `https://YOUR-HOST/api/quick-worker` URL) and `aria_quick_worker_secret` (the same value as `QUICK_WORKER_SECRET`). Enable Supabase Vault if it is not already available.
5. Run `web/supabase/009_quick_cron.sql`. It enables pg_cron/pg_net and schedules the queue check every minute. Rerunning replaces the named job. An empty queue makes no HTTP request. Only the SQL administrator can execute the tick function.
6. Open each eligible vault's description dialog, give it a useful description and enable Quick Note filing. All ordinary vaults default off. Unsorted always accepts fallback notes. New cloud vaults need their own local pairing if you want them synced into Obsidian; see `docs/OBSIDIAN-SYNC.md`.

The worker URL must be reachable from Supabase without a Vercel deployment-login page. Keep its bearer-secret check enabled. With the secret loaded into your local environment, a PowerShell smoke check is:

```powershell
Invoke-RestMethod -Method Post -Uri 'https://YOUR-HOST/api/quick-worker' `
  -ContentType 'application/json' `
  -Headers @{ Authorization = "Bearer $env:QUICK_WORKER_SECRET" } -Body '{}'
```

Expected: JSON containing `filed`. A missing/wrong secret returns 403; a redirect/HTML page indicates hosting protection is intercepting the worker. Do not put the secret in the URL.

## Verify live

- Submit a non-sensitive note with an obvious destination, then an ambiguous one. Inspect both originals, destinations and AI-off status. No enabled ordinary vaults should still produce an Unsorted note.
- Submit, wait for server confirmation, then close the browser. Confirm filing from another session after a minute or two. This verifies the actual cron/network/auth path rather than just browser kicks.
- Test a send with network access disabled. It must remain visibly in the local outbox and resend under the same key after reopening/reconnecting.
- Turn AI search on and off. Check search results and Obsidian sync; test an intervening editor save to see a conflict instead of an overwrite.
- Inspect Supabase `cron.job_run_details` and `net._http_response` for job/HTTP failures. Never expose decrypted Vault secrets in diagnostic screenshots or logs.

The 45-second worker budget limits when it starts another job, not an in-flight provider call. The existing Vercel function ceiling is 300 seconds; each Gemini call is capped at 45 seconds and each database request at 15 seconds. Hosting limits, project pauses, Gemini availability and free-tier terms still depend on the deployed accounts. The pinned model ID is inherited from this app; access must be verified with the real Gemini project.

Text submitted to Quick Note and the eligible folder map are sent to Gemini even though the resulting note's AI-search flag starts off. Do not mistake search-off for a restriction on processing the submitted capture.

## Local verification

```powershell
npm test --prefix web
node web/tests/quick-browser.cjs
npm install --prefix .local/quick-test --no-save --package-lock=false --ignore-scripts @electric-sql/pglite
node web/tests/quick-sql.mjs
```

The optional browser test uses Playwright/Chrome (override `PLAYWRIGHT_PATH` and `CHROME_PATH` on other machines). The optional SQL test uses a disposable local PostgreSQL runtime with the existing save/delete functions and owner/RLS fixtures. Neither requires production credentials. It checks migrations, queue claims, stale leases, opt-in, idempotency, atomic filing and history; it does not emulate Supabase Auth, pg_net, cron scheduling or simultaneous independent PostgreSQL connections.
