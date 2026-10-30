# Current implementation

31 October 2026: User selected Vercel hosting and Supabase, Gemini first, no paid API budget, DeepSeek deferred. Start with the Aria vault; personal vault path D:\Archive\Lumina Records\Lumina Records remains untouched.

Implemented in `web/`: responsive chat UI, owner-only server login via Supabase, six Gemini chat model adapters, optional Gemini Embedding 2 retrieval adapter, keyword/semantic search SQL, source excerpts, persistent conservative quota reservations, and Vercel deployment configuration. Explicit Vercel choice supersedes the Sites publishing workflow.

Verified: six backend tests with mocked providers. Desktop/mobile browser checks passed for initial layout, model list, suggestions, and login gate. No live model calls or cloud database writes were made. SQL migration is prepared but not run or integration-tested. Model availability/IDs must be verified with this account; display names do not guarantee API IDs.

Next: run web/supabase/001_aria.sql in the user's Supabase SQL Editor; configure replacement Gemini API key in Vercel env vars; confirm API project Free tier; deploy with web as Root Directory; verify real login/general chat; seed a non-sensitive note and verify source retrieval. Live SQL/RLS and concurrent reservation tests remain required before private-vault use.

No automated vault import, graph traversal, bulk embedding, cloud-to-local writeback, chat persistence, or DeepSeek calls are implemented. The provider keys pasted in chat are not stored in source or environment files. The publishable Supabase key and owner UUID are included in web/.env.example.
