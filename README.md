# AMAS — Automated Mobile Attendance System

[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-18-blue.svg)](https://www.postgresql.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
[![Fastify](https://img.shields.io/badge/Fastify-4.x-black.svg)](https://fastify.dev/)
[![React](https://img.shields.io/badge/React-19-cyan.svg)](https://react.dev/)
[![Android](https://img.shields.io/badge/Android-SDK_35-brightgreen.svg)](https://developer.android.com/)

AMAS is an authoritative, multi-tenant mobile attendance platform designed for schools, universities, and enterprises. It pairs an NFC-capable Android scanner with a centralized PostgreSQL backend and an administrative Web Dashboard, supporting **controlled, bounded offline attendance capture** without compromising server authority.

---

## Architecture Overview

```mermaid
flowchart TD
    subgraph Clients["Client Layer"]
        AndroidApp["Android Scanner App\n(Kotlin, Jetpack Compose, Room, WorkManager)"]
        Dashboard["Web Dashboard\n(React 19, TypeScript, Vite, Tailwind CSS)"]
    end

    subgraph Service["Authoritative Backend (Fastify + TypeScript)"]
        AuthService["Tenant RBAC & Auth\n(Argon2id + JWT + Rotating Refresh Tokens)"]
        OfflinePackageService["Cryptographic Signer\n(Ed25519 Package Signing, 8h-12h bounds)"]
        ReconciliationEngine["Authoritative Reconciliation\n(Idempotent Multi-Device Conflict Resolver)"]
        FinalizationGate["Finalization Gate\n(Zero Unresolved Exceptions Invariant)"]
    end

    subgraph Storage["Authoritative Storage"]
        PostgresDB[("PostgreSQL 18\nTenants, Rosters, Cards, Events,\nUnique Attendance Records, Audit Trails")]
    end

    AndroidApp -->|NFC Scan / Batch Sync| ReconciliationEngine
    AndroidApp -->|Fetch Signed Package| OfflinePackageService
    Dashboard -->|Roster Import / Card Map| PostgresDB
    Dashboard -->|Session Control & Review| FinalizationGate
    ReconciliationEngine --> PostgresDB
    FinalizationGate --> PostgresDB
```

---

## Repository Structure

```
NFC-CARD-ATTENDANCE-MOBILE/
├── packages/
│   └── contracts/             # Shared OpenAPI 3.1 specifications, Zod schemas, TypeScript types
├── backend/                   # Fastify Node.js authoritative backend service
│   ├── src/
│   │   ├── db/                # PostgreSQL pool, migrations (001_initial_schema.sql), migrator
│   │   ├── modules/           # Auth, Organizations, People/Roster, Cards, Sessions, Attendance, Finalization
│   │   ├── app.ts             # Fastify application setup & route registration
│   │   └── server.ts          # Server initialization & entrypoint
│   └── test/                  # Integration tests (Vitest) & E2E simulation script
├── dashboard/                 # React 19 + TypeScript + Vite + Tailwind CSS Operations Web App
│   ├── src/
│   │   ├── api/               # Typed API client with token auto-refresh
│   │   └── pages/             # Login, Sessions Operations, Roster Import, Card Registration
├── android/                   # Native Android NFC Mobile Application
│   ├── app/src/main/
│   │   ├── AndroidManifest.xml # NFC permissions, foreground dispatch, MockNfcReceiver
│   │   └── java/.../          # Room DB, OutboxEntity, Ed25519Verifier, SyncWorker, Compose UI
├── scripts/                   # Operational verification scripts (e.g. db-backup-restore-test.sh)
├── amas_policy_docs/          # Approved product requirements, architecture, ADRs, runbooks
└── AMAS_Engineering_Prompts/  # Role engineering guidelines & DoD
```

---

## Core System Invariants

1. **Backend Authority (ADR-004)**: PostgreSQL accessed through the backend API is the sole authority for attendance. Local captures on Android are strictly provisional (`"Captured offline — pending verification"`).
2. **Database Uniqueness**: Attendance uniqueness is strictly guaranteed by the composite constraint `UNIQUE(session_id, person_id)` in PostgreSQL.
3. **Event Idempotency**: Each scan event carries a globally unique `event_id` (UUID v4). Re-submitting the same event ID returns the stored result without duplicate rows.
4. **Controlled Offline Capture (ADR-001 & ADR-002)**: Offline scanning is permitted only with a valid, session-scoped authorization package signed with Ed25519 (8-hour default lease, 12-hour hard ceiling).
5. **Durable Persistence Before Feedback**: Android commits the scan to local Room storage *before* visual confirmation is shown.
6. **Finalization Gate (ADR-003)**: A session cannot be finalized while any captured event remains in `NEEDS_REVIEW` or is pending synchronization.
7. **Leading Zero Preservation (IMP-01)**: Student and employee external IDs (e.g. `00123`) are preserved as text across imports and database records.

---

## Getting Started

### 1. Prerequisites
- **Node.js**: v20+ (`node -v`)
- **PostgreSQL**: 16+ running locally (`psql -d postgres -c "SELECT version();"`)
- **Java**: OpenJDK 17 (`java -version`)
- **Android SDK**: Configured at `/home/yackx/Android/Sdk`

### 2. Environment Configuration
Create `.env` in the repository root:
```env
PORT=4000
HOST=0.0.0.0
NODE_ENV=development
DATABASE_URL=postgresql://postgres:yannick123@localhost:5432/amas_dev
TEST_DATABASE_URL=postgresql://postgres:yannick123@localhost:5432/amas_test
JWT_SECRET=super-secret-amas-dev-key-change-in-production-min-32-chars-long
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_DAYS=7
LOG_LEVEL=info
```

### 3. Run Migrations & Start Backend Service
```bash
# Build contracts and backend
npm run build --workspaces

# Run database migrations
node backend/dist/db/migrator.js

# Start backend server (listening on http://localhost:4000)
npm run start --workspace=@amas/backend
```

### 4. Start Web Dashboard
```bash
# Start Vite development server (listening on http://localhost:3000)
npm run dev --workspace=@amas/dashboard
```

---

## Testing & Verification Matrix

| Command | Layer | Purpose |
|---|---|---|
| `npm test --workspace=@amas/backend` | Backend | Runs all 12 release-gating integration tests (tenant isolation, auth, duplicate scans, finalization gate). |
| `npm run test:simulate-sync --workspace=@amas/backend` | E2E | Executes a full field simulation: roster commit, card mapping, batch sync, conflict resolution, and finalization. |
| `./scripts/db-backup-restore-test.sh` | Operations | Validates automated backup generation (`pg_dump`) and clean restoration (`OPS-01`). |
| `npm run build --workspace=@amas/dashboard` | Dashboard | Verifies React 19 + TypeScript + Tailwind CSS production bundle compilation. |

---

## Android NFC Field & Mock Testing

### Real Cards (Physical Android Phone)
1. Install debug APK on an NFC-capable phone (`cd android && ./gradlew installDebug`).
2. Open AMAS Scanner -> Authorize Session -> Tap card against the back of the phone.
3. Observe instantaneous feedback: `"Jane Doe: Captured offline — pending verification"`.

### Testing via ADB Broadcast (No Physical Card Required)
Inject a simulated card tap directly into the app using ADB:
```bash
adb shell am broadcast \
  -a com.amas.attendance.MOCK_NFC_SCAN \
  --es card_uid "04A1B2C3"
```
