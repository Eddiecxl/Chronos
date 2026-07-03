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

For multiple allowed frontend domains, separate `CLIENT_ORIGIN` values with commas.

### 3. Vercel frontend

Import the same GitHub repository into Vercel. Vercel detects Vite and uses the included `vercel.json`.

Set this Vercel environment variable for Production, Preview, and Development as needed:

```text
VITE_API_URL=https://your-api.onrender.com
```

Redeploy after changing an environment variable.

## Important prototype limitation

The requested name-only experience has no authentication. Friend links are view-only in the interface, but names are not secure identities. Before using this for sensitive schedules or a large public audience, add account authentication and enforce ownership in the API.
