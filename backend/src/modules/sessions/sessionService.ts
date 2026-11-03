import { pool } from '../../db/pool.js';
import type { SessionState } from '@amas/contracts';

export interface SessionRow {
  id: string;
  organization_id: string;
  title: string;
  roster_version_id: string;
  state: SessionState;
  scheduled_start: Date;
  scheduled_end: Date;
  finalized_at: Date | null;
  finalized_by: string | null;
  finalized_snapshot: Record<string, unknown> | null;
  created_at: Date;
}

const ALLOWED_TRANSITIONS: Record<SessionState, SessionState[]> = {
  DRAFT: ['OPEN', 'CANCELLED'],
  OPEN: ['REVIEW', 'CANCELLED'],
  REVIEW: ['FINALIZED', 'CANCELLED'],
  FINALIZED: ['REOPENED'],
  REOPENED: ['REVIEW', 'CANCELLED'],
  CANCELLED: [],
};

export async function createSession(
  organizationId: string,
  title: string,
  rosterVersionId: string,
  scheduledStart: string,
  scheduledEnd: string
): Promise<SessionRow> {
  const { rows } = await pool.query(
    `INSERT INTO sessions (organization_id, title, roster_version_id, state, scheduled_start, scheduled_end)
     VALUES ($1, $2, $3, 'DRAFT', $4, $5)
     RETURNING *`,
    [organizationId, title, rosterVersionId, scheduledStart, scheduledEnd]
  );
  return rows[0];
}

export async function getSessionById(id: string, organizationId: string): Promise<SessionRow | null> {
  const { rows } = await pool.query(
    'SELECT * FROM sessions WHERE id = $1 AND organization_id = $2',
    [id, organizationId]
  );
  return rows.length > 0 ? rows[0] : null;
}

export async function transitionSessionState(
  sessionId: string,
  organizationId: string,
  targetState: SessionState,
  actorId: string,
  reason?: string
): Promise<SessionRow> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      'SELECT * FROM sessions WHERE id = $1 AND organization_id = $2 FOR UPDATE',
      [sessionId, organizationId]
    );

    if (rows.length === 0) {
      throw new Error('SESSION_NOT_FOUND');
    }

    const currentSession: SessionRow = rows[0];
    const allowed = ALLOWED_TRANSITIONS[currentSession.state] || [];

    if (!allowed.includes(targetState)) {
      throw new Error(
        `INVALID_STATE_TRANSITION: Cannot transition session from '${currentSession.state}' to '${targetState}'`
      );
    }

    // Special checks
    if (targetState === 'FINALIZED') {
      throw new Error('USE_FINALIZATION_ENDPOINT: Finalization must pass the finalization gate check');
    }

    if (targetState === 'REOPENED' && !reason) {
      throw new Error('REASON_REQUIRED: Reopening a finalized session requires an audited reason');
    }

    const { rows: updatedRows } = await client.query(
      `UPDATE sessions
       SET state = $1
       WHERE id = $2
       RETURNING *`,
      [targetState, sessionId]
    );

    // Audit transition
    await client.query(
      `INSERT INTO audit_events (organization_id, actor_id, action, resource_type, resource_id, details)
       VALUES ($1, $2, 'SESSION_STATE_TRANSITION', 'SESSION', $3, $4)`,
      [
        organizationId,
        actorId,
        sessionId,
        JSON.stringify({ from: currentSession.state, to: targetState, reason }),
      ]
    );

    await client.query('COMMIT');
    return updatedRows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
