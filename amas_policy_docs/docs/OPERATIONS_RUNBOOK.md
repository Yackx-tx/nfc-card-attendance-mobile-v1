# AMAS Production Operations Runbook

## 1. System Overview
AMAS (Automated Mobile Attendance System) is an authoritative attendance system with:
- **Authoritative Backend**: Node.js + Fastify + PostgreSQL 18
- **Web Dashboard**: React 19 + TypeScript + Vite + Tailwind CSS
- **Android NFC Scanner**: Kotlin + Jetpack Compose + Room + WorkManager
- **Cryptographic Offline Packages**: Signed with Node.js `node:crypto` Ed25519 (8-hour default lease, 12-hour hard maximum)

---

## 2. Daily Operational Procedures

### A. Pre-Session Setup & Roster Import
1. Navigate to the Web Dashboard at `http://localhost:3000`.
2. Login with Operator credentials (`orgSlug`, `email`, `password`).
3. Under **Roster Import**:
   - Upload the institution's attendance Excel workbook (`.xlsx`).
   - Inspect the validation preview: verify external IDs preserve leading zeros (e.g. `00123`).
   - Click **"Confirm & Commit Roster"** to generate an immutable version with a SHA-256 digest.
4. Under **Card Registration**:
   - Tap or enter NFC tag UIDs (e.g., `04A1B2C3`) to map attendees to their physical contactless cards.
5. Under **Attendance Sessions**:
   - Create a session linked to the published Roster Version.
   - Click **"Open Session"** to allow scans.

### B. Field Scanning (Online or Offline)
1. On the Android scanner phone:
   - Select the active session and tap **"Authorize Offline Scanner"**.
   - The device verifies the backend's Ed25519 signature and stores the roster in encrypted Room storage.
2. Present physical contactless cards to the phone:
   - Event commits durably to the local Room outbox before visual feedback.
   - UI reports: `"Captured offline — pending verification"` (distinct amber state, never green authoritative success).
   - Duplicate scans report: `"Already recorded at [Timestamp]"`.

### C. Session Closure & Finalization Gate (ADR-003)
1. Once attendance taking concludes, move the session state to `REVIEW`.
2. Ensure all mobile devices have reconnected to synchronize their outbox queues.
3. Review any exceptions in the dashboard:
   - `ACCEPTED`: Attendance recorded in PostgreSQL.
   - `DUPLICATE`: Multiple scans audited; exactly one attendance record retained.
   - `REJECTED`: Unregistered cards or non-roster attendees.
   - `NEEDS_REVIEW`: Clock anomalies or lease timing discrepancies.
4. **Finalization Gate**:
   - Finalization is strictly rejected server-side if any event remains in `NEEDS_REVIEW` (HTTP 409 Conflict).
   - Once resolved, click **"Finalize Session"** to create the versioned, immutable snapshot.

---

## 3. Disaster Recovery & Backup (OPS-01)
- Automated backup verification script: `./scripts/db-backup-restore-test.sh`
- Creates full schema and data dump with `pg_dump`, restores into a temporary verification database, confirms all 15 tables and relations, and cleans up.
- Recovery Time Objective (RTO): < 2 minutes.

---

## 4. Troubleshooting & FAQ
- **Why did finalization fail with "UNRESOLVED_EVENTS_EXIST"?**
  - Check the session's event log for items in `NEEDS_REVIEW` state. An operator must accept or reject each exception before the backend will permit session closure.
- **Why did a scan return "CLOCK_ANOMALY_CAPTURED_BEFORE_ISSUANCE"?**
  - The Android device's wall-clock was set prior to the timestamp when the offline package was cryptographically signed by the backend. The event is safely routed to `NEEDS_REVIEW` for operator adjudication.
