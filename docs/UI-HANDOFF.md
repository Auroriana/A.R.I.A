# Capri styling handoff

Start with `UI-STYLES.md`: it collects **all CSS files and all page HTML, including inline styles, in one document**, with original file paths. This is a generated reference; edit the named source files and rerun `node tools/export-ui-handoff.mjs` to refresh it. `artifacts/capri-handoff.zip` contains the full application source, assets, tests, configuration examples and docs needed by another AI. It excludes credentials, synced personal vaults, local test output, dependencies and Git internals.

## Running and editing

- Node.js 22+. From the extracted folder: `npm ci --prefix web`, then `npm run dev --prefix web`.
- Copy `web/.env.example` to `web/.env.local` and supply your own environment values for live data. Never place secrets in frontend files. The mocked browser regression runs without live accounts: `node web/tests/chat-refinement-browser.mjs` (Chrome or `CHROMIUM_PATH` required).
- Main entry: `web/public/index.html` + `shell.js`. Other entries: `notes.html`, `import.html`, `personality-vault.html`. This is plain HTML/CSS/ES-module JavaScript; there is no React build.
- Backend: `web/api/index.js`, feature modules in `web/lib`, schema and migration instructions in `web/supabase` and `web/README.md`. Frontend requests stay on `/api/...`.
- Main-page cascade: inline base CSS, then `workspace.css`, `quick.css`, `core-settings.css`, `mirage.css`, `capri-scene.css`, `capri-black.css`, `agenda.css`, `conversation.css`. Later styles override earlier ones. Keep ordering when changing the theme. Standalone pages have their own listed stylesheets.

## UI ownership map

| Feature | Markup / behavior | Styles |
| --- | --- | --- |
| Chat, composer, menus, paced replies | `index.html`, `shell.js`, `conversation-flow.js`, `message-blocks.js` | Base inline CSS, `conversation.css` |
| Character appearance, avatar and expression | `expression.js`, image/SVG assets in `public` | `capri-scene.css`, `capri-black.css` |
| Terminal windows and retrieved passages | `terminals.js`, `scan-path.js` | `conversation.css`, `mirage.css` |
| Notes editor, tabs, explorer, rendering | `workspace.js`, `editor.js`, `note-renderer.js`, `note-model.js` | `workspace.css`, `notes.css` |
| Imports / Quick Note | `import.html`, `import.js`, `importer.js`, `quick.js` | `import.css`, `import-theme.css`, `quick.css` |
| Model settings and prompts | `core-settings.js` | `core-settings.css` |
| Reminders and notifications | `agenda.js`, `capture.js`, `notifications.js`, `sw.js` | `agenda.css`, `conversation.css` |
| Personality vault viewer | `personality-vault.html`, `personality-vault.js` | `personality-vault.css` |

## Behavior to preserve when restyling

The `id` and `data-*` attributes are JS hooks. The composer sends immediately; consecutive messages arriving during an active response can be batched into the next turn. Capri chooses response boundaries in a `messages` array; the client paces these bubbles. Do not mechanically split code, lists or sentences.

Message action buttons are hidden on desktop until hover or keyboard focus. Keep touch controls accessible. The open three-dot menu contains references, web research, reminder metadata and usage; these must not reappear as under-bubble links. The spoken bubble strips source/sprite labels while original citations remain available to evidence checks and metadata.

Reminders are persisted by the API before confirmation. Missing times are asked for in chat. Browser notifications require the user to enable notifications; sound requires an interaction to unlock audio, and OS/browser mute/Do Not Disturb still applies. Closed-app reminders additionally need VAPID keys, the existing push schema, and a working reminder worker/cron. Ordinary reply generation currently runs while the client remains active, not as a closed-app background job.

Keep note text unchanged by visual formatting, all focus indicators, narrow-screen overflow behavior, reduced-motion support, keyboard access to menus, source provenance, pending/retry state and sync IDs. Use generated assets already included; do not assume a filename exists without checking the bundle.

## Validation

`npm test`, `npm test --prefix web`, and `node web/tests/chat-refinement-browser.mjs`. Check at 1440px and 390px, with touch and keyboard. Verify a normal reply, multiline/code content, hover actions, expanded references/usage, missing-time reminder, mixed reminder plus notes request, quota retry, reload mid-delivery, and the notes workspace. No deployment is performed by exporting this handoff.
