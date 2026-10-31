# Automatic Obsidian sync

The website and Obsidian both edit Markdown. A local background agent connects explicitly paired folders to cloud vaults. The website cannot access a local drive on its own. Obsidian does not need to be open, but the PC and agent must be running to sync. This setup is prepared; it does not enroll personal vaults or install a task automatically.

1. Copy `config/sync.example.json` to `.local/sync.json`. Add one pair for each vault using its absolute folder path and its cloud vault name. Set `createCloudVault` to `true` only for vaults you want created. Duplicate pairs and nested vault folders are rejected.
2. Keep `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `OWNER_USER_ID`, `ARIA_EMAIL`, and `ARIA_PASSWORD` in `.local/sync.env`. Both `.local` files are ignored by Git. Use your owner account; no service-role key is required.
3. Preview all pairs once from the repository root:

   ```powershell
   node --env-file=.local/sync.env tools/sync-service.mjs --once --dry-run
   ```

4. After checking the plan, run the one-time installer:

   ```powershell
   powershell -NoProfile -File tools/install-sync.ps1
   ```

The per-user Windows task runs hidden at sign-in. Local changes trigger a debounced scan, and polling checks both directions every 30 seconds by default. Errors are retried on later cycles; logs and last results are in `.local/sync-service.log` and `.local/sync-status.json`. The web explorer checks cloud changes every 15 seconds while Notes is visible. Dirty drafts are preserved if an external edit arrives.

Each vault has independent three-way sync state. Conflicting changes keep the local note and save a separate web copy under `.local/aria-conflicts/<vault id>/`. Resolve deliberately with the existing `sync-vault.mjs --resolve "Folder/Note.md=local|web"` command, including `--vault`, `--cloud-vault` and `--apply`. Stop the scheduled task while resolving conflicts. Never erase sync state to bypass a conflict.

Notes remain normal `.md` files with Obsidian links. Standard Markdown and safe inline color spans render in both apps. Aria's optional layout hints are stored in `aria_format` frontmatter; Obsidian preserves that property but does not interpret it without a plugin. The original body is unchanged. Empty web folders are browser-local until they contain a note. Attachments, `.obsidian` settings, hidden files, `98 Private` and `80 Templates` are excluded by the existing sync rules. Cloud deletion is conservative and may restore a remaining local copy; this is not a destructive mirror.

Pause: `Stop-ScheduledTask -TaskName 'Aria Obsidian Sync'`. Resume: `Start-ScheduledTask -TaskName 'Aria Obsidian Sync'`. Uninstall: stop it, then `Unregister-ScheduledTask -TaskName 'Aria Obsidian Sync'` (Windows asks for confirmation). Edit `.local/sync.json` and restart the task when changing pairs. Back up the vault independently.
