# 04 — Security and Privacy Specification

**Status:** Baseline security requirements; threat review required before production

## 1. Security objectives
Protect attendance integrity, personal data, tenant isolation, operator accountability and service availability. Offline support increases exposure because a device may be disconnected, lost, altered or running stale information. No design should claim that a compromised offline device is fully trustworthy.

## 2. Threats and mitigations
### Lost or stolen device
- Cache only the data required for an authorized session.
- Encrypt sensitive local data using an appropriate Android-supported design; protect keys with Android Keystore where applicable.
- Define app lock/authentication, logout cleanup, device deauthorization, reassignment and incident procedures.
- Recognize that remote wipe/revocation cannot be guaranteed while a device is offline.

### Forged or stale authorization package
- Backend issues scoped packages with integrity protection and explicit expiry.
- Client validates signature/MAC, scope, schema and roster digest using a vetted cryptographic library and key-management approach selected during implementation review.
- Do not invent custom cryptography. Protect signing keys server-side and define rotation/revocation procedures.

### Clock manipulation and reboot
- Never trust device wall-clock time as authoritative.
- Use server-time anchor plus monotonic elapsed-time and boot/session context as supporting evidence.
- Detect implausible jumps, missing anchors, reboot invalidation and expiry ambiguity.
- Route unverifiable events to `NEEDS_REVIEW`; do not silently accept them.

### Card cloning or UID spoofing
- A card UID is an identifier, not strong authentication. It may be cloneable or emulated depending on card technology.
- Test actual authorized cards and reader behavior. If risk requires stronger identity proof, use an approved cryptographic card protocol or a second factor rather than treating UID as secure.
- Log and rate-limit repeated suspicious failures without exposing raw identifiers.

### Duplicate or replayed events
- Require globally unique event IDs and server-side idempotency.
- Enforce unique `(session_id, person_id)` attendance.
- Use transactions and persist all event outcomes. Same event ID retry must return the same logical outcome.

### Cross-tenant access
- Derive tenant scope from authenticated server-side identity and memberships, not arbitrary client IDs alone.
- Enforce tenant-safe queries, foreign keys where appropriate, and authorization tests for every endpoint.
- Avoid object-level authorization gaps on sessions, people, exports, device packages and event outcomes.

### Malicious imports/exports
- Validate file type, size, rows, workbook structure and fields.
- Do not evaluate spreadsheet formulas as trusted input.
- Neutralize formula injection in exported cells.
- Limit upload processing resources and protect downloads with authorization.

## 3. Identity and authorization
- Require authenticated, server-authorized operators for all sensitive actions.
- Apply role-based access control scoped to organization and resource.
- Require stronger authorization for issuing offline packages, managing devices, reopening sessions and correcting finalized attendance.
- Use short-lived access credentials and secure refresh/session handling appropriate to the chosen identity provider.
- Do not embed privileged backend secrets in Android or web bundles.

## 4. Offline authorization policy
- Default authorization lifetime: 8 hours; hard maximum: 12 hours.
- Effective expiry is the earliest of the package expiry and the permitted scheduled-session window.
- No offline extension or renewal.
- Expiry blocks new captures. Previously captured events may synchronize later and are validated from evidence.
- An offline device cannot receive immediate revocation. The product must state this limitation and use limited expiry, device binding, least-data caching and audit to reduce risk.
- Device-time evidence is not proof of event time. Ambiguous events require review.

## 5. Local data lifecycle
Define and test local encryption, key invalidation, app reinstall behavior, backups, logout, organization switch, device reassignment, storage pressure, and lost-device response. Avoid including raw card identifiers or personal data in application logs, crash reports, analytics and notification text. Define retention and secure deletion behavior for cached roster data and event history.

## 6. Audit requirements
Record actor, organization, device, action, resource, server timestamp, result and reason where applicable for authorization issuance, roster publication, card assignment changes, scan decisions, sync reconciliation, session transitions, finalization, reopening, corrections, exports and administrative security actions. Audit records must be append-oriented and protected from ordinary tenant users modifying history. Keep logs proportionate and avoid unnecessary personal data.

## 7. API and infrastructure controls
- HTTPS for all network traffic.
- Server-side schema validation, payload limits, rate limits and safe error responses.
- Secure secret management and environment separation.
- Least-privilege database roles; clients have no direct database access.
- Parameterized queries/ORM safeguards and reviewed migrations.
- Dependency scanning, code review, static analysis and CI tests.
- Backups, restore tests, monitoring and incident response.
- Do not use real student/employee records in development or test fixtures.

## 8. Privacy requirements
Collect only the personal data necessary for roster matching and attendance. Define purpose, retention, access, correction and deletion processes in accordance with applicable law and organizational policy before production. Avoid assuming one universal retention period. Provide tenant-specific export controls and audit of sensitive access.

## 9. Security acceptance criteria
1. Tampered, expired, wrong-tenant or wrong-device packages cannot enable offline capture.
2. Expiry cannot be bypassed by setting the device wall clock backward.
3. Unverifiable timing evidence is not silently accepted.
4. Duplicate and replayed event submissions cannot create duplicate attendance.
5. Unauthorized roles cannot issue leases, finalize, reopen or amend records.
6. Cross-tenant access tests fail closed.
7. Logs and exports do not leak tokens or unnecessary raw card identifiers.
8. Local data lifecycle and lost-device procedures are tested.
9. Security review records residual risks, including offline revocation delay and NFC UID limitations.
