import { pool } from '../../db/pool.js';
import type { FinalizeSessionResponse } from '@amas/contracts';

export class FinalizationGateError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'FinalizationGateError';
  }
}

export async function finalizeSession(
  sessionId: string,
  organizationId: string,
  actorId: string,
  forceAcknowledgeMissingDevices = false
): Promise<FinalizeSessionResponse> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Lock session row
    const { rows: sessionRows } = await client.query(
      'SELECT * FROM sessions WHERE id = $1 AND organization_id = $2 FOR UPDATE',
      [sessionId, organizationId]
    );

    if (sessionRows.length === 0) {
      throw new FinalizationGateError('SESSION_NOT_FOUND', 'Session not found');
    }

    const session = sessionRows[0];
    if (session.state !== 'REVIEW') {
      throw new FinalizationGateError(
        'SESSION_NOT_IN_REVIEW',
        `Session must be in REVIEW state to finalize. Current state is '${session.state}'`
      );
    }

    // 2. Gate check: Zero unresolved NEEDS_REVIEW events
    const { rows: unresolvedRows } = await client.query(
      `SELECT count(*)::int as count
       FROM attendance_events
       WHERE session_id = $1 AND outcome = 'NEEDS_REVIEW'`,
      [sessionId]
    );

    const unresolvedCount = unresolvedRows[0].count;
    if (unresolvedCount > 0) {
      throw new FinalizationGateError(
        'UNRESOLVED_EVENTS_EXIST',
        `Cannot finalize session: ${unresolvedCount} event(s) remain in NEEDS_REVIEW. All exceptions must be resolved first.`,
        { unresolvedCount }
      );
    }

    // 3. Operational check: Unexpired offline authorizations for devices that have not synced
    const { rows: activeLeases } = await client.query(
      `SELECT oa.id, oa.device_id, oa.expires_at, d.label as device_label
       FROM offline_authorizations oa
       JOIN devices d ON d.id = oa.device_id
       WHERE oa.session_id = $1 AND oa.expires_at > NOW()`,
      [sessionId]
    );

    if (activeLeases.length > 0 && !forceAcknowledgeMissingDevices) {
      throw new FinalizationGateError(
        'ACTIVE_OFFLINE_LEASES_EXIST',
        `There are ${activeLeases.length} device(s) with unexpired offline authorization. Please confirm that all scanners have synced.`,
        { activeLeases: activeLeases.map((l) => ({ deviceId: l.device_id, label: l.device_label, expiresAt: l.expires_at })) }
      );
    }

    // 4. Retrieve accepted attendance records and compute summary
    const { rows: records } = await client.query(
      `SELECT ar.person_id, p.external_id, p.full_name, ar.marked_present_at, ar.is_late, ar.source
       FROM attendance_records ar
       JOIN people p ON p.id = ar.person_id
       WHERE ar.session_id = $1
       ORDER BY ar.marked_present_at ASC`,
      [sessionId]
    );

    // Get expected total roster count
    const { rows: rosterTotalRows } = await client.query(
      `SELECT count(*)::int as total
       FROM roster_memberships
       WHERE roster_version_id = $1`,
      [session.roster_version_id]
    );
    const expectedRosterCount = rosterTotalRows[0].total;

    const finalizedAtDate = new Date();
    const snapshot = {
      finalizedAt: finalizedAtDate.toISOString(),
      finalizedBy: actorId,
      organizationId,
      sessionId,
      rosterVersionId: session.roster_version_id,
      expectedCount: expectedRosterCount,
      presentCount: records.length,
      absentCount: Math.max(0, expectedRosterCount - records.length),
      lateCount: records.filter((r) => r.is_late).length,
      records: records.map((r) => ({
        personId: r.person_id,
        externalId: r.external_id,
        fullName: r.full_name,
        presentAt: r.marked_present_at,
        isLate: r.is_late,
        source: r.source,
      })),
    };

    // 5. Update session to FINALIZED with immutable snapshot
    await client.query(
      `UPDATE sessions
       SET state = 'FINALIZED',
           finalized_at = $1,
           finalized_by = $2,
           finalized_snapshot = $3
       WHERE id = $4`,
      [finalizedAtDate, actorId, JSON.stringify(snapshot), sessionId]
    );

    // 6. Record audit event
    await client.query(
      `INSERT INTO audit_events (organization_id, actor_id, action, resource_type, resource_id, details)
       VALUES ($1, $2, 'SESSION_FINALIZED', 'SESSION', $3, $4)`,
      [organizationId, actorId, sessionId, JSON.stringify({ presentCount: records.length, expectedCount: expectedRosterCount })]
    );

    await client.query('COMMIT');

    return {
      sessionId,
      state: 'FINALIZED',
      finalizedAt: finalizedAtDate.toISOString(),
      finalizedBy: actorId,
      totalAccepted: records.length,
      snapshot,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
