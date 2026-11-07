# GPT-OSS / Gemini routing

Defaults: groq:openai/gpt-oss-120b handles first-pass decisions and personality; gemini-3.5-flash-lite handles delegated research routing, searches and reasoning. Simple chat ends at GPT-OSS without Gemini. Existing saved choices are preserved: Settings > Use GPT-OSS 120B + Gemini profile > Save adopts this profile. No 20B default is used.

Optional Cross-check delegated research supports 2–4 reviewers. Default pair: GPT-OSS 120B and Gemini 3.5 Flash-Lite. Each gets at most two completed review passes. A revision invalidates earlier approvals. Every reviewer must approve the same unchanged draft for agreement; otherwise the final answer explicitly reports unresolved uncertainty. Agreement does not prove correctness. Reviewers receive selected evidence and brief prior issue reports, not private chain of thought. Invalid citations are rejected. RAG and resumable general-reasoning reviews checkpoint between passes. Synthesis and retry attempts are additional API calls. Cross-checking is off by default to conserve free quota; enable it in settings.

## Credentials

Settings > Provider API keys accepts keys through an authenticated endpoint. Each is stored in an owner-bound, AES-GCM encrypted, HttpOnly, SameSite=Strict cookie for 30 days, scoped to /api and Secure on HTTPS deployments. Nothing goes in localStorage or source. Per-request async context prevents credential leakage between requests. Configure stable PROVIDER_CREDENTIAL_SECRET, or the existing Gemini key supplies encryption material. Secret rotation invalidates saved cookies. A blank key removes that browser credential. Background workers still use server environment keys. Browser keys are not shared between devices.

Free-only restrictions remain. Groq/NVIDIA require free/trial access confirmation; direct paid Claude/DeepSeek and paid OpenRouter choices remain blocked. NVIDIA's catalog accepted the supplied key (HTTP 200) and listed nvidia/nemotron-3-ultra-550b-a55b. No generation or billing-eligibility test was performed. The key was not saved to disk: automatic approval review blocked durable local storage pending explicit approval. Rotate it because it appeared in chat. Never include real keys in documentation or bundles.

NVIDIA reference: https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3-ultra-550b-a55b

## Limits

Compatible-provider adapters remain text-only. Reviewers see extracted textual findings, not image pixels; Gemini synthesis receives the original attachment. Cross-review does not perform further searches itself, and discloses missing evidence. Auxiliary reminder wording, welcome and Quick Note workers retain their fixed Gemini paths. Live Groq verification requires its key and free-tier confirmation. Changes are local, not deployed.
