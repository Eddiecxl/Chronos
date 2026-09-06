# Chronos AI reliability — 2026-09-07

Scope: keep the standalone repository unpublished. Fix the existing Chronos game first.

1. Add an explicit official OpenAI provider (GPT-4.1 mini default for cost-conscious testing; GPT-5.4 mini and GPT-5.6 Terra selectable). Preserve Groq, Gemini, existing journeys and personal-key mode. Website mode requires a separately configured server key; never imply ChatGPT subscriptions supply API credits.
2. Distinguish transient rate limits, exhausted balance, invalid credentials, unavailable models and narrative validation failures. Respect real retry deadlines, do not loop requests, and do not replace AI story with local content.
3. Keep personal keys isolated by provider in volatile memory. Never persist or publish keys.
4. Test transport and failure handling before implementation; run continuous real-provider journeys, report both failure rate and latency, and do not equate mock tests or a successful connection ping with playable storytelling.
5. Publish verified improvements only to Chronos. No new-repository push or Cloudflare deployment until continuous play has been demonstrated. OpenAI live acceptance needs the owner's funded API access; do not buy credits or claim untested providers are verified.
