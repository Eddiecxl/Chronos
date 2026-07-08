# Chronos — Shared Time Planning App

A shareable Malaysia-time availability planner built with React, Vite, Node.js, Express, and MongoDB.

## Run locally

The easiest method on this computer is to double-click **Start Time Planning App.bat** and keep its terminal open.

Or run:

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. Without `MONGODB_URI`, development data is stored in `server/data.json`.

## Sharing

Enter your name, add Busy, Free, or Gaming blocks, then select **Share with friends**. The copied link opens a view-only schedule, for example:

```text
https://your-project.vercel.app/?view=Eddie
```

All entered and displayed times are Malaysia Time (`Asia/Kuala_Lumpur`, UTC+8).

## MongoDB data model

Chronos initializes these Atlas collections automatically when the API starts:

- `accounts` — credentials are salted and hashed with scrypt; raw passwords and PINs are never stored.
- `friendRequests` — pending, accepted, and rejected social requests.
- `rooms` — persistent lobby rooms that only their creator can delete.
- `messages` — room conversation history.
- `plans` — user schedules.

MongoDB automatically removes room messages 30 days after `createdAt` through the `delete_messages_after_30_days` TTL index (`expireAfterSeconds: 2592000`). TTL deletion is asynchronous, so an expired document may remain briefly before Atlas removes it.

## Production architecture

- **Vercel:** React/Vite frontend
- **Render:** Node.js/Express API
- **MongoDB Atlas:** shared persistent database
- **GitHub:** automatic deployments to Vercel and Render

### 1. MongoDB Atlas

Create an Atlas cluster and database user. Allow Render to connect through Atlas Network Access, then copy the `mongodb+srv://...` connection string.

### 2. Render API

Create a Render Web Service from the GitHub repository. The included `render.yaml` uses:

- Build command: `npm install`
- Start command: `npm start`
- Health check: `/api/health`

Set these Render environment variables:

```text
MONGODB_URI=mongodb+srv://...
MONGODB_DB=chronos
CLIENT_ORIGIN=https://your-project.vercel.app
```

Deploy Render first. After the service is live, verify `https://YOUR-SERVICE.onrender.com/api/health` returns `{"status":"ok","storage":"mongodb"}`. Free Render services may take roughly a minute to wake after inactivity; the Chronos live-event clients reconnect automatically.

For multiple allowed frontend domains, separate `CLIENT_ORIGIN` values with commas.

### 3. Vercel frontend

Import the same GitHub repository into Vercel. Vercel detects Vite and uses the included `vercel.json`.

Set this Vercel environment variable for Production, Preview, and Development as needed:

```text
VITE_API_URL=https://your-api.onrender.com
```

Redeploy after changing an environment variable.

After Vercel assigns the final production domain, return to Render and set `CLIENT_ORIGIN` to that exact HTTPS origin, without a trailing slash. Multiple origins may be comma-separated. Then redeploy/restart Render and verify account registration from the Vercel site.

Browser GPS requires HTTPS. Vercel provides HTTPS automatically; users must still grant location permission themselves.

## Important prototype limitation

The requested name-only experience has no authentication. Friend links are view-only in the interface, but names are not secure identities. Before using this for sensitive schedules or a large public audience, add account authentication and enforce ownership in the API.
