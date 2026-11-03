# 02 — UI/UX Specification

**Status:** Baseline interaction requirements

## 1. UX principles
The operator must always be able to distinguish a card being read, an event saved locally, an event accepted by the server, and an event rejected or awaiting review. Never use a generic green success state for provisional offline capture. Provide text and accessible audio/haptic feedback where supported; do not rely on color alone.

## 2. Android scanner states
- **Online / ready:** session identity and connectivity shown; server-backed scans enabled.
- **Offline / ready:** explicit offline banner, session name, roster version, authorization expiry and pending-event count shown.
- **Reading card:** short progress feedback; prevent accidental double submission while retaining safe idempotency.
- **Online accepted:** “Attendance recorded” only after authoritative backend acceptance.
- **Offline persisted:** “Captured offline — pending verification” only after the Room transaction commits.
- **Already recorded / duplicate:** distinguish server-confirmed duplicate from a locally repeated tap.
- **Not in roster / card not registered / inactive card:** specific non-success message with a safe next action.
- **Authorization expired:** stop new offline capture and explain that the device must reconnect for fresh authorization.
- **Storage failure:** do not claim capture; display an actionable error and stop scanning if durable storage is unavailable.
- **Needs review:** explain that the event is not yet official and show its reference ID to authorized staff.

## 3. Pre-offline readiness checklist
Before entering offline mode, show:
- Session and organization.
- Authorized operator/device context.
- Cached roster version and last successful package verification.
- Authorization expiry and session-window end.
- Count of pending events from this session/device.
- A clear warning if the roster is incomplete, authorization is expired, local storage is low, or the package cannot be verified.

The operator must explicitly confirm the session authorization action while online. Do not imply that downloading a roster alone grants offline permission.

## 4. Synchronization screen
Display event counts by state: pending, accepted, duplicate, rejected and needs review. Show last successful sync, last error in safe language, retry state, and oldest pending event age. Allow retry for authorized operators, but do not allow editing event identity or status to bypass server reconciliation. The app must handle ambiguous timeouts by retrying the same event ID rather than creating a new event.

## 5. Dashboard review and finalization
The session review screen must show:
- Expected roster count and server-accepted attendance count.
- Pending synchronization count.
- Rejected and duplicate outcomes.
- Unresolved review count and reasons.
- Roster version and session state.

Disable the finalization action when any event is pending synchronization or unresolved review. Explain the blocking reason in text. The backend must independently enforce the same rule. Once clear, require confirmation and create a finalized version. Corrections/reopening require appropriate permission, reason capture and visible audit history.

## 6. Import UX
Provide upload, validation, preview, row-level errors, duplicate/conflict summary, and explicit commit. Preserve leading zeros in identifiers. Never silently discard invalid rows or silently overwrite existing people. Provide a downloadable error report that does not leak data across organizations.

## 7. Accessibility and error handling
- Support large readable scan feedback and accessible labels.
- Provide non-color status cues and screen-reader announcements.
- Avoid displaying full sensitive card identifiers unnecessarily.
- Use clear, specific messages without exposing stack traces, tokens or internal infrastructure.
- Keep scanner interaction responsive, but never sacrifice durable persistence for perceived speed.

## 8. UX acceptance checks
- Test operators can distinguish local capture from authoritative acceptance without training assumptions.
- Expired authorization disables offline capture visibly.
- Failed local persistence never produces success feedback.
- A pending event visibly blocks finalization.
- Review states provide a safe route to authorized resolution.
