# Provider allocation — earlier evaluation notes

Superseded by [the GPT-OSS / Gemini routing profile](TANDEM-ROUTING.md). The table below records the earlier evaluation proposal; current defaults use GPT-OSS 120B for initial routing and personality, with Gemini 3.5 Flash-Lite for delegated research and reasoning.

| Task | Starting choice | Candidate to evaluate |
| --- | --- | --- |
| Routing, task splitting, search decisions | Gemini 3.5 Flash-Lite | Groq GPT-OSS 20B, then 120B |
| Short extraction and search planning | Existing Flash-Lite | Groq GPT-OSS 20B |
| Difficult text synthesis and checking | Existing selected Gemini | Groq GPT-OSS 120B; NIM model after confirming free allowance |
| Capri voice | Existing personality model | Blind comparison with Groq 120B |
| Attachments | Gemini or explicitly enabled Claude | New compatible adapters are text-only for now |
| Web grounding | Existing Gemini search | Separate search backend evaluation; plain completions do not provide verified search |
| Saving reminders and notes | Deterministic persistence | No model should claim success without receipts |

## Integration delivered

Core settings now has an independent Routing core selector. Groq, NVIDIA hosted NIM, DeepSeek and OpenRouter use a shared text chat-completions adapter; Claude keeps its native Messages adapter. Current Claude and DeepSeek IDs are seeded, and authenticated model discovery refreshes catalogs from all five providers (Claude pagination included). This supports available API catalog models, not retired checkpoints or every model-specific feature. Provider catalogs can include non-chat models: those are not guaranteed compatible with text completion.

Set server-only GROQ_API_KEY, NVIDIA_API_KEY, DEEPSEEK_API_KEY, OPENROUTER_API_KEY, or ANTHROPIC_API_KEY. Never paste keys into chat or frontend source. Claude additionally requires CLAUDE_API_ENABLED=true. Free-only mode is on unless CAPRI_FREE_ONLY=false is explicitly set. In free-only mode, direct Claude/DeepSeek and paid OpenRouter selections are blocked. OpenRouter allows only :free variants or openrouter/free. Groq and NIM additionally require GROQ_FREE_TIER_CONFIRMED=true or NVIDIA_FREE_ACCESS_CONFIRMED=true after checking account billing/trial limits. This policy does not independently verify provider billing status. No cross-provider automatic paid fallback exists.

The integration is exposed in Core settings; the main chat picker and auxiliary note-formatting, segmentation, reminder wording, welcome and Quick Note jobs retain their current Gemini paths. Existing Gemini account/free-tier checks still apply there. New adapters return full completions rather than token streaming; the outer API keeps heartbeat/progress support. Input/output usage is normalized; hidden reasoning text is never returned as the answer. Model-specific tool calling, image/PDF translation, reasoning-effort tuning, dedicated per-provider usage reservations and universal model-chosen allocation remain follow-up work.

## Evaluation before changing defaults

Use the same 30–50 requests, context and output schema for all candidates: vague reminder, reminder plus poetry lookup, follow-up time, negation/quoted commands, personal-note opinions, fresh web facts, already-answered follow-ups and ambiguous references. Measure routing accuracy, missing tasks, valid JSON, false action confirmations, latency and tokens. Choose the smallest free model that passes these cases, not by parameter count. Account limits and current access must be checked with the user's keys before activation.

Sources checked 2026-11-07: https://console.groq.com/docs/models ; https://console.groq.com/docs/rate-limits ; https://platform.claude.com/docs/en/models/overview ; https://api-docs.deepseek.com/quick_start/pricing ; https://docs.api.nvidia.com/nim/reference/llm-apis ; https://openrouter.ai/docs/guides/routing/model-variants/free

