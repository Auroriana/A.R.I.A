# Aria: your private Obsidian knowledge assistant

The starter vault is ready in `vault/Aria Knowledge`. The website in `web/` includes a folder-based notes workspace, linked references, tabbed editing, formatted source excerpts, and resumable research. See [website setup](web/README.md) and [automatic Obsidian sync setup](docs/OBSIDIAN-SYNC.md). The sync installer is prepared; vault pairing and activation are a separate one-time setup.

## Start here

1. Install/open [Obsidian](https://obsidian.md/download).
2. Choose **Open folder as vault** and select `C:\Users\Ataraxia\Desktop\Aria\vault\Aria Knowledge`.
3. Open **Start Here**. It explains the folders, templates, and first notes to create.
4. Follow [the setup plan](docs/SETUP-PLAN.md) for the cloud architecture and implementation milestones.

The recommended first step is to add 20–50 representative notes and 10 real questions. You do not need three million words before testing the system.

## What is prepared

- A local vault with a home page, topic index, four reusable templates, and a local-only private folder.
- A cloud setup plan covering Supabase, Firebase, optional private GitHub backup, model evaluation, and cost controls.
- `config/project.example.json`: proposed settings; only the `audit` section is consumed by the current tool.
- `eval/questions.example.json`: a blank evaluation worksheet for questions and expected sources.
- A dependency-free local audit that reports aggregate Markdown size and rough capacity estimates. It never uploads notes or invokes AI.

## Run the local audit

Node.js 22 or newer is sufficient; Node 24 is installed on this machine. No package installation is needed.

```powershell
Set-Location 'C:\Users\Ataraxia\Desktop\Aria'
node tools/audit-vault.mjs
node --test tests/audit-vault.test.mjs
```

The audit defaults to the new vault. To inspect another folder:

```powershell
node tools/audit-vault.mjs --vault 'C:\path\to\your\vault'
```

Output contains aggregate counts, not note bodies or individual filenames. Excluded folders, hidden entries, symlinks/junctions, and files over the configured size are skipped. Any read/encoding error makes the result incomplete and returns a nonzero exit code. This is a sizing tool, not a Markdown parser, embedding generator, or privacy classifier.

The parent code repository ignores the entire `vault/` directory so future notes are not accidentally included in an app-code push. The starter vault exists locally; it is not backed up yet. Keep a separate backup. An optional separate private GitHub repository is described in the plan.
