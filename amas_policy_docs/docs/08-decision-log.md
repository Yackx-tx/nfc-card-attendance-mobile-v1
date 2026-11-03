# 08 — Project Decision and Change Log

Use this document to record decisions that materially affect product behavior, security, privacy, data integrity, APIs or operations. Each decision should include context, alternatives, decision, consequences, owner and date. Never overwrite a prior decision; supersede it with a new entry.

## ADR-001 — Controlled offline attendance
**Status:** Approved  
**Decision:** Permit offline capture only for a pre-authorized session with a cached, verified, versioned roster.  
**Context:** Fast local response is valuable, but offline devices cannot receive real-time server decisions.  
**Consequences:** Requires a session authorization package, local durable outbox, expiry enforcement, sync reconciliation, conflict handling and clear provisional UI. Local capture is not authoritative attendance.

## ADR-002 — Authorization lifetime
**Status:** Approved baseline policy  
**Decision:** Default lifetime is 8 hours; hard maximum is 12 hours. Effective expiry is the earliest of authorization expiry and permitted session-window end. No offline renewal.  
**Consequences:** New offline captures stop at expiry. Previously captured events may sync later if evidence supports capture within the valid window. Operational policy must account for device disconnection and delayed revocation.

## ADR-003 — Finalization gate
**Status:** Approved  
**Decision:** Server-side finalization is blocked while any event is pending synchronization or unresolved review. Rejected/duplicate events stop blocking only after their server outcomes are persisted.  
**Consequences:** Dashboard disabling alone is insufficient; backend and database workflow must enforce the rule. Finalized snapshots contain server-accepted attendance only.

## ADR-004 — Backend authority and idempotency
**Status:** Approved  
**Decision:** Backend and PostgreSQL are authoritative. Every scan event has stable identity across retries; attendance is unique per `(session_id, person_id)`.  
**Consequences:** Transactions, event-level outcomes and conflict audit are required. Device timestamps and client-supplied status are untrusted.

## ADR-005 — NFC card identity
**Status:** Approved constraint  
**Decision:** Do not assume cards expose a readable registration number or that UID proves identity. Validate actual target cards and Android hardware before choosing final card strategy.  
**Consequences:** Card mapping/registration is required when a card does not expose a suitable identifier. Stronger assurance may require a cryptographic card protocol or second factor.

## ADR-006 — Unsent events on disconnected devices
**Status:** Approved operational constraint  
**Decision:** A server cannot know whether a disconnected authorized device still holds unsent events. Finalization requires server-side reconciliation plus a closure process accounting for authorized devices and offline windows. Baseline policy does not permit finalization overrides while events are pending or unresolved.  
**Consequences:** Track authorized devices, their last sync and authorization expiry; warn operators; document missing-device procedures. A server-side zero-pending count alone is not sufficient when disconnected devices may still hold events.

## ADR-007 — Offline package cryptographic integrity
**Status:** Approved  
**Decision:** Use Node.js crypto Ed25519 signature scheme to sign offline authorization packages issued to Android devices. Android verifies using Ed25519 public key before persisting to encrypted Room storage.  
**Consequences:** High performance, asymmetric verification (devices only hold public key), tampering prevention, explicit replay protection with expiry and authorization UUID.

## ADR-008 — Authentication & Tenant Isolation (Option A)
**Status:** Approved  
**Decision:** Implement internal JWT access tokens (15-minute validity) paired with database-backed refresh tokens (7-day validity, SHA-256 hashed in DB with rotation on use) and Argon2id password hashing, strictly scoped to `organization_id`.  
**Consequences:** Eliminates external identity provider dependency, keeps all multi-tenant authorization logic in PostgreSQL, supports instant revocation via refresh token invalidation, and guarantees complete tenant isolation across all endpoints.

## Open decisions — must be resolved before production
1. **Retention:** approve retention and deletion periods for roster snapshots, card mappings, raw/derived event evidence, audit events and imported files.
2. **Device enrollment:** define enrollment, device ownership, operator/device binding, revocation and replacement workflow.
3. **Offline event time:** define the evidence algorithm and review thresholds, including behavior after reboot or missing monotonic continuity; validate it on target Android versions.
4. **Conflicting event times:** define how accepted attendance time is represented when different devices capture the same person offline. Preserve all event evidence and never silently overwrite.
5. **Scheduled session windows:** define timezone, daylight-saving handling where applicable, early arrival and grace periods.
6. **Card technology:** establish supported card families, UID/data access assumptions and whether stronger card authentication is required.
7. **Operational targets:** set synchronization recovery SLOs, alert thresholds, performance targets and escalation ownership after pilot measurements.
8. **Hosting and key management:** select production hosting, managed secret/key storage, signing-key rotation and backup strategy.

## Change log
- Initial baseline generated: documents establish requirements and proposed architecture; they do not assert that implementation, hardware validation or tests have already been completed.
- ADR-007 & ADR-008 approved: Ed25519 package signing and Option A (Internal JWT + Argon2id) auth selected for implementation baseline.
