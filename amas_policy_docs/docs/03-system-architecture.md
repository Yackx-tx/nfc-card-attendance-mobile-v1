# 03 — System Architecture and Technical Design

**Status:** Baseline architecture; offline policy approved

## 1. System context
- **Android scanner:** Kotlin, Jetpack Compose, Android NFC APIs, Room, WorkManager.
- **Web dashboard:** React, TypeScript, Vite.
- **Backend API:** Node.js, TypeScript, Fastify.
- **Database:** PostgreSQL.
- **API contract:** OpenAPI.
- **Import/export:** ExcelJS or maintained equivalent, selected after dependency and repository review.

The backend owns authorization, attendance validation, reconciliation, finalization and audit decisions. Android and web clients never connect directly to PostgreSQL. Technology versions and providers must be chosen after repository/environment inspection and current official documentation review.

## 2. Trust boundaries
1. Android NFC reader and local storage are potentially compromised and untrusted.
2. Network requests may be delayed, repeated, reordered or lost.
3. Dashboard inputs and imported spreadsheets are untrusted.
4. Backend services validate authorization and input.
5. PostgreSQL constraints and transactions enforce integrity independently of client behavior.
6. Operational staff and service accounts receive least privilege.

## 3. Session state machine
`DRAFT → OPEN → REVIEW → FINALIZED`. An authorized correction process may transition a finalized session into `REOPENED`, then back through review and finalization. `CANCELLED` is terminal for normal workflows. The backend validates each transition. `FINALIZED` cannot be reached while any captured event is pending synchronization or unresolved review. Do not permit a client-only state transition.

## 4. Offline authorization package
Before offline use, the backend issues an integrity-protected, session-scoped package with:
- organization/session IDs and session state;
- authorization ID, issue time, expiry and scheduled-session bounds;
- operator/device scope;
- immutable roster version and content digest;
- card mapping version and minimum data needed for local lookup;
- applicable attendance rules;
- schema version and cryptographic integrity metadata.

The client verifies package integrity, scope, schema and expiry before enabling offline capture. Authorization lifetime default is 8 hours and must never exceed 12 hours. The effective expiry is the earliest of the authorization expiry and permitted session-window end. The offline client cannot renew or extend authorization. Reconnection is required for a new authorization.

A disconnected device cannot receive immediate revocation. Therefore, short expiry, device scope, minimal cached data, and audit are risk controls; documentation must not claim instantaneous revocation or tamper-proof offline operation.

## 5. Local storage and outbox
Use Room to store the verified session package, versioned roster/mappings, and durable scan-event outbox. Encrypt sensitive data at rest using an Android-appropriate approach; protect keys with Android Keystore where applicable. Define backup exclusion, logout cleanup, device reassignment and lost-device response. The event must be committed durably before the UI reports local capture.

Suggested local event fields:
- `event_id` (UUID or equivalent globally unique identifier);
- organization, session and person/card mapping reference;
- roster version, authorization ID;
- registered device ID and authenticated operator context;
- device wall-clock event time;
- monotonic elapsed-time reading, boot/session context and local sequence number where available;
- creation mode, payload schema version, sync state and last attempt metadata.

Retain the minimum card reference needed to reconcile. Avoid logging or retaining raw card values unnecessarily. A UID is not proof of identity and may be cloneable.

## 6. Offline event timing and authorization
Use a server-time anchor acquired online and monotonic elapsed time to help detect wall-clock changes. Record the relevant boot/session context. These measures improve anomaly detection but are not cryptographic proof that a device is honest. If timing evidence is missing, inconsistent or invalidated by reboot/clock anomaly, mark the event `NEEDS_REVIEW` unless a separately tested validation rule can establish safe acceptance.

A scan may be uploaded after the authorization expires if evidence indicates it was captured while authorization was valid. Expiry prevents new offline captures; it does not by itself invalidate a previously persisted event. The backend evaluates authorization scope, version, timing evidence and other policy checks. Events that cannot be validated are rejected or routed for authorized review, never silently accepted.

## 7. Synchronization protocol
WorkManager schedules durable background upload when network conditions permit. Upload batches must be bounded in size and validated server-side. Each event retains the same event ID across retries. Use exponential backoff with jitter and respect server retry guidance. A timeout means the result is unknown; retry the same event ID and query/reconcile the server outcome.

Client states:
- `PENDING_SYNC`
- `SYNCED_ACCEPTED`
- `SYNCED_REJECTED`
- `SYNCED_DUPLICATE`
- `NEEDS_REVIEW`

The server response must be persisted locally. Do not clear an event from the outbox until its server outcome is durably recorded. Provide recovery for storage pressure and partially completed batches.

## 8. Backend reconciliation
For every event, validate authentication, tenant scope, session, authorization ID and window, roster version/membership, card mapping status, payload shape, event ID idempotency and attendance rules. Reconcile inside a database transaction. Device event time and client-supplied attendance status are untrusted.

Required integrity mechanisms:
- unique event/idempotency key at the server;
- unique attendance constraint `(session_id, person_id)`;
- transactionally persist the attendance decision and event outcome;
- stable result for retries;
- audit record for accepted, duplicate, rejected and review-required events;
- explicit conflict handling when multiple devices captured the same person offline.

Only one authoritative attendance record may exist for a person in a session. Other events receive a duplicate/conflict outcome and remain traceable. Define the display/time-selection policy for conflicting offline event timestamps before production; never silently overwrite the accepted attendance time.

## 9. Data model (logical, not a migration)
- `organizations`
- `users` and organization-scoped role assignments
- `devices` and device authorization/revocation metadata
- `people`
- `cards` / card-person assignments with lifecycle history
- `roster_versions` and versioned roster membership
- `sessions` and session state history
- `offline_authorizations`
- `attendance_records`
- `attendance_events` (submitted event, idempotency key, evidence, decision/outcome)
- `attendance_amendments`
- `audit_events`
- `import_jobs` and validation results

The final relational design must be reviewed for tenant-safe foreign keys, indexes, retention, constraints and migration strategy. Do not treat this conceptual list as a ready-to-run schema.

## 10. API contract expectations
Define OpenAPI schemas and explicit outcomes, including `ATTENDANCE_RECORDED`, `ALREADY_RECORDED`, `PERSON_NOT_IN_ROSTER`, `CARD_NOT_REGISTERED`, `CARD_INACTIVE`, `SESSION_NOT_OPEN`, `AUTHORIZATION_EXPIRED`, `ROSTER_VERSION_MISMATCH`, `NEEDS_REVIEW`, `VALIDATION_ERROR`, `UNAUTHORIZED`, and `TEMPORARY_FAILURE` as appropriate.

Endpoints should support authorization issuance, package retrieval, event batch submission, event outcome lookup, session review/finalization and authorized amendments. Exact route names and HTTP semantics are an implementation decision recorded in the API design. Never expose privileged database operations to clients.

## 11. Finalization invariant
Finalization is a server-side transaction/gated workflow. It must fail if any event for the session is pending synchronization or `NEEDS_REVIEW`, including events submitted by other authorized devices. Duplicate/rejected events cease blocking only after their outcomes are persisted server-side. On success, create an immutable version/snapshot with roster version, accepted attendance set, finalization actor/time, and relevant audit references. Reopening requires permission, reason and a new auditable version; no historical version is erased.

Because an offline device may still hold unsent events unknown to the server, operational session closure must account for the authorized offline window and device inventory. Before finalization, operators must confirm that all authorized scanners have synchronized or that their offline authorization windows have expired and the required operational reconciliation process has been completed. The backend cannot prove that a disconnected device has no unsent events. This is a release-critical operational limitation and must be disclosed in the dashboard.

## 12. Import/export and reporting
Validate workbook size, type, structure, formulas, rows and fields. Preserve identifiers as text, preview before commit, and avoid silent overwrites. Exports must neutralize formula-injection payloads and enforce tenant/role access. Official totals use server-accepted attendance only.

## 13. Architecture release gates
- Verify actual target Android hardware and representative cards.
- Demonstrate durable local persistence and sync after process death/reboot.
- Demonstrate idempotent retry and multi-device duplicate resolution.
- Demonstrate backend-enforced finalization gate.
- Complete tenant isolation, authorization expiry and clock anomaly tests.
- Review cryptographic package signing, local encryption/key lifecycle and API threat model.
- Define offline device inventory/closure procedure and test it in staging.
