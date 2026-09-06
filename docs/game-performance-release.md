# Game performance release — 2026-09-07

The AI game now shows elapsed time and generation/validation/repair stages, allows the player to keep drafting while waiting, and provides cancellation. World state is committed only after validation; an aborted or failed generation cannot advance the story. A turn has a 45-second generation deadline, a client request a 28-second budget, and the server a 25-second budget shared across its attempts.

Site requests no longer retry an already-retrying proxy. Quota errors immediately return a retry estimate. Transient 502/503 errors receive at most one short retry. Content validation permits one repair. GPT-OSS uses low reasoning with sufficient completion space; personal and site modes share generation parameters. Prompt JSON sections remain intact, recent world turns are bounded, duplicate repair payloads are removed, and committed world clues remain available to memory retrieval. Current time and protagonist identity are included explicitly.

Typography uses installed Chinese UI fonts, 16px narrative/input text and 12px minimum helper text. The scaled cover layout was replaced with responsive spacing. Static SVG artwork provides a lightweight animated protagonist and five location treatments derived only from the current location. Reduced-motion preferences, a manual motion toggle, hidden-tab pausing and system-panel pausing are supported. Only recent transcript turns are rendered in the main log; full history and export remain available.

Groq and Gemini official base addresses are visible and prefilled. Custom addresses survive reopening settings. Existing saves and the two gameplay modes retain their storage keys.

Verification: 216 Node tests; desktop 1440×900 and mobile 390×844 browser checks for settings, cancellation, draft preservation, quota failures, system queries, seven equipment slots, and reload recovery. Live Groq 120B samples: opening 1.4–1.5 seconds; an ordinary action 2.1 seconds, one request, two committed memory facts. These are individual samples, not a latency guarantee. Free-provider limits and Render cold starts still affect availability. No AI keys are included in source or artifacts.

Run `npm test` and `npm run build`. Optional browser check: set `PLAYWRIGHT_MODULE` to a Playwright module URL, then `node scripts/game-browser-check.mjs`. Optional live, billable single-turn check: `node --env-file=.env scripts/game-ai-benchmark.mjs groq --world`.
