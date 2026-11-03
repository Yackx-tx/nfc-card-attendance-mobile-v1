# 07 — Deployment and Operations Runbook

**Status:** Baseline; environment-specific commands remain to be added after stack selection

## 1. Environment separation
Maintain separate development, staging and production environments, credentials, databases, signing keys and storage. Never point test builds at production. Keep secrets in a managed secret store or protected deployment environment, never in source control or client bundles.

## 2. Release pipeline
Recommended CI gates: formatting/lint, type checks, unit tests, API/database integration tests, migration checks, dependency/security scans, build, staging deployment, smoke tests, and approval before production. Database migrations must be versioned, reviewed and tested. Use backward-compatible migration patterns where feasible and document rollback/forward-fix plans.

## 3. Offline session preparation
Before a session begins, the operator must:
1. Confirm the session and scheduled window.
2. Verify the roster version and card mappings.
3. Authorize each permitted device/operator while online.
4. Confirm package verification and authorization expiry on the device.
5. Confirm local storage health and pending-event count.
6. Record which devices are authorized for the session.

The baseline authorization lifetime is 8 hours and must not exceed 12 hours. The effective expiry cannot exceed the permitted session window. Offline renewal is prohibited.

## 4. Session closure and finalization runbook
1. Move the session into review according to server-enforced state transitions.
2. Require each authorized scanner to reconnect and synchronize, where possible.
3. Check the backend's event inventory and per-device last synchronization state.
4. Resolve all rejected/duplicate outcomes that require operator action and every `NEEDS_REVIEW` event.
5. Confirm no pending synchronization or unresolved review remains server-side.
6. Confirm all authorized offline windows have expired or all registered devices have synchronized. The server cannot know that a disconnected device has no unsent events.
7. If a device is missing or cannot synchronize, follow the documented lost-device/exception procedure. Do not silently bypass the finalization gate. Baseline policy has no override for unresolved/pending events.
8. Finalize only when the backend gate passes; verify version, actor, timestamp and report totals.

A dashboard warning is mandatory when an authorized device has not confirmed synchronization or its offline window has not closed. A server-side zero-pending count is necessary but not sufficient if an authorized disconnected device may still hold events.

## 5. Monitoring
Monitor API availability/latency, authorization issuance failures, package verification errors, pending event counts, oldest pending-event age, sync retries/failures, duplicate conflicts, `NEEDS_REVIEW` volume, authorization expiries, local-storage errors where telemetry is available, finalization blocks, import failures and security events. Avoid raw card IDs, tokens and unnecessary personal data in logs.

Set numeric alert thresholds and service-level objectives after pilot measurements. Do not invent performance guarantees before representative testing.

## 6. Recovery procedures
- **Temporary API outage:** clients retain durable pending events and retry with the same event IDs; operators see pending status.
- **Unknown upload outcome:** retry/query the same event ID; never create a replacement ID for the same event.
- **Device lost:** revoke server-side access as soon as possible, recognize that offline revocation is delayed, assess cached data exposure, rotate credentials if needed and follow incident policy.
- **Storage full or local database corruption:** stop capture rather than claim success; preserve recoverable evidence and follow approved device support procedures.
- **Unverifiable event:** route to review with reason and evidence; authorized resolution is audited.
- **Backup/restore:** restore to a clean environment, validate schema and record counts, verify authorization/audit integrity and document recovery time. Never use a restored production database for casual development.

## 7. Incident handling
Security/privacy incidents, suspected card cloning, tenant leakage, corrupted attendance, missing authorized devices and unexplained finalization discrepancies must be escalated to designated owners. Preserve relevant audit evidence, limit further access, avoid altering history, and follow applicable organizational/legal reporting requirements.

## 8. Production readiness checklist
- [ ] Staging smoke and integration tests pass.
- [ ] All release-gating tests have evidence.
- [ ] Migration and rollback/forward-fix plan approved.
- [ ] Backup and restore rehearsal completed.
- [ ] Secrets and key rotation ownership documented.
- [ ] NFC hardware/card compatibility verified.
- [ ] Offline authorization and expiry policy configured.
- [ ] Device inventory and closure runbook tested.
- [ ] Monitoring and alert ownership assigned.
- [ ] Data retention and privacy requirements approved.
- [ ] No unresolved critical/high security findings.
