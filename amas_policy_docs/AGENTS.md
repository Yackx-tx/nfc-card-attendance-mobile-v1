# AMAS Engineering Agent Rules

## Purpose
AMAS (Automated Mobile Attendance System) is a multi-tenant attendance platform for schools and companies. The Android NFC client may capture attendance offline only for a pre-authorized session with a cached, versioned roster. The backend and PostgreSQL remain authoritative.

## Mandatory workflow
1. Inspect the repository structure, `git status`, existing documentation, package manifests, migrations, tests, and CI configuration before editing.
2. Treat requirements marked **Approved** as normative. Do not invent replacements for them. Identify unresolved decisions explicitly and stop at decision gates when they materially affect integrity, security, data migration, or production behavior.
3. Implement incrementally. Propose a plan and affected files before broad changes. Keep changes scoped, reviewable, and reversible.
4. Add or update automated tests for every behavior change. Run the relevant tests and report exact commands and actual results. Never claim tests passed if they were not run.
5. Update API contracts, migrations, operational docs, and architecture records whenever implementation changes them.
6. Preserve security checks, database constraints, audit history, and tests. Never remove a guard, constraint, or test merely to make a build pass.
7. Never commit secrets, real attendance records, real personal data, or production credentials. Use synthetic fixtures.
8. Do not run destructive commands, production migrations, production deployments, or actions against shared infrastructure without explicit approval.
9. Do not assume an NFC card exposes a registration number or that a chip UID proves identity. Validate target cards and target Android hardware early.
10. Never connect Android or dashboard clients directly to PostgreSQL. All authoritative decisions pass through the backend API.

## Non-negotiable attendance invariants
- Offline capture is allowed only with a valid, pre-issued, session-scoped authorization package and matching verified cached roster.
- Initial policy default: 8-hour authorization lifetime; hard maximum 12 hours. Authorization is additionally bounded by the scheduled session window and configured expiry. Do not extend a lease offline.
- Expiry blocks new offline captures. An event captured before expiry may synchronize later and must be reconciled using available evidence; expiry alone does not automatically invalidate it.
- Events that cannot be reliably time-ordered or validated must be marked for review, not silently accepted.
- Local success means “Captured offline — pending verification,” not server-accepted attendance.
- Persist the event durably before displaying successful local capture.
- Upload retries are idempotent. Enforce event idempotency and a unique attendance constraint on `(session_id, person_id)`.
- Backend validation and database transactions are authoritative. Device clocks and client-supplied attendance states are untrusted.
- A session cannot be finalized while any captured event is pending synchronization or unresolved review. Rejected and duplicate events may be closed only after their outcomes are persisted server-side.
- Finalized reports contain server-accepted attendance only. Finalized versions and authorized corrections remain auditable.
- Tenant isolation, least privilege, server-side validation, and audit logging are mandatory.

## Required agent report
At the end of each implementation task, report: summary, files changed, migrations/API changes, tests actually run and results, security implications, known limitations, unrun checks, and recommended next step. Separate facts from assumptions.
