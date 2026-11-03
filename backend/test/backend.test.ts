import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import { buildApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { hashPassword } from '../src/modules/auth/authService.js';
import { sanitizeSpreadsheetCell, commitRosterImport } from '../src/modules/people/rosterService.js';

describe('AMAS Backend Comprehensive Test Suite', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  describe('1. Spreadsheet Import / Export Safeguards', () => {
    it('IMP-02: neutralizes formula injection triggers in export cells', () => {
      expect(sanitizeSpreadsheetCell('=SUM(A1:A10)')).toBe("'=SUM(A1:A10)");
      expect(sanitizeSpreadsheetCell('+cmd|/C calc')).toBe("'+cmd|/C calc");
      expect(sanitizeSpreadsheetCell('-100')).toBe("'-100");
      expect(sanitizeSpreadsheetCell('@admin')).toBe("'@admin");
      expect(sanitizeSpreadsheetCell('\tsecret')).toBe("'\tsecret");
      expect(sanitizeSpreadsheetCell('Normal Name')).toBe('Normal Name');
    });

    it('IMP-01: preserves leading zeros in external IDs during roster commit', async () => {
      const orgSlug = `test-org-${Date.now()}`;
      const { rows: [org] } = await pool.query(
        'INSERT INTO organizations (name, slug) VALUES ($1, $2) RETURNING id',
        ['Test Org', orgSlug]
      );

      const passwordHash = await hashPassword('password123');
      const { rows: [user] } = await pool.query(
        `INSERT INTO users (organization_id, email, password_hash, role)
         VALUES ($1, 'roster-admin@test.com', $2, 'ADMIN') RETURNING id`,
        [org.id, passwordHash]
      );

      const rows = [
        { externalId: '00101', fullName: 'Alice Wonder', email: 'alice@wonder.com' },
        { externalId: '00102', fullName: 'Bob Builder', email: 'bob@builder.com' },
      ];

      const result = await commitRosterImport(org.id, user.id, rows);
      expect(result.totalMembers).toBe(2);

      const { rows: people } = await pool.query(
        'SELECT external_id, full_name FROM people WHERE organization_id = $1 ORDER BY external_id ASC',
        [org.id]
      );

      expect(people[0].external_id).toBe('00101'); // Crucial invariant: leading zeros NOT lost
      expect(people[1].external_id).toBe('00102');
    });
  });

  describe('2. Authentication & Tenant Isolation (SEC-01 & Option A)', () => {
    let orgAId: string;
    let orgBId: string;
    let userAId: string;
    let tokenA: string;
    let refreshTokenA: string;

    beforeAll(async () => {
      const slugA = `tenant-a-${Date.now()}`;
      const slugB = `tenant-b-${Date.now()}`;

      const { rows: [orgA] } = await pool.query(
        'INSERT INTO organizations (name, slug) VALUES ($1, $2) RETURNING id',
        ['Tenant A Corp', slugA]
      );
      orgAId = orgA.id;

      const { rows: [orgB] } = await pool.query(
        'INSERT INTO organizations (name, slug) VALUES ($1, $2) RETURNING id',
        ['Tenant B Corp', slugB]
      );
      orgBId = orgB.id;

      const passwordHash = await hashPassword('correct-password-123');

      const { rows: [userA] } = await pool.query(
        `INSERT INTO users (organization_id, email, password_hash, role)
         VALUES ($1, 'operator@tenant-a.com', $2, 'OPERATOR')
         RETURNING id`,
        [orgAId, passwordHash]
      );
      userAId = userA.id;
    });

    it('authenticates user and returns JWT + Refresh Token with Argon2id validation', async () => {
      const { rows: [org] } = await pool.query('SELECT slug FROM organizations WHERE id = $1', [orgAId]);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          orgSlug: org.slug,
          email: 'operator@tenant-a.com',
          password: 'correct-password-123',
        },
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.accessToken).toBeDefined();
      expect(data.refreshToken).toBeDefined();
      expect(data.user.email).toBe('operator@tenant-a.com');
      expect(data.user.organizationId).toBe(orgAId);

      tokenA = data.accessToken;
      refreshTokenA = data.refreshToken;
    });

    it('rejects invalid password', async () => {
      const { rows: [org] } = await pool.query('SELECT slug FROM organizations WHERE id = $1', [orgAId]);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          orgSlug: org.slug,
          email: 'operator@tenant-a.com',
          password: 'wrong-password',
        },
      });

      expect(res.statusCode).toBe(401);
    });

    it('rotates refresh token on use and invalidates old token', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        payload: {
          refreshToken: refreshTokenA,
        },
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.accessToken).toBeDefined();
      expect(data.refreshToken).toBeDefined();
      expect(data.refreshToken).not.toBe(refreshTokenA); // New rotated token

      // Replay attack check: Reusing the old revoked refresh token MUST fail
      const replayRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        payload: {
          refreshToken: refreshTokenA,
        },
      });
      expect(replayRes.statusCode).toBe(401);
    });

    it('SEC-01: enforces tenant isolation on sessions (Tenant A cannot see Tenant B sessions)', async () => {
      // Create session in Tenant B
      const { rows: [rvB] } = await pool.query(
        `INSERT INTO roster_versions (organization_id, version_number, digest_sha256)
         VALUES ($1, 1, 'digest-b') RETURNING id`,
        [orgBId]
      );

      const { rows: [sessionB] } = await pool.query(
        `INSERT INTO sessions (organization_id, title, roster_version_id, state, scheduled_start, scheduled_end)
         VALUES ($1, 'Tenant B Secret Session', $2, 'OPEN', NOW(), NOW() + INTERVAL '1 hour')
         RETURNING id`,
        [orgBId, rvB.id]
      );

      // Operator A tries to access Tenant B session
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/sessions/${sessionB.id}`,
        headers: {
          authorization: `Bearer ${tokenA}`,
        },
      });

      expect(res.statusCode).toBe(404); // Must not find or leak cross-tenant session
    });
  });

  describe('3. Attendance Capture, Idempotency & Conflict Resolution', () => {
    let orgId: string;
    let token: string;
    let sessionId: string;
    let personId: string;
    let cardUid = '04A1B2C3D4';

    beforeAll(async () => {
      const slug = `scantest-${Date.now()}`;
      const { rows: [org] } = await pool.query(
        'INSERT INTO organizations (name, slug) VALUES ($1, $2) RETURNING id',
        ['Scan Test Org', slug]
      );
      orgId = org.id;

      const passwordHash = await hashPassword('password123');
      const { rows: [user] } = await pool.query(
        `INSERT INTO users (organization_id, email, password_hash, role)
         VALUES ($1, 'scanner@scantest.com', $2, 'OPERATOR') RETURNING id`,
        [orgId, passwordHash]
      );

      // Create Roster & Member
      const { rows: [rv] } = await pool.query(
        `INSERT INTO roster_versions (organization_id, version_number, digest_sha256)
         VALUES ($1, 1, 'digest-scan') RETURNING id`,
        [orgId]
      );

      const { rows: [person] } = await pool.query(
        `INSERT INTO people (organization_id, external_id, full_name)
         VALUES ($1, '00777', 'James Bond') RETURNING id`,
        [orgId]
      );
      personId = person.id;

      await pool.query(
        `INSERT INTO roster_memberships (roster_version_id, person_id) VALUES ($1, $2)`,
        [rv.id, personId]
      );

      // Register Card
      await pool.query(
        `INSERT INTO cards (organization_id, card_uid, person_id, is_active)
         VALUES ($1, $2, $3, TRUE)`,
        [orgId, cardUid, personId]
      );

      // Create Session in OPEN state
      const { rows: [session] } = await pool.query(
        `INSERT INTO sessions (organization_id, title, roster_version_id, state, scheduled_start, scheduled_end)
         VALUES ($1, 'Live Scan Session', $2, 'OPEN', NOW() - INTERVAL '5 minutes', NOW() + INTERVAL '2 hours')
         RETURNING id`,
        [orgId, rv.id]
      );
      sessionId = session.id;

      // Get auth token
      const loginRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { orgSlug: slug, email: 'scanner@scantest.com', password: 'password123' },
      });
      token = loginRes.json().accessToken;
    });

    it('records valid attendance on first scan', async () => {
      const eventId = crypto.randomUUID();
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/sessions/${sessionId}/scan`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          eventId,
          cardUid,
          deviceEventTime: new Date().toISOString(),
        },
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.outcome).toBe('ACCEPTED');
      expect(data.personName).toBe('James Bond');
      expect(data.isLate).toBe(false);

      // Verify PostgreSQL database record created
      const { rows: att } = await pool.query(
        'SELECT * FROM attendance_records WHERE session_id = $1 AND person_id = $2',
        [sessionId, personId]
      );
      expect(att.length).toBe(1);
    });

    it('SYNC-02: returns identical ACCEPTED outcome on idempotent retry of same eventId', async () => {
      const eventId = crypto.randomUUID();
      const eventPayload = {
        eventId,
        cardUid,
        deviceEventTime: new Date().toISOString(),
      };

      // First call
      const res1 = await app.inject({
        method: 'POST',
        url: `/api/v1/sessions/${sessionId}/scan`,
        headers: { authorization: `Bearer ${token}` },
        payload: eventPayload,
      });

      // Second call with EXACT same eventId (network retry simulation)
      const res2 = await app.inject({
        method: 'POST',
        url: `/api/v1/sessions/${sessionId}/scan`,
        headers: { authorization: `Bearer ${token}` },
        payload: eventPayload,
      });

      expect(res2.statusCode).toBe(200);
      expect(res2.json().outcome).toBe(res1.json().outcome);
      expect(res2.json().eventId).toBe(eventId);
    });

    it('SYNC-04: multi-device duplicate tap returns DUPLICATE outcome without creating second attendance row', async () => {
      // New distinct event ID representing a second scan from another device
      const secondDeviceEventId = crypto.randomUUID();

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/sessions/${sessionId}/scan`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          eventId: secondDeviceEventId,
          cardUid, // Same person's card
          deviceEventTime: new Date().toISOString(),
        },
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.outcome).toBe('DUPLICATE');
      expect(data.reason).toBe('ALREADY_RECORDED');

      // Database constraint must guarantee only 1 attendance row per (session_id, person_id)
      const { rows: att } = await pool.query(
        'SELECT * FROM attendance_records WHERE session_id = $1 AND person_id = $2',
        [sessionId, personId]
      );
      expect(att.length).toBe(1);
    });

    it('rejects unregistered cards', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/sessions/${sessionId}/scan`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          eventId: crypto.randomUUID(),
          cardUid: 'DEADBEEF99', // Not registered
          deviceEventTime: new Date().toISOString(),
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().outcome).toBe('REJECTED');
      expect(res.json().reason).toBe('CARD_NOT_REGISTERED');
    });
  });

  describe('4. Finalization Gate Enforcement (FIN-01, FIN-02, FIN-03)', () => {
    let orgId: string;
    let token: string;
    let sessionId: string;
    let personId: string;

    beforeAll(async () => {
      const slug = `fin-${Date.now()}`;
      const { rows: [org] } = await pool.query(
        'INSERT INTO organizations (name, slug) VALUES ($1, $2) RETURNING id',
        ['Finalization Org', slug]
      );
      orgId = org.id;

      const passwordHash = await hashPassword('password123');
      await pool.query(
        `INSERT INTO users (organization_id, email, password_hash, role)
         VALUES ($1, 'lead@fin.com', $2, 'ADMIN')`,
        [orgId, passwordHash]
      );

      const { rows: [rv] } = await pool.query(
        `INSERT INTO roster_versions (organization_id, version_number, digest_sha256)
         VALUES ($1, 1, 'digest-fin') RETURNING id`,
        [orgId]
      );

      const { rows: [person] } = await pool.query(
        `INSERT INTO people (organization_id, external_id, full_name)
         VALUES ($1, '00999', 'Audited Person') RETURNING id`,
        [orgId]
      );
      personId = person.id;

      await pool.query(
        `INSERT INTO roster_memberships (roster_version_id, person_id) VALUES ($1, $2)`,
        [rv.id, personId]
      );

      // Session in REVIEW state
      const { rows: [session] } = await pool.query(
        `INSERT INTO sessions (organization_id, title, roster_version_id, state, scheduled_start, scheduled_end)
         VALUES ($1, 'Review Session', $2, 'REVIEW', NOW() - INTERVAL '1 hour', NOW())
         RETURNING id`,
        [orgId, rv.id]
      );
      sessionId = session.id;

      const loginRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { orgSlug: slug, email: 'lead@fin.com', password: 'password123' },
      });
      token = loginRes.json().accessToken;
    });

    it('FIN-02: rejects finalization with HTTP 409 when unresolved NEEDS_REVIEW event exists', async () => {
      // Insert an event in NEEDS_REVIEW
      await pool.query(
        `INSERT INTO attendance_events (
          event_id, organization_id, session_id, card_uid_logged, device_event_time, outcome, outcome_reason
         ) VALUES ($1, $2, $3, 'BADUID', NOW(), 'NEEDS_REVIEW', 'CLOCK_ANOMALY')`,
        [crypto.randomUUID(), orgId, sessionId]
      );

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/sessions/${sessionId}/finalize`,
        headers: { authorization: `Bearer ${token}` },
        payload: {},
      });

      expect(res.statusCode).toBe(409);
      expect(res.json().code).toBe('UNRESOLVED_EVENTS_EXIST');
    });

    it('FIN-03: finalization succeeds once exceptions resolved, creating immutable snapshot', async () => {
      // Resolve the NEEDS_REVIEW event
      await pool.query(
        `UPDATE attendance_events SET outcome = 'REJECTED', outcome_reason = 'RESOLVED_BY_OPERATOR'
         WHERE session_id = $1 AND outcome = 'NEEDS_REVIEW'`,
        [sessionId]
      );

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/sessions/${sessionId}/finalize`,
        headers: { authorization: `Bearer ${token}` },
        payload: { forceAcknowledgeMissingDevices: true },
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.state).toBe('FINALIZED');
      expect(data.snapshot).toBeDefined();
      expect(data.snapshot.expectedCount).toBe(1);

      // Confirm session state in DB is FINALIZED
      const { rows: [session] } = await pool.query('SELECT state, finalized_at FROM sessions WHERE id = $1', [sessionId]);
      expect(session.state).toBe('FINALIZED');
      expect(session.finalized_at).not.toBeNull();
    });
  });
});
