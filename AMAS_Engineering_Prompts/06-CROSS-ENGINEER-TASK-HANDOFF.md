# AMAS Cross-Engineer Task Brief and Handoff Template

Copy this template into every agent task. Keep each task bounded and verifiable.

## Task brief
**Task ID / milestone:**  
**Owner role:**  
**Requested outcome:**  
**Relevant requirements / ADRs:**  
**Allowed files/modules:**  
**Out-of-scope changes:**  
**Dependencies / upstream contracts:**  
**Acceptance criteria:**  
1.  
2.  
3.  
**Security/privacy considerations:**  
**Migration/configuration impact:**  
**Test plan:**  
**Human approval required before:**

## Required execution sequence
1. Inspect repository state, relevant docs, existing patterns and tests.
2. Report findings and minimal plan before editing.
3. Identify assumptions and blocking questions; do not invent business rules.
4. Implement a small coherent change.
5. Add/update tests with the behavior.
6. Run relevant checks and record exact commands/results.
7. Inspect final diff for unrelated changes, secrets and weakened controls.
8. Update relevant docs/contracts.
9. Return the handoff report below.

## Handoff report
**Implemented:** behavior changed and expected result.  
**Files changed:** path and reason.  
**Contract impact:** API/OpenAPI, database/migrations, UI/state, compatibility.  
**Verification:** commands/tests, results, checks not run and why.  
**Security and integrity:** authorization/tenant checks, idempotency/concurrency, audit/privacy, known risks.  
**Manual validation:** exact steps and expected outcome.  
**Follow-up needed:** role/owner, blocking question, suggested next task.  
**Status:** Complete / Partial / Blocked — explain why.
