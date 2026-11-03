# 01 — Product Requirements and Business Workflows

**Product:** AMAS — Automated Mobile Attendance System  
**Status:** Baseline requirements; controlled offline policy approved  
**Audience:** Product owner, engineering, QA, operations

## 1. Purpose
AMAS records and reports attendance for schools and companies. An operator imports a roster, configures sessions, scans supported NFC ID cards using an Android device, reviews exceptions, and finalizes attendance. AMAS owns its operational database; Excel is an import/export format, not a live database.

## 2. Goals
- Make attendance capture fast and understandable.
- Support controlled offline capture without presenting local events as authoritative prematurely.
- Maintain traceability for accepted scans, rejected attempts, corrections, session transitions, and finalization.
- Support multiple organizations with strict tenant isolation.
- Provide auditable roster imports, attendance review, and Excel reports.

## 3. Out of scope for the initial baseline
- Direct connection to an institution's existing database.
- Treating a card UID as cryptographic proof of identity.
- Unbounded offline operation or offline authorization renewal.
- Silent edits to finalized attendance.
- Direct database connections from Android or browser clients.

## 4. Roles
- **Organization administrator:** manages organization settings, users, devices and permissions.
- **Operator:** imports/manages roster data as permitted, creates sessions, authorizes supported offline capture, scans, reviews and requests finalization.
- **Reviewer/manager:** reviews attendance and exceptions, with permissions scoped to the organization.
- **Report viewer:** reads permitted reports without modifying attendance.
- **Platform operator:** operates the service under least privilege; access to tenant data must be controlled and audited.

All authorization is server-enforced. UI visibility is not an authorization control.

## 5. Core workflows
### 5.1 Roster import
1. Upload Excel workbook.
2. Validate file type, size, structure, required fields and row limits.
3. Preview normalized rows and report duplicates, missing values, conflicting identifiers and invalid formats.
4. Preserve identifiers as text, including leading zeros.
5. Commit only after explicit confirmation; record importer, timestamp, source file digest, result counts and validation errors without retaining the workbook longer than policy requires.
6. Publish an immutable roster version for session use. Later roster changes create a new version and do not silently mutate a cached session roster.

### 5.2 Card registration
An authorized operator maps a supported card identifier to a person. The system must not assume the card contains a readable school/company registration number. If only a UID is exposed, treat it as a lookup key, not proof of identity. Record assignment status and change history. Card replacement/reassignment must invalidate future mappings according to policy.

### 5.3 Session lifecycle
- `DRAFT`: editable setup; scans prohibited.
- `OPEN`: online attendance capture permitted under session rules; offline authorization may be issued.
- `REVIEW`: normal capture stopped; reconcile records and resolve exceptions.
- `FINALIZED`: immutable finalized version; ordinary changes blocked.
- `REOPENED`: explicit privileged correction process with reason and audit trail; must pass review and be finalized again.
- `CANCELLED`: terminal; excluded from ordinary completed-session totals but retained for audit.

All transitions are validated by the backend. Define and test allowed transitions explicitly.

### 5.4 Controlled offline authorization
Offline capture is allowed only when all conditions hold:
- The session has been explicitly authorized online by a permitted operator.
- The device/operator scope is valid.
- The device has a verified authorization package and matching cached roster/mapping version.
- Current offline authorization is unexpired and within the session window.
- The app's local storage is available and event persistence succeeds.

Baseline authorization lifetime is 8 hours; hard maximum is 12 hours. The scheduled session window may shorten this lifetime. No offline renewal or extension is permitted. The app must reconnect and obtain fresh server authorization before capturing further events after expiry.

### 5.5 Scan and synchronization
Online scans are validated by the backend. Offline scans are validated against the cached session package and saved locally before the app shows “Captured offline — pending verification.” A locally captured event is provisional until the server accepts it. Rejected, duplicate, or unverifiable events must be clearly distinguished.

### 5.6 Review and finalization
Before finalization, the system must reconcile every captured event and resolve every `NEEDS_REVIEW` event. Finalization is blocked if any event is pending synchronization or unresolved review. Duplicate and rejected events do not block finalization once the server has persisted their outcomes. Finalization creates a versioned snapshot and audit event.

## 6. Attendance rules
- Store actual capture evidence and timestamps; late attendance remains present by default unless an organization explicitly configures a different approved rule.
- Server receipt/decision time is authoritative for server events. Device event time is untrusted evidence.
- “Absent” is derived only after the session's expected population and applicable excused/approved statuses are known. Under the baseline, absent = expected roster members − server-accepted present members − approved excused members.
- Rejected attempts are separate from attendance records.
- Corrections require authorization, reason, actor, timestamp, old value and new value.
- Finalized versions and amendment history are retained according to an approved retention policy.

## 7. Reports
Provide session summary, detailed roster, never-scanned/absent list, late arrivals, excused records, rejected/duplicate outcomes, synchronization exceptions and audit history as permitted by role. Official attendance totals include only backend-accepted records. Reports should identify the finalized version, roster version, finalization time and authorized amendments. Spreadsheet exports must defend against formula injection.

## 8. Non-functional requirements
- Durable local event persistence before local success feedback.
- Idempotent synchronization and database-enforced uniqueness.
- Clear online/offline/pending/rejected/review states.
- Tenant isolation and server-side role checks.
- Observable sync failures and recovery workflows.
- Accessible scan feedback; do not rely on color alone.
- Documented backup, restore and incident procedures.

## 9. Release-blocking acceptance criteria
1. Offline capture is denied without a valid pre-authorized session and matching roster version.
2. Expired authorization prevents new offline captures.
3. Events captured before expiry can be submitted later and reconciled on their evidence; expiry alone is not automatic rejection.
4. A failed local write never produces success feedback.
5. Repeated submissions do not create duplicate attendance.
6. Conflicting events from multiple devices produce one authoritative attendance record and auditable outcomes.
7. Finalization fails while pending synchronization or unresolved review exists.
8. Rejected/duplicate outcomes must be server-persisted before they cease blocking finalization.
9. Client-supplied status or clock values cannot bypass backend rules.
10. Finalized reports exclude provisional events.
11. Reopening and corrections preserve prior versions and audit history.
12. Cross-tenant reads/writes are denied and covered by automated tests.

## 10. Open product decisions
- Approved retention periods for personal data, scan events, audit events and uploaded workbooks.
- Whether device binding is mandatory for every organization or configurable by risk tier.
- Organization-specific late threshold and timezone policy.
- Operational escalation and service-level targets for long-pending events.
- Whether an explicitly privileged emergency finalization override will ever be allowed. Baseline: no override while pending or unresolved events exist.
