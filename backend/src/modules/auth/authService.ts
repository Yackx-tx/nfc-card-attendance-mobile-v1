import argon2 from 'argon2';
import crypto from 'node:crypto';
import type { PoolClient } from 'pg';
import { pool } from '../../db/pool.js';
import type { UserRole, UserContext } from '@amas/contracts';

export interface UserRow {
  id: string;
  organization_id: string;
  email: string;
  password_hash: string;
  role: UserRole;
  created_at: Date;
}

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
  });
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return argon2.verify(hash, password);
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function generateRefreshToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export async function storeRefreshToken(
  userId: string,
  refreshToken: string,
  expiresInDays = 7,
  client?: PoolClient
): Promise<void> {
  const tokenHash = hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);
  const executor = client || pool;

  await executor.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, tokenHash, expiresAt]
  );
}

export async function verifyAndRotateRefreshToken(
  refreshToken: string,
  newRefreshToken: string
): Promise<UserContext | null> {
  const tokenHash = hashToken(refreshToken);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Find valid, unexpired, unrevoked token
    const { rows } = await client.query(
      `SELECT rt.id, rt.user_id, rt.expires_at, rt.revoked_at,
              u.id as user_id, u.organization_id, u.email, u.role
       FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
       WHERE rt.token_hash = $1
       FOR UPDATE`,
      [tokenHash]
    );

    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return null;
    }

    const tokenRow = rows[0];

    // If token already revoked, possible replay attack - invalidate all user tokens
    if (tokenRow.revoked_at !== null) {
      await client.query(
        'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL',
        [tokenRow.user_id]
      );
      await client.query('COMMIT');
      return null;
    }

    // Check expiration
    if (new Date(tokenRow.expires_at) < new Date()) {
      await client.query('ROLLBACK');
      return null;
    }

    // 2. Revoke old token
    await client.query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1', [tokenRow.id]);

    // 3. Store new rotated token
    await storeRefreshToken(tokenRow.user_id, newRefreshToken, 7, client);

    await client.query('COMMIT');

    return {
      id: tokenRow.user_id,
      organizationId: tokenRow.organization_id,
      email: tokenRow.email,
      role: tokenRow.role as UserRole,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function findUserByOrgSlugAndEmail(
  orgSlug: string,
  email: string
): Promise<UserRow | null> {
  const { rows } = await pool.query(
    `SELECT u.id, u.organization_id, u.email, u.password_hash, u.role, u.created_at
     FROM users u
     JOIN organizations o ON o.id = u.organization_id
     WHERE o.slug = $1 AND u.email = $2`,
    [orgSlug.toLowerCase(), email.toLowerCase()]
  );

  return rows.length > 0 ? rows[0] : null;
}
