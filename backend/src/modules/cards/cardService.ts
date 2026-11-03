import { pool } from '../../db/pool.js';

export interface CardRow {
  id: string;
  organization_id: string;
  card_uid: string;
  person_id: string;
  is_active: boolean;
  assigned_at: Date;
}

export function normalizeCardUid(uid: string): string {
  return uid.replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
}

export async function registerCard(
  organizationId: string,
  personId: string,
  rawCardUid: string,
  actorId?: string
): Promise<CardRow> {
  const normalizedUid = normalizeCardUid(rawCardUid);
  if (!normalizedUid || normalizedUid.length < 4) {
    throw new Error('INVALID_CARD_UID');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Verify person exists in organization
    const { rows: personRows } = await client.query(
      'SELECT id FROM people WHERE id = $1 AND organization_id = $2',
      [personId, organizationId]
    );
    if (personRows.length === 0) {
      throw new Error('PERSON_NOT_FOUND');
    }

    // Deactivate any previous card assigned to this person
    await client.query(
      'UPDATE cards SET is_active = FALSE WHERE organization_id = $1 AND person_id = $2',
      [organizationId, personId]
    );

    // Upsert the card assignment
    const { rows } = await client.query(
      `INSERT INTO cards (organization_id, card_uid, person_id, is_active)
       VALUES ($1, $2, $3, TRUE)
       ON CONFLICT (organization_id, card_uid)
       DO UPDATE SET person_id = EXCLUDED.person_id, is_active = TRUE, assigned_at = NOW()
       RETURNING id, organization_id, card_uid, person_id, is_active, assigned_at`,
      [organizationId, normalizedUid, personId]
    );

    // Audit log
    if (actorId) {
      await client.query(
        `INSERT INTO audit_events (organization_id, actor_id, action, resource_type, resource_id, details)
         VALUES ($1, $2, 'CARD_REGISTERED', 'CARD', $3, $4)`,
        [organizationId, actorId, rows[0].id, JSON.stringify({ cardUid: normalizedUid, personId })]
      );
    }

    await client.query('COMMIT');
    return rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function lookupCard(
  organizationId: string,
  rawCardUid: string
): Promise<(CardRow & { person_name: string; external_id: string }) | null> {
  const normalizedUid = normalizeCardUid(rawCardUid);
  const { rows } = await pool.query(
    `SELECT c.id, c.organization_id, c.card_uid, c.person_id, c.is_active, c.assigned_at,
            p.full_name as person_name, p.external_id
     FROM cards c
     JOIN people p ON p.id = c.person_id
     WHERE c.organization_id = $1 AND c.card_uid = $2 AND c.is_active = TRUE`,
    [organizationId, normalizedUid]
  );

  return rows.length > 0 ? rows[0] : null;
}
