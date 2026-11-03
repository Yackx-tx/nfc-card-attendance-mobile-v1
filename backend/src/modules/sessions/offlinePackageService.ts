import crypto from 'node:crypto';
import { pool } from '../../db/pool.js';
import type { OfflineAuthorizationPackage, PersonMapping } from '@amas/contracts';

// In-memory or env Ed25519 keypair for signing
let ed25519KeyPair: { privateKey: string; publicKey: string } | null = null;

export function getOrCreateSigningKeys() {
  if (!ed25519KeyPair) {
    if (process.env.ED25519_PRIVATE_KEY && process.env.ED25519_PUBLIC_KEY) {
      ed25519KeyPair = {
        privateKey: process.env.ED25519_PRIVATE_KEY,
        publicKey: process.env.ED25519_PUBLIC_KEY,
      };
    } else {
      const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519', {
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
        publicKeyEncoding: { type: 'spki', format: 'pem' },
      });
      ed25519KeyPair = { privateKey, publicKey };
    }
  }
  return ed25519KeyPair;
}

export function getPublicKeyPem(): string {
  return getOrCreateSigningKeys().publicKey;
}

export async function issueOfflineAuthorizationPackage(
  organizationId: string,
  sessionId: string,
  deviceFingerprint: string,
  userId: string,
  leaseDurationSeconds = 8 * 3600 // 8 hours default baseline
): Promise<OfflineAuthorizationPackage> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Validate session
    const { rows: sessionRows } = await client.query(
      'SELECT * FROM sessions WHERE id = $1 AND organization_id = $2',
      [sessionId, organizationId]
    );
    if (sessionRows.length === 0) {
      throw new Error('SESSION_NOT_FOUND');
    }
    const session = sessionRows[0];
    if (session.state !== 'OPEN') {
      throw new Error(`SESSION_NOT_OPEN: Session is in '${session.state}' state, must be OPEN to authorize offline`);
    }

    // 2. Ensure device registered
    let deviceId: string;
    const { rows: devRows } = await client.query(
      'SELECT id, is_active FROM devices WHERE organization_id = $1 AND device_fingerprint = $2',
      [organizationId, deviceFingerprint]
    );

    if (devRows.length === 0) {
      // Auto-register device as active operator device
      const { rows: newDev } = await client.query(
        `INSERT INTO devices (organization_id, device_fingerprint, label, is_active)
         VALUES ($1, $2, $3, TRUE)
         RETURNING id`,
        [organizationId, deviceFingerprint, `Device-${deviceFingerprint.slice(0, 8)}`]
      );
      deviceId = newDev[0].id;
    } else {
      if (!devRows[0].is_active) {
        throw new Error('DEVICE_INACTIVE');
      }
      deviceId = devRows[0].id;
    }

    // 3. Compute bounded expiry (ADR-002: max 12 hours, default 8 hours, bounded by session end)
    const now = Math.floor(Date.now() / 1000);
    const maxHardLease = 12 * 3600;
    const requestedLease = Math.min(leaseDurationSeconds, maxHardLease);

    const sessionEndTime = Math.floor(new Date(session.scheduled_end).getTime() / 1000);
    const effectiveExpiry = Math.min(now + requestedLease, sessionEndTime > now ? sessionEndTime : now + requestedLease);

    // 4. Retrieve roster version and active card mappings
    const { rows: rosterRows } = await client.query(
      `SELECT rv.version_number, rv.digest_sha256
       FROM roster_versions rv
       WHERE rv.id = $1`,
      [session.roster_version_id]
    );
    const rosterVersion = rosterRows[0].version_number;

    const { rows: peopleRows } = await client.query(
      `SELECT p.id as person_id, p.external_id, p.full_name, c.card_uid
       FROM roster_memberships rm
       JOIN people p ON p.id = rm.person_id
       LEFT JOIN cards c ON c.person_id = p.id AND c.is_active = TRUE
       WHERE rm.roster_version_id = $1`,
      [session.roster_version_id]
    );

    const peopleMappings: PersonMapping[] = peopleRows.map((r) => ({
      personId: r.person_id,
      externalId: r.external_id,
      fullName: r.full_name,
      cardUid: r.card_uid || '',
    }));

    const rosterDigest = crypto
      .createHash('sha256')
      .update(JSON.stringify(peopleMappings))
      .digest('hex');

    // 5. Generate authorization ID and insert record
    const authorizationId = crypto.randomUUID();
    const expiresAtDate = new Date(effectiveExpiry * 1000);

    const payload = {
      authorizationId,
      organizationId,
      sessionId,
      deviceFingerprint,
      rosterVersion,
      rosterDigest,
      peopleMappings,
      rules: {
        lateAfter: session.scheduled_start,
        maxLeaseSeconds: effectiveExpiry - now,
      },
    };

    const header = {
      version: 1,
      algorithm: 'Ed25519',
      issuedAt: now,
      expiresAt: effectiveExpiry,
    };

    // 6. Sign package with Ed25519
    const { privateKey } = getOrCreateSigningKeys();
    const payloadStringToSign = JSON.stringify({ header, payload });
    const sign = crypto.createSign('SHA256');
    sign.update(payloadStringToSign);
    sign.end();
    // Ed25519 with node:crypto
    const signature = crypto.sign(null, Buffer.from(payloadStringToSign), privateKey).toString('base64');

    await client.query(
      `INSERT INTO offline_authorizations (id, organization_id, session_id, device_id, issued_by, expires_at, signature)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [authorizationId, organizationId, sessionId, deviceId, userId, expiresAtDate, signature]
    );

    await client.query('COMMIT');

    return {
      header,
      payload,
      signature,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
