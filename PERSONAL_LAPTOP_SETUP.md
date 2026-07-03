# Continue Chronos on your personal laptop

## 1. Extract the package

Extract the ZIP file to a normal working folder such as `Documents\Time Planning App`.

## 2. Install Node.js

Install Node.js 20 or newer from <https://nodejs.org> if it is not already installed.

## 3. Start the application

Double-click `Start on Personal Laptop.bat`.

The first run installs the required packages. Your browser will then open:

```text
http://localhost:5173
```

Keep the terminal window open while using the application. Press `Ctrl+C` to stop it.

## 4. Restore cloud configuration

Secrets are deliberately not included in the transfer package. For production deployment, configure these in the service dashboards:

### Render

```text
MONGODB_URI=your MongoDB Atlas connection string
MONGODB_DB=chronos
CLIENT_ORIGIN=https://your-project.vercel.app
```

### Vercel

```text
VITE_API_URL=https://your-api.onrender.com
```

Never email or commit MongoDB passwords or `.env` files.

## Package exclusions

The transfer ZIP excludes `node_modules`, compiled `dist` files, `.env` secrets, and `server/data.json`. These are machine-generated, sensitive, or replaceable.
