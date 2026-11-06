import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import dotenv from 'dotenv';
import {
  LoginRequestSchema,
  RefreshTokenRequestSchema,
  RegisterCardRequestSchema,
  CreateSessionRequestSchema,
  ScanEventItemSchema,
  SyncBatchRequestSchema,
  SessionStateSchema,
  type UserContext,
} from '@amas/contracts';
import {
  findUserByOrgSlugAndEmail,
  verifyPassword,
  generateRefreshToken,
  storeRefreshToken,
  verifyAndRotateRefreshToken,
} from './modules/auth/authService.js';
import { createOrganization, getOrganizationById } from './modules/organizations/organizationService.js';
import {
  previewRosterImport,
  commitRosterImport,
} from './modules/people/rosterService.js';
import { registerCard } from './modules/cards/cardService.js';
import {
  createSession,
  getSessionById,
  transitionSessionState,
} from './modules/sessions/sessionService.js';
import {
  issueOfflineAuthorizationPackage,
  getPublicKeyPem,
} from './modules/sessions/offlinePackageService.js';
import {
  processSingleScanEvent,
  processBatchSync,
} from './modules/attendance/reconciliationService.js';
import { finalizeSession, FinalizationGateError } from './modules/finalization/finalizationService.js';
import { pool } from './db/pool.js';

dotenv.config();

declare module 'fastify' {
  interface FastifyRequest {
    userContext?: UserContext;
  }
}

export function buildApp(): FastifyInstance {
  const app = Fastify({
    logger: process.env.NODE_ENV === 'test' ? false : { level: process.env.LOG_LEVEL || 'info' },
  });

  // Plugins
  app.register(cors, { origin: true });
  app.register(jwt, {
    secret: process.env.JWT_SECRET || 'dev-secret-key-at-least-32-characters-long',
  });
  app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB limit
  app.register(rateLimit, { max: 500, timeWindow: '1 minute' });

  // Custom Authentication Decorator
  app.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
      const decoded = request.user as { id: string; organizationId: string; email: string; role: string };
      request.userContext = {
        id: decoded.id,
        organizationId: decoded.organizationId,
        email: decoded.email,
        role: decoded.role as any,
      };
    } catch (err) {
      reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Invalid or missing token' });
    }
  });

  // Health checks
  app.get('/health/live', async () => ({ status: 'UP' }));
  app.get('/health/ready', async () => {
    try {
      await pool.query('SELECT 1');
      return { status: 'READY', database: 'CONNECTED' };
    } catch (err) {
      return { status: 'NOT_READY', database: 'DISCONNECTED' };
    }
  });

  // --- Auth Routes ---
  app.post('/api/v1/auth/login', async (request, reply) => {
    const body = LoginRequestSchema.parse(request.body);
    const user = await findUserByOrgSlugAndEmail(body.orgSlug, body.email);

    if (!user) {
      return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Invalid credentials' });
    }

    const isValid = await verifyPassword(body.password, user.password_hash);
    if (!isValid) {
      return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Invalid credentials' });
    }

    const userContext: UserContext = {
      id: user.id,
      organizationId: user.organization_id,
      email: user.email,
      role: user.role,
    };

    const accessToken = app.jwt.sign(userContext, { expiresIn: '15m' });
    const refreshToken = generateRefreshToken();
    await storeRefreshToken(user.id, refreshToken);

    return {
      accessToken,
      refreshToken,
      user: userContext,
    };
  });

  app.post('/api/v1/auth/refresh', async (request, reply) => {
    const body = RefreshTokenRequestSchema.parse(request.body);
    const newRefreshToken = generateRefreshToken();

    const userContext = await verifyAndRotateRefreshToken(body.refreshToken, newRefreshToken);
    if (!userContext) {
      return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Invalid or expired refresh token' });
    }

    const accessToken = app.jwt.sign(userContext, { expiresIn: '15m' });
    return {
      accessToken,
      refreshToken: newRefreshToken,
    };
  });

  app.get('/api/v1/auth/me', { preHandler: [(app as any).authenticate] }, async (request) => {
    return { user: request.userContext };
  });

  app.get('/api/v1/auth/public-key', async () => {
    return { publicKey: getPublicKeyPem() };
  });

  // --- Organizations Routes ---
  app.post('/api/v1/organizations', async (request, reply) => {
    const body = request.body as { name: string; slug: string };
    const org = await createOrganization(body.name, body.slug);
    return reply.status(201).send(org);
  });

  // --- People & Roster Routes ---
  app.post('/api/v1/people/import/preview', { preHandler: [(app as any).authenticate] }, async (request, reply) => {
    const file = await request.file();
    if (!file) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'No file uploaded' });
    }

    const buffer = await file.toBuffer();
    const result = await previewRosterImport(request.userContext!.organizationId, buffer);
    return result;
  });

  app.post('/api/v1/people/import/commit', { preHandler: [(app as any).authenticate] }, async (request) => {
    const body = request.body as { rows: any[] };
    const result = await commitRosterImport(
      request.userContext!.organizationId,
      request.userContext!.id,
      body.rows
    );
    return result;
  });

  app.get('/api/v1/people', { preHandler: [(app as any).authenticate] }, async (request) => {
    const { rows } = await pool.query(
      `SELECT p.id, p.external_id, p.full_name, p.email, p.group_name, c.card_uid
       FROM people p
       LEFT JOIN cards c ON c.person_id = p.id AND c.is_active = TRUE
       WHERE p.organization_id = $1
       ORDER BY p.external_id ASC`,
      [request.userContext!.organizationId]
    );
    return rows;
  });

  app.get('/api/v1/roster-versions', { preHandler: [(app as any).authenticate] }, async (request) => {
    const { rows } = await pool.query(
      `SELECT rv.id, rv.version_number, rv.created_at, COUNT(rm.person_id)::int as total_members
       FROM roster_versions rv
       LEFT JOIN roster_memberships rm ON rm.roster_version_id = rv.id
       WHERE rv.organization_id = $1
       GROUP BY rv.id, rv.version_number, rv.created_at
       ORDER BY rv.version_number DESC`,
      [request.userContext!.organizationId]
    );
    return rows;
  });

  // --- Cards Routes ---
  app.post('/api/v1/cards/register', { preHandler: [(app as any).authenticate] }, async (request, reply) => {
    const body = RegisterCardRequestSchema.parse(request.body);
    const card = await registerCard(
      request.userContext!.organizationId,
      body.personId,
      body.cardUid,
      request.userContext!.id
    );
    return reply.status(201).send(card);
  });

  // --- Sessions Routes ---
  app.post('/api/v1/sessions', { preHandler: [(app as any).authenticate] }, async (request, reply) => {
    const body = CreateSessionRequestSchema.parse(request.body);
    const session = await createSession(
      request.userContext!.organizationId,
      body.title,
      body.rosterVersionId,
      body.scheduledStart,
      body.scheduledEnd
    );
    return reply.status(201).send(session);
  });

  app.get('/api/v1/sessions', { preHandler: [(app as any).authenticate] }, async (request) => {
    const { rows } = await pool.query(
      `SELECT * FROM sessions WHERE organization_id = $1 ORDER BY created_at DESC`,
      [request.userContext!.organizationId]
    );
    return rows;
  });

  app.get('/api/v1/sessions/:id/attendance', { preHandler: [(app as any).authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const session = await getSessionById(id, request.userContext!.organizationId);
    if (!session) {
      return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Session not found' });
    }

    const { rows: attendeeRows } = await pool.query(
      `SELECT p.id as person_id, p.external_id, p.full_name, p.group_name, c.card_uid,
              ar.marked_present_at, ar.is_late, ar.source, ar.created_at as check_in_created_at
       FROM roster_memberships rm
       JOIN people p ON p.id = rm.person_id
       LEFT JOIN cards c ON c.person_id = p.id AND c.is_active = TRUE
       LEFT JOIN attendance_records ar ON ar.session_id = $1 AND ar.person_id = p.id
       WHERE rm.roster_version_id = $2
       ORDER BY ar.marked_present_at DESC NULLS LAST, p.full_name ASC`,
      [id, session.roster_version_id]
    );

    const { rows: recentEvents } = await pool.query(
      `SELECT ae.id, ae.event_id, ae.card_uid_logged, ae.outcome, ae.outcome_reason,
              ae.device_event_time, ae.processed_at as created_at, p.full_name as person_name, p.external_id
       FROM attendance_events ae
       LEFT JOIN people p ON p.id = ae.person_id
       WHERE ae.session_id = $1
       ORDER BY ae.processed_at DESC
       LIMIT 50`,
      [id]
    );

    const totalExpected = attendeeRows.length;
    const presentCount = attendeeRows.filter(r => r.marked_present_at !== null).length;
    const lateCount = attendeeRows.filter(r => r.is_late === true).length;

    return {
      session,
      summary: {
        totalExpected,
        presentCount,
        absentCount: totalExpected - presentCount,
        lateCount,
      },
      attendees: attendeeRows,
      recentEvents,
    };
  });

  app.get('/api/v1/sessions/:id', { preHandler: [(app as any).authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const session = await getSessionById(id, request.userContext!.organizationId);
    if (!session) {
      return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Session not found' });
    }
    return session;
  });

  app.post('/api/v1/sessions/:id/state', { preHandler: [(app as any).authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    const body = request.body as { targetState: string; reason?: string };
    const validTargetState = SessionStateSchema.parse(body.targetState);

    const updated = await transitionSessionState(
      id,
      request.userContext!.organizationId,
      validTargetState,
      request.userContext!.id,
      body.reason
    );
    return updated;
  });

  app.get('/api/v1/sessions/:id/offline-package', { preHandler: [(app as any).authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    const { deviceFingerprint } = request.query as { deviceFingerprint: string };

    const pkg = await issueOfflineAuthorizationPackage(
      request.userContext!.organizationId,
      id,
      deviceFingerprint || 'default-device',
      request.userContext!.id
    );
    return pkg;
  });

  // --- Attendance Capture & Sync Routes ---
  app.post('/api/v1/sessions/:id/scan', { preHandler: [(app as any).authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    const event = ScanEventItemSchema.parse(request.body);

    const outcome = await processSingleScanEvent(
      request.userContext!.organizationId,
      id,
      event,
      'ONLINE_SCAN'
    );
    return outcome;
  });

  app.post('/api/v1/sessions/:id/sync', { preHandler: [(app as any).authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    const body = SyncBatchRequestSchema.parse(request.body);

    const outcomes = await processBatchSync(
      request.userContext!.organizationId,
      id,
      body.events
    );
    return {
      processed: outcomes.length,
      outcomes,
    };
  });

  // --- Finalization Route (Server Gate Enforcement) ---
  app.post('/api/v1/sessions/:id/finalize', { preHandler: [(app as any).authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = (request.body as { forceAcknowledgeMissingDevices?: boolean }) || {};

    try {
      const result = await finalizeSession(
        id,
        request.userContext!.organizationId,
        request.userContext!.id,
        body.forceAcknowledgeMissingDevices
      );
      return result;
    } catch (err: unknown) {
      if (err instanceof FinalizationGateError) {
        return reply.status(409).send({
          statusCode: 409,
          error: 'Conflict',
          message: err.message,
          code: err.code,
          details: err.details,
        });
      }
      throw err;
    }
  });

  return app;
}
