# 06 — Engineering Execution and AI Collaboration Guide

**Status:** Baseline delivery plan

## 1. Working model
Treat AMAS as a production system with explicit contracts, threat models, tests and operational ownership. AI coding tools are assistants, not sources of truth. The repository, approved requirements, official documentation and test evidence govern decisions.

## 2. Engineering responsibilities
- **Technical lead / systems architect:** owns architecture, API contracts, decision records, integration and release coordination.
- **Android / NFC engineer:** validates card/device feasibility, implements scanner UX, Room outbox and WorkManager sync.
- **Backend / data engineer:** owns authorization issuance, API, schema/migrations, transactional reconciliation, RBAC and audit.
- **Dashboard / UX engineer:** owns roster import, sessions, review, finalization gates and reporting UX.
- **QA / security / DevOps engineer:** owns test strategy, CI, threat review, deployment, monitoring, backup/restore and release evidence.

These are areas of ownership, not silos. All changes require peer review and integration tests.

## 3. Delivery milestones
### M0 — Repository and hardware discovery
Inspect repository, environment, target Android devices, representative NFC cards and identifiers exposed. Document current state and risks. Do not generate a replacement project before inspecting existing work.

### M1 — Requirements and contract freeze
Approve state machine, offline authorization package, API/OpenAPI shapes, event outcomes, data model, roster version semantics, authorization limits, finalization gate and audit events.

### M2 — Backend foundation
Implement tenant-scoped authentication/authorization, migrations, session state transitions, event idempotency, unique attendance constraint, audit and server-side finalization enforcement.

### M3 — Online attendance vertical slice
Deliver import preview/commit, card mapping, online scan, duplicate behavior, review, finalization and reports end-to-end with tests.

### M4 — Controlled offline capability
Implement signed/integrity-protected session package, versioned Room cache, durable outbox, authorization expiry, monotonic timing evidence and WorkManager sync. Do not begin broad offline implementation until card feasibility and threat review are documented.

### M5 — Reconciliation and exception handling
Implement delayed submission, conflict outcomes, `NEEDS_REVIEW`, operator resolution, retry safety and cross-device tests.

### M6 — Security and operational hardening
Run threat review, tenant isolation tests, import/export security, device-loss procedures, observability, backup/restore, staging load tests and release rehearsals.

### M7 — Pilot and release
Pilot with synthetic or explicitly approved limited data, train operators, review sync and exception metrics, close critical issues, then follow approved rollout procedure.

## 4. AI-assisted change protocol
For each task, prompt the coding agent to:
1. Read `AGENTS.md` and relevant `/docs` files.
2. Inspect the repository, `git status`, existing implementation and tests.
3. Summarize the intended change, affected files, risks and tests before editing.
4. Make the smallest coherent implementation change.
5. Add tests for success, rejection, boundary, retry and authorization cases as applicable.
6. Run tests and report exact commands and observed results.
7. Review the diff for secrets, removed guards, migration hazards and unhandled failure paths.
8. Update docs and decision records when behavior changes.

Never provide production credentials to an AI agent. Keep changes in version-controlled branches, review diffs and require approval for destructive operations or production actions. Do not accept claims like “production-ready” without evidence.

## 5. Definition of done
- Requirements are traceable to implementation and tests.
- Authorization and tenant checks are server-enforced.
- Database constraints backstop application logic.
- Failure, retry, concurrency and offline-expiry cases are handled.
- Audit and operational telemetry are present without excessive personal data.
- Documentation and API contracts match the implementation.
- CI checks and relevant tests pass; skipped checks are disclosed.
- Security and migration review is complete for the change.

## 6. Blocking decision discipline
If a missing decision could change attendance integrity, authorization, privacy, migration, or official reports, do not silently choose. Record the decision, impact, safe default and approver. Non-critical visual details may use documented defaults.
