# AMAS Definition of Done and Release Gates

A task is not complete because code was generated, the app launched once, or the build succeeded. Apply relevant checks and record evidence.

## Task-level DoD
- [ ] Requirements and scope reviewed before editing.
- [ ] Change is focused; no unrelated refactor or unapproved architecture change.
- [ ] Inputs validated at trust boundaries.
- [ ] Authorization and organization/tenant isolation enforced server-side where relevant.
- [ ] Tests cover expected behavior and important failure paths.
- [ ] Tests actually run; results and skipped checks are accurately reported.
- [ ] No secrets, real personal data or sensitive card identifiers committed.
- [ ] Error handling/logs avoid exposing sensitive internals/data.
- [ ] API contracts, migrations and docs updated as applicable.
- [ ] Diff reviewed; no weakened tests, removed constraints or bypassed controls.
- [ ] Limitations and follow-ups explicit.

## Offline attendance DoD
- [ ] Authorization package scoped to organization, session, device/operator, roster version and validity.
- [ ] 8-hour default and 12-hour hard ceiling enforced, bounded by session schedule.
- [ ] Offline lease cannot be renewed or extended while disconnected.
- [ ] Cached roster and card mappings are verified and versioned.
- [ ] Local capture persists before UI reports success.
- [ ] Pending events survive process death/restart.
- [ ] Sync is durable and idempotent.
- [ ] Backend validates each event and returns a persisted explicit outcome.
- [ ] Server receipt/decision time is distinct from device event time.
- [ ] Time evidence anomalies go to review under approved policy.
- [ ] Multiple offline captures cannot create duplicate attendance.
- [ ] Pending/unresolved events block finalization.
- [ ] Session closure handles devices that may still hold unsent events.
- [ ] Reports include only server-accepted attendance.
- [ ] NFC behavior tested with authorized real cards and target devices.

## Security DoD
- [ ] Role permissions tested at API, not just hidden in UI.
- [ ] Cross-tenant access tested.
- [ ] Database constraints backstop application checks.
- [ ] Uploads/imports/exports safely validated and handled.
- [ ] Secrets use appropriate environment/secret management.
- [ ] Logs exclude tokens, credentials and unnecessary personal/card data.
- [ ] Dependencies and deployed configuration reviewed.
- [ ] Threats and residual risks documented.

## Release gate
Release only when all release-blocking tests pass; no unresolved critical/high security issue remains without explicit human risk acceptance; migrations and rollback/forward-fix plans are reviewed; staging smoke and offline reconciliation tests pass; backup restoration is tested; monitoring and incident response are available; QA/Security/DevOps provides written go/no-go; and a human explicitly approves production deployment.

## Never claim
- Tests passed when not run.
- An offline event is authoritative before server acceptance.
- A UID proves identity or cannot be cloned.
- A disconnected device can receive immediate revocation.
- A backup is usable without restore evidence.
- The system is production-ready based on a successful build alone.
