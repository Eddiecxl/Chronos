# Chronos — Shared Time Planning App

Chronos is a Malaysia-time planning app for protecting focus, coordinating availability with friends, and running private planning rooms.

## What is new

- A focused **Today** command centre with next-up, progress, free-time, and privacy status.
- Timed quick planning by default, plus all-day plans, editing, completion, duplication, and rescheduling.
- Responsive bottom navigation so Today, Planner, and Lobby stay reachable on phones.
- A responsive **PL-900 Exam Trainer** at `/chronos/trainer`, including the saved 350-question configuration and full-screen mode.
- **落樱仙途**, a complete cultivation text game with separate local and AI journeys, at `/chronos/game`.
- Friend Radar is loaded only when opened; location sharing is explicitly opt-in and can be stopped from Today.
- Server-issued signed sessions protect plans, rooms, social data, and live-location actions. A user can only change their own plans and access confirmed friends’ schedules.

## Run locally

Use the package manager declared by the project:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm run dev
```

Open `http://localhost:5173`.

Without `MONGODB_URI`, Chronos uses `server/data.json` as a local development store. That file is created automatically after the first local account is registered and should not be committed.

## Production configuration

Copy `.env.example` and supply the values for your environment.

Required for production:

```text
MONGODB_URI=mongodb+srv://...
MONGODB_DB=chronos
CLIENT_ORIGIN=https://your-frontend.example
SESSION_SECRET=a-long-random-secret
```

`SESSION_SECRET` signs browser sessions. Keep it private and stable across restarts. You can create an admin account only by setting all three optional bootstrap values:

```text
ADMIN_USERNAME=...
ADMIN_PASSWORD=...
ADMIN_PIN=...
```

Chronos deliberately has no built-in default admin credentials.

## 落樱仙途 game modes

The Game page opens the same-origin game at `/luoying-xiantu/index.html`. Players choose one journey type at the title screen:

- **本地版** is fully offline and choice-only. It never exposes a free-text action box and uses authored plots, battles, cultivation, equipment, alchemy, relationships, and endings.
- **AI 版** accepts free-form actions and supports switching providers without changing the journey. It uses fixed story acts and scene contracts to keep the world moving while allowing broader dialogue, characters, locations, and player choices.

Local and AI saves use separate namespaces and cannot overwrite or load into one another. In both modes, cultivation progress is **灵气**, while techniques spend **灵力**. Status, skill, inventory, relationship, location, recap, and history questions enter **时停**: world time, combat, clocks, and NPC plans do not advance.

AI mode is intentionally pure AI. If a provider times out, rejects a response, or returns invalid story data, the complete world state is rolled back and the player can retry, edit the action, or switch provider. The game never inserts local story text as an AI fallback. Validated facts, entities, chapter summaries, unresolved threads, recent scenes, and the complete transcript are retained for continuity and can be exported with the journey.

### AI providers and privacy

Signed-in players can use site-managed Groq, Mistral, or Gemini through `/api/game/ai`. Groq and Mistral are the recommended defaults; Gemini and the retained advanced providers are available for comparison and testing. A model trial arena tests a provider without changing the formal save, transcript, or world time.

Alternatively, a player can select personal-key mode. That key stays in the current browser memory, is never written to a save or export, and is sent directly to the selected provider. Clearing or reloading the page removes it. Provider free tiers, quotas, and model availability are controlled by their vendors and can change.

For Render, add the following variables in the service dashboard. Secret key values must be entered only in Render, never committed:

```text
GROQ_API_KEY=...
GROQ_MODEL=openai/gpt-oss-120b
MISTRAL_API_KEY=...
MISTRAL_MODEL=mistral-small-latest
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-3.5-flash
```

Any provider without a configured server key is safely disabled while the other providers and local mode remain usable. The server accepts only the supported site-provider identifiers, bounds request sizes, rate-limits each account, applies a 45-second timeout, and returns generic errors without exposing provider response bodies or credentials.

## Publishing checklist

1. Run `pnpm run build` locally.
2. Configure MongoDB Atlas and restrict network access appropriately.
3. Set the API environment values above on Render (or your Node host).
4. Set `VITE_API_URL` on the Vite host to the HTTPS API URL.
5. Set `CLIENT_ORIGIN` to the exact HTTPS frontend origin, then verify register, plan edit, room membership, and location opt-in in a fresh browser profile.

`render.yaml` and `vercel.json` use pnpm and are prepared for this setup. No repository push or deployment is performed by the app itself.

## PL-900 trainer deployment

The published trainer is stored under `public/pl900-trainer`. Its deployed question overrides and custom screenshots are loaded from `public/pl900-trainer/pl900-trainer-config.json`. Update that file from the standalone trainer before rebuilding whenever you want browser-admin changes to become the new website default.

The trainer is embedded only from the same Chronos origin. The server keeps external framing blocked by sending `X-Frame-Options: SAMEORIGIN`.

## Privacy notes

- Friend schedules require a signed-in, confirmed friend.
- Private room history and live room events require room membership.
- Live location is off by default. Only approved friends can retrieve shared signals, and users can stop sharing at any time.
- Local test data is kept separate from production storage.
