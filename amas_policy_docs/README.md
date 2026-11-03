# AMAS Engineering Documentation Pack

This pack defines the approved baseline for AMAS (Automated Mobile Attendance System), including controlled offline attendance, reconciliation, finalization, security, testing, and operations.

## Documents

1. `docs/01-product-requirements.md` — product scope, roles, workflows, business rules, acceptance criteria.
2. `docs/02-ui-ux-specification.md` — Android and dashboard interaction states, accessible feedback, and operator workflows.
3. `docs/03-system-architecture.md` — system components, offline authorization package, data model, API behavior, reconciliation and finalization.
4. `docs/04-security-privacy.md` — threat model, controls, privacy, local device risks, audit and authorization.
5. `docs/05-testing-qa.md` — test strategy and release-blocking acceptance matrix.
6. `docs/06-engineering-execution.md` — implementation milestones, collaboration, decision gates and AI-assisted engineering workflow.
7. `docs/07-deployment-operations.md` — environments, release, monitoring, recovery and incident handling.
8. `docs/08-decision-log.md` — architecture decision records and explicit open decisions.
9. `AGENTS.md` — mandatory instructions for AI coding agents and contributors.

## Status convention
- **Approved**: a product/engineering policy selected for the baseline.
- **Proposed default**: a recommended default that must be validated against operating needs before production if identified as a gate.
- **Open decision**: cannot be silently decided by an implementation agent.
- **Release gate**: must pass before production rollout.

## Important policy summary
- Controlled offline capture only for a pre-authorized session and matching cached, versioned roster.
- Default authorization lifetime: 8 hours; hard maximum: 12 hours, also bounded by the scheduled session window.
- Offline capture must stop when authorization expires; no offline renewal.
- Previously captured events may synchronize after expiry, subject to reconciliation and evidence validation.
- Finalization is blocked by pending synchronization or unresolved events.
- The backend is authoritative; local capture is provisional.

## Technology baseline
- Android: Kotlin, Jetpack Compose, Android NFC APIs, Room, WorkManager.
- Dashboard: React, TypeScript, Vite.
- Backend: Node.js, TypeScript, Fastify.
- Database: PostgreSQL.
- API contract: OpenAPI.
- Excel import/export: ExcelJS or a maintained equivalent, selected after repository and dependency review.

Versions, hosting, authentication provider, and specific cryptographic package choices must be selected after reviewing the actual repository and current official documentation. Do not treat this documentation pack as evidence that implementation or tests already exist.
