# 05 — Testing and Quality Assurance Strategy

**Status:** Release-blocking requirements

## 1. Quality principles
Test business invariants at unit, integration, end-to-end, security and operational levels. Passing compilation is not evidence of correctness. Use synthetic test data and reproducible environments. Tests must exercise backend enforcement, not only UI behavior.

## 2. Test layers
- **Unit:** state transitions, authorization-window calculation, roster matching, lateness, event-state mapping and import normalization.
- **Database/integration:** constraints, transactions, idempotency, tenant-safe access, event outcomes and finalization gate.
- **API contract:** OpenAPI schema conformance, validation, authentication, error semantics and bounded batch behavior.
- **Android:** NFC lifecycle, Room durability, process death, reboot, offline authorization, WorkManager retry and accessible status feedback.
- **Dashboard E2E:** import preview/commit, session setup, review, blocking finalization, reports and authorized corrections.
- **Security:** authorization bypass, tenant isolation, replay, clock manipulation, package tampering, sensitive logs and spreadsheet formula injection.
- **Operational:** staging release, backup restore, recovery from sync outage, monitoring and runbooks.

## 3. Required test fixtures
Use synthetic organizations A/B, operators with distinct roles, versioned rosters, registered/inactive/unregistered cards, multiple registered devices, sessions at authorization boundaries, and events with valid/invalid evidence. Include IDs with leading zeros and hostile spreadsheet cell values.

## 4. Acceptance test matrix
| ID | Scenario | Expected result | Release gate |
|---|---|---|---|
| OFF-01 | No offline authorization package | Offline capture disabled | Yes |
| OFF-02 | Package tampered or wrong tenant/device | Package rejected | Yes |
| OFF-03 | Roster version does not match authorization | Capture disabled or event explicitly rejected per contract | Yes |
| OFF-04 | Authorization within valid window | Local event saved; UI says pending verification | Yes |
| OFF-05 | Authorization expired | New offline capture blocked | Yes |
| OFF-06 | Wall clock moved backward | Expiry cannot be bypassed; anomaly surfaced | Yes |
| OFF-07 | Event captured validly, uploaded after expiry | Reconciled from evidence; expiry alone does not reject | Yes |
| OFF-08 | Reboot invalidates timing evidence | Event routed to review unless evidence remains verifiable | Yes |
| OFF-09 | Room write fails / storage full | No success message; scanning safely blocked | Yes |
| SYNC-01 | Process killed with pending event | Event remains durable and sync resumes | Yes |
| SYNC-02 | Network timeout after server commit | Retry same event ID; no duplicate record | Yes |
| SYNC-03 | Same batch submitted repeatedly | Stable idempotent outcomes | Yes |
| SYNC-04 | Two devices capture same person offline | One attendance record; other outcome audited as duplicate/conflict | Yes |
| SYNC-05 | Partial batch failure | Per-event outcomes recoverable; no lost events | Yes |
| FIN-01 | Finalize with pending event | Backend rejects finalization | Yes |
| FIN-02 | Finalize with `NEEDS_REVIEW` event | Backend rejects finalization | Yes |
| FIN-03 | Finalize with server-persisted duplicate/rejected outcomes and no unresolved events | Finalization permitted if other rules pass | Yes |
| FIN-04 | Client bypasses disabled UI and calls API | Backend still rejects invalid finalization | Yes |
| FIN-05 | Offline device may still hold unsent events | Dashboard warns; closure procedure must account for authorized device/window | Yes |
| SEC-01 | User from tenant A requests tenant B resource | Denied without data leakage | Yes |
| SEC-02 | Low-privilege operator reopens/finalizes without permission | Denied and security-relevant attempt audited | Yes |
| IMP-01 | Excel ID `00123` | Leading zeros preserved | Yes |
| IMP-02 | Export cell begins with formula-triggering characters | Output neutralized safely | Yes |
| NFC-01 | Target card does not expose expected identifier | No assumption; unsupported-card path shown | Yes |
| OPS-01 | Restore from backup | Documented recovery succeeds in staging | Yes |

## 5. Concurrency and fault injection
Test simultaneous scans for the same person/session; duplicate requests across app restarts; network loss before, during and after server commit; server restarts; expired credentials; device time jumps; wall-clock changes; storage exhaustion; malformed batches; roster updates after package issuance; authorization expiry while app remains open; and multiple devices with different cached roster versions.

## 6. Performance measurements
Measure local NFC read-to-durable-write latency separately from server confirmation latency. Record p50/p95/p99 under representative hardware and load. Do not optimize by displaying success before persistence. Establish numeric SLO targets only after hardware/network/load assumptions are measured and approved.

## 7. Test evidence
CI should run formatting/lint, type checks, unit tests, API/database integration tests, migration validation and security checks. Device-dependent NFC, process-death and hardware tests require recorded manual or automated evidence on the supported device/card matrix. Reports must list exact commands, environment, results and skipped tests. Never fabricate test results.

## 8. Release criteria
- All release-gating tests pass or have an explicitly approved, documented exception; baseline policy exceptions cannot weaken core integrity invariants.
- No unresolved critical/high security findings.
- Database migrations reviewed and tested against staging data shape.
- Backup/restore and synchronization recovery validated.
- NFC feasibility confirmed on target hardware and representative authorized cards.
- Operational procedure for disconnected devices and finalization completed and rehearsed.
