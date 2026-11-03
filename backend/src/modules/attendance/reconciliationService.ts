import type { PoolClient } from 'pg';
import { pool } from '../../db/pool.js';
import { normalizeCardUid } from '../cards/cardService.js';
import type { ScanEventItem, ScanEventOutcome, EventOutcome } from '@amas/contracts';

export async function processSingleScanEvent(
  organizationId: string,
  sessionId: string,
  event: ScanEventItem,
  source: 'ONLINE_SCAN' | 'OFFLINE_SYNC',
  client?: PoolClient
): Promise<ScanEventOutcome> {
  const executor = client || pool;
  const normalizedUid = normalizeCardUid(event.cardUid);

  // 1. Idempotency Check: Stable response on retries
  const { rows: existingEventRows } = await executor.query(
    `SELECT ae.event_id, ae.outcome, ae.outcome_reason, ae.person_id,
            p.full_name as person_name, ar.marked_present_at, ar.is_late
     FROM attendance_events ae
     LEFT JOIN people p ON p.id = ae.person_id
     LEFT JOIN attendance_records ar ON ar.session_id = ae.session_id AND ar.person_id = ae.person_id
     WHERE ae.event_id = $1`,
    [event.eventId]
  );

  if (existingEventRows.length > 0) {
    const existing = existingEventRows[0];
    return {
      eventId: existing.event_id,
      outcome: existing.outcome as EventOutcome,
      reason: existing.outcome_reason || undefined,
      personId: existing.person_id || undefined,
      personName: existing.person_name || undefined,
      isLate: existing.is_late !== null ? existing.is_late : undefined,
      markedPresentAt: existing.marked_present_at ? new Date(existing.marked_present_at).toISOString() : undefined,
    };
  }

  // 2. Validate Session
  const { rows: sessionRows } = await executor.query(
    'SELECT * FROM sessions WHERE id = $1 AND organization_id = $2',
    [sessionId, organizationId]
  );

  if (sessionRows.length === 0) {
    return recordEventOutcome(
      executor,
      event.eventId,
      organizationId,
      sessionId,
      null,
      null,
      null,
      normalizedUid,
      event.deviceEventTime,
      event.monotonicElapsedMs,
      'REJECTED',
      'SESSION_NOT_FOUND'
    );
  }

  const session = sessionRows[0];
  if (session.state !== 'OPEN' && session.state !== 'REVIEW') {
    return recordEventOutcome(
      executor,
      event.eventId,
      organizationId,
      sessionId,
      null,
      null,
      null,
      normalizedUid,
      event.deviceEventTime,
      event.monotonicElapsedMs,
      'REJECTED',
      `SESSION_NOT_ACCEPTING_SCANS: Session state is ${session.state}`
    );
  }

  // 3. Resolve Card Mapping
  const { rows: cardRows } = await executor.query(
    `SELECT c.id, c.person_id, c.is_active, p.full_name, p.external_id
     FROM cards c
     JOIN people p ON p.id = c.person_id
     WHERE c.organization_id = $1 AND c.card_uid = $2`,
    [organizationId, normalizedUid]
  );

  if (cardRows.length === 0) {
    return recordEventOutcome(
      executor,
      event.eventId,
      organizationId,
      sessionId,
      null,
      null,
      null,
      normalizedUid,
      event.deviceEventTime,
      event.monotonicElapsedMs,
      'REJECTED',
      'CARD_NOT_REGISTERED'
    );
  }

  const card = cardRows[0];
  if (!card.is_active) {
    return recordEventOutcome(
      executor,
      event.eventId,
      organizationId,
      sessionId,
      null,
      null,
      card.person_id,
      normalizedUid,
      event.deviceEventTime,
      event.monotonicElapsedMs,
      'REJECTED',
      'CARD_INACTIVE'
    );
  }

  // 4. Verify Roster Membership
  const { rows: rosterMembership } = await executor.query(
    `SELECT 1 FROM roster_memberships
     WHERE roster_version_id = $1 AND person_id = $2`,
    [session.roster_version_id, card.person_id]
  );

  if (rosterMembership.length === 0) {
    return recordEventOutcome(
      executor,
      event.eventId,
      organizationId,
      sessionId,
      null,
      null,
      card.person_id,
      normalizedUid,
      event.deviceEventTime,
      event.monotonicElapsedMs,
      'REJECTED',
      'PERSON_NOT_IN_SESSION_ROSTER'
    );
  }

  // 5. Offline Timing / Authorization Checks
  let authorizationId: string | null = null;
  let deviceId: string | null = null;

  if (event.authorizationId) {
    const { rows: authRows } = await executor.query(
      `SELECT oa.id, oa.device_id, oa.expires_at, oa.issued_at
       FROM offline_authorizations oa
       WHERE oa.id = $1 AND oa.session_id = $2 AND oa.organization_id = $3`,
      [event.authorizationId, sessionId, organizationId]
    );

    if (authRows.length === 0) {
      return recordEventOutcome(
        executor,
        event.eventId,
        organizationId,
        sessionId,
        null,
        null,
        card.person_id,
        normalizedUid,
        event.deviceEventTime,
        event.monotonicElapsedMs,
        'NEEDS_REVIEW',
        'OFFLINE_AUTHORIZATION_INVALID'
      );
    }

    const auth = authRows[0];
    authorizationId = auth.id;
    deviceId = auth.device_id;

    // Check device clock anomaly (ADR-003: Wall clock anomaly or captured before issue time)
    const deviceTimeMs = new Date(event.deviceEventTime).getTime();
    const issuedAtMs = new Date(auth.issued_at).getTime();
    if (deviceTimeMs < issuedAtMs - 60000) {
      // Event claimed to be captured before authorization was even issued
      return recordEventOutcome(
        executor,
        event.eventId,
        organizationId,
        sessionId,
        authorizationId,
        deviceId,
        card.person_id,
        normalizedUid,
        event.deviceEventTime,
        event.monotonicElapsedMs,
        'NEEDS_REVIEW',
        'CLOCK_ANOMALY_CAPTURED_BEFORE_ISSUANCE'
      );
    }
  }

  // 6. Check Lateness
  const scheduledStartTime = new Date(session.scheduled_start).getTime();
  const eventTime = new Date(event.deviceEventTime).getTime();
  const isLate = eventTime > scheduledStartTime + 15 * 60 * 1000; // 15 mins default threshold

  // 7. Reconcile Attendance Under Database Constraint UNIQUE(session_id, person_id)
  try {
    // Save to attendance_events first to get FK
    const { rows: eventInsertRows } = await executor.query(
      `INSERT INTO attendance_events (
        event_id, organization_id, session_id, authorization_id, device_id,
        person_id, card_uid_logged, device_event_time, monotonic_elapsed_ms,
        outcome, outcome_reason
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'ACCEPTED', NULL)
       RETURNING id`,
      [
        event.eventId,
        organizationId,
        sessionId,
        authorizationId,
        deviceId,
        card.person_id,
        normalizedUid,
        event.deviceEventTime,
        event.monotonicElapsedMs || null,
      ]
    );
    const dbEventId = eventInsertRows[0].id;

    // Insert attendance record
    const { rows: attRows } = await executor.query(
      `INSERT INTO attendance_records (
        organization_id, session_id, person_id, first_event_id, marked_present_at, is_late, source
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING marked_present_at`,
      [
        organizationId,
        sessionId,
        card.person_id,
        dbEventId,
        event.deviceEventTime,
        isLate,
        source,
      ]
    );

    return {
      eventId: event.eventId,
      outcome: 'ACCEPTED',
      personId: card.person_id,
      personName: card.full_name,
      isLate,
      markedPresentAt: new Date(attRows[0].marked_present_at).toISOString(),
    };
  } catch (err: unknown) {
    // Unique violation error code in PostgreSQL is 23505
    if (typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === '23505') {
      // Check if duplicate on (session_id, person_id)
      await executor.query(
        `UPDATE attendance_events
         SET outcome = 'DUPLICATE', outcome_reason = 'ALREADY_RECORDED'
         WHERE event_id = $1`,
        [event.eventId]
      );

      return {
        eventId: event.eventId,
        outcome: 'DUPLICATE',
        reason: 'ALREADY_RECORDED',
        personId: card.person_id,
        personName: card.full_name,
      };
    }
    throw err;
  }
}

async function recordEventOutcome(
  executor: PoolClient | typeof pool,
  eventId: string,
  organizationId: string,
  sessionId: string,
  authorizationId: string | null,
  deviceId: string | null,
  personId: string | null,
  cardUid: string,
  deviceEventTime: string,
  monotonicElapsedMs: number | undefined,
  outcome: EventOutcome,
  reason: string
): Promise<ScanEventOutcome> {
  await executor.query(
    `INSERT INTO attendance_events (
      event_id, organization_id, session_id, authorization_id, device_id,
      person_id, card_uid_logged, device_event_time, monotonic_elapsed_ms,
      outcome, outcome_reason
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (event_id) DO NOTHING`,
    [
      eventId,
      organizationId,
      sessionId,
      authorizationId,
      deviceId,
      personId,
      cardUid,
      deviceEventTime,
      monotonicElapsedMs || null,
      outcome,
      reason,
    ]
  );

  return {
    eventId,
    outcome,
    reason,
    personId: personId || undefined,
  };
}

export async function processBatchSync(
  organizationId: string,
  sessionId: string,
  events: ScanEventItem[]
): Promise<ScanEventOutcome[]> {
  const outcomes: ScanEventOutcome[] = [];
  const client = await pool.connect();

  try {
    for (const evt of events) {
      await client.query('BEGIN');
      try {
        const result = await processSingleScanEvent(organizationId, sessionId, evt, 'OFFLINE_SYNC', client);
        await client.query('COMMIT');
        outcomes.push(result);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`Error reconciling event ${evt.eventId}:`, err);
        outcomes.push({
          eventId: evt.eventId,
          outcome: 'NEEDS_REVIEW',
          reason: 'DATABASE_ERROR_DURING_RECONCILIATION',
        });
      }
    }
    return outcomes;
  } finally {
    client.release();
  }
}
