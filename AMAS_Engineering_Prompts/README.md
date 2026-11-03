# AMAS Engineering Prompt Pack

**Purpose:** Master instructions and role-specific engineering prompts for building AMAS (Automated Mobile Attendance System).

## Contents
- `00-MASTER-ENGINEERING-PROMPT.md` — shared project direction and operating contract.
- `01-TECHNICAL-LEAD-ARCHITECT-PROMPT.md` — architecture, contracts, ADRs, integration and technical governance.
- `02-ANDROID-NFC-PROMPT.md` — Android app, NFC feasibility, local capture and synchronization.
- `03-BACKEND-DATA-PROMPT.md` — API, PostgreSQL, attendance rules, authorization and reconciliation.
- `04-WEB-DASHBOARD-PROMPT.md` — operator/admin dashboard, imports, reviews and reporting UX.
- `05-QA-SECURITY-DEVOPS-PROMPT.md` — independent quality, security, CI/CD, operations and release evidence.
- `06-CROSS-ENGINEER-TASK-HANDOFF.md` — shared task brief and handoff format.
- `07-DEFINITION-OF-DONE.md` — acceptance gate used by every engineer.

## How to use
1. Put `00-MASTER-ENGINEERING-PROMPT.md` into the coding agent's project context first.
2. Keep approved requirements and architecture documents in `/docs`; prompts do not replace them.
3. Give each engineer their role prompt and one bounded milestone/task at a time.
4. The Technical Lead owns cross-role sequencing and contract changes; QA/Security/DevOps independently verifies results.
5. Require agents to inspect the actual repository and report what exists before proposing changes. Never assume files, dependencies, commands, test results, or environment settings.
6. Use separate Git branches or bounded commits per task. Review diffs before merging.
7. Never provide production secrets to an AI agent. Use synthetic data in development and staging.

## Project-specific non-negotiables
- Backend is authoritative for attendance, session state, permissions, reconciliation and finalization.
- Offline capture is allowed only with a valid, pre-authorized session package and cached, versioned roster.
- An offline event is provisional until backend reconciliation.
- Do not finalize while events remain pending or unresolved. Rejected and duplicate events must have persisted server outcomes before finalization.
- Device timestamps are evidence, not trusted server time. Unverifiable capture time goes to review.
- NFC identifiers must be tested with authorized target cards and target Android devices. Do not assume a card exposes a registration number or that UID proves identity.
- The 8-hour default / 12-hour hard ceiling for offline authorization is the policy baseline; implement it as configured and validated, do not silently change it.
- No role may remove security checks, database constraints, audit history, or tests just to make a build pass.
