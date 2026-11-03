import { z } from 'zod';

export const UserRoleSchema = z.enum(['ADMIN', 'OPERATOR', 'REVIEWER', 'REPORT_VIEWER']);

export const SessionStateSchema = z.enum(['DRAFT', 'OPEN', 'REVIEW', 'FINALIZED', 'REOPENED', 'CANCELLED']);

export const EventOutcomeSchema = z.enum(['ACCEPTED', 'DUPLICATE', 'REJECTED', 'NEEDS_REVIEW']);

export const AttendanceSourceSchema = z.enum(['ONLINE_SCAN', 'OFFLINE_SYNC', 'MANUAL_AMENDMENT']);

export const LoginRequestSchema = z.object({
  orgSlug: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
});

export const RefreshTokenRequestSchema = z.object({
  refreshToken: z.string().min(1),
});

export const RegisterCardRequestSchema = z.object({
  cardUid: z.string().min(4).max(64).regex(/^[0-9A-Fa-f:]+$/),
  personId: z.string().uuid(),
});

export const CreateSessionRequestSchema = z.object({
  title: z.string().min(1).max(255),
  rosterVersionId: z.string().uuid(),
  scheduledStart: z.string().datetime(),
  scheduledEnd: z.string().datetime(),
});

export const ScanEventItemSchema = z.object({
  eventId: z.string().uuid(),
  authorizationId: z.string().uuid().optional(),
  cardUid: z.string().min(4).max(64),
  deviceFingerprint: z.string().optional(),
  deviceEventTime: z.string().datetime(),
  monotonicElapsedMs: z.number().int().optional(),
});

export const SyncBatchRequestSchema = z.object({
  events: z.array(ScanEventItemSchema).min(1).max(100),
});

export const ScanEventOutcomeSchema = z.object({
  eventId: z.string().uuid(),
  outcome: EventOutcomeSchema,
  reason: z.string().optional(),
  personId: z.string().uuid().optional(),
  personName: z.string().optional(),
  isLate: z.boolean().optional(),
  markedPresentAt: z.string().datetime().optional(),
});
