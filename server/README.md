# AthleteConnect — Backend API (Phase 2A Foundation)

This directory contains the standalone **Phase 2A: Backend Foundation** for AthleteConnect.

It provides a decoupled Node.js, Express, and TypeScript API service configured for MongoDB with Mongoose, centralized error handling, environment validation, and graceful shutdown.

---

## 1. Stack and Architecture

- **Runtime**: Node.js (v24+)
- **Framework**: Express (`^4.21.2`)
- **Language**: TypeScript (`^5.7.3`)
- **Database ODM**: Mongoose (`^8.9.5`)
- **Environment Management**: `dotenv` (`^16.4.7`)
- **Testing**: Vitest (`^5.0.5`) + Supertest (`^7.0.0`)
- **Hot Reloading / Execution**: `tsx` (`^4.19.2`)

---

## 2. Directory Structure

```
server/
├── .env.example            # Environment template with placeholder values
├── .gitignore              # Ignores node_modules, dist, .env, and logs
├── README.md               # Backend documentation and setup guide
├── package.json            # Dependencies and npm scripts
├── tsconfig.json           # TypeScript configuration
├── src/
│   ├── config/
│   │   ├── env.ts          # Validates & exports typed environment variables
│   │   └── db.ts           # Mongoose connection & disconnect management
│   ├── middleware/
│   │   ├── errorHandler.ts # Global error handling middleware (masks internals in prod)
│   │   └── notFound.ts     # Centralized 404 handler returning structured JSON
│   ├── routes/
│   │   └── health.ts       # GET /api/health endpoint
│   ├── app.ts              # Express application factory & middleware setup
│   ├── server.ts           # HTTP server lifecycle and graceful shutdown handling
│   └── index.ts            # Application bootstrap entry point
└── tests/
    ├── db.test.ts          # URI sanitization tests
    ├── env.test.ts         # Environment validation unit tests
    └── health.test.ts      # Health check and 404 integration tests
```

---

## 3. Setup and Environment Configuration

1. **Copy the example configuration to a local `.env` file**:
   ```powershell
   Copy-Item .env.example .env
   ```
2. **Review configuration in `.env`**:
   - `PORT`: HTTP listener port (default `5000`).
   - `NODE_ENV`: Runtime environment (`development` | `production` | `test`).
   - `MONGODB_URI`: MongoDB connection string (e.g., `mongodb://127.0.0.1:27017/athleteconnect`).
   - `CORS_ORIGIN`: Allowed origins (default `http://localhost:5173` for the Admin web dashboard).

> [!IMPORTANT]
> Real `.env` files are excluded by `.gitignore` and must never be committed to source control.

---

## 4. Available Scripts

Run these commands from `server/` or using root workspace scripts:

| Command | Description |
|---|---|
| `npm run dev` | Starts the server in development mode with hot-reloading (`tsx watch`) |
| `npm run build` | Compiles TypeScript source to production JavaScript in `dist/` |
| `npm run start` | Runs the compiled production server (`node dist/index.js`) |
| `npm run typecheck` | Checks TypeScript types without emitting files (`tsc --noEmit`) |
| `npm run test` | Runs the automated Vitest test suite |

---

## 5. Endpoints

### `GET /api/health`
Returns the operational status of the service:
```json
{
  "status": "ok",
  "service": "athleteconnect-api",
  "timestamp": "2026-10-18T19:20:00.000Z",
  "uptime": 12.34,
  "environment": "development"
}
```

---

## 6. Security & Operational Guarantees

- **No Hardcoded Secrets**: All configuration is loaded dynamically and validated on startup.
- **Production Validation**: Missing `MONGODB_URI` or wildcard `*` CORS in `NODE_ENV=production` fails immediately at launch with an explicit configuration error.
- **Error Masking**: Stack traces and internal database error messages are strictly masked in production responses.
- **Connection String Sanitization**: Passwords in database URIs are automatically redacted (`****`) before writing to console logs.
- **Graceful Shutdown**: Traps `SIGTERM` and `SIGINT` to cleanly close open HTTP connections and terminate the Mongoose connection before process exit.
