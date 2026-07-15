# Chronos — Shared Time Planning App

Chronos is a Malaysia-time planning app for protecting focus, coordinating availability with friends, and running private planning rooms.

## What is new

- A focused **Today** command centre with next-up, progress, free-time, and privacy status.
- Timed quick planning by default, plus all-day plans, editing, completion, duplication, and rescheduling.
- Responsive bottom navigation so Today, Planner, and Lobby stay reachable on phones.
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

## Publishing checklist

1. Run `pnpm run build` locally.
2. Configure MongoDB Atlas and restrict network access appropriately.
3. Set the API environment values above on Render (or your Node host).
4. Set `VITE_API_URL` on the Vite host to the HTTPS API URL.
5. Set `CLIENT_ORIGIN` to the exact HTTPS frontend origin, then verify register, plan edit, room membership, and location opt-in in a fresh browser profile.

`render.yaml` and `vercel.json` use pnpm and are prepared for this setup. No repository push or deployment is performed by the app itself.

## Privacy notes

- Friend schedules require a signed-in, confirmed friend.
- Private room history and live room events require room membership.
- Live location is off by default. Only approved friends can retrieve shared signals, and users can stop sharing at any time.
- Local test data is kept separate from production storage.
