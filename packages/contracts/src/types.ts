export type UserRole = 'ADMIN' | 'OPERATOR' | 'REVIEWER' | 'REPORT_VIEWER';

export type SessionState = 'DRAFT' | 'OPEN' | 'REVIEW' | 'FINALIZED' | 'REOPENED' | 'CANCELLED';

export type EventOutcome = 'ACCEPTED' | 'DUPLICATE' | 'REJECTED' | 'NEEDS_REVIEW';

export type AttendanceSource = 'ONLINE_SCAN' | 'OFFLINE_SYNC' | 'MANUAL_AMENDMENT';

export interface UserContext {
  id: string;
  organizationId: string;
  email: string;
  role: UserRole;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: UserContext;
}

export interface OfflinePackageHeader {
  version: number;
  algorithm: string;
  issuedAt: number;
  expiresAt: number;
}

export interface PersonMapping {
  personId: string;
  externalId: string;
  fullName: string;
  cardUid: string;
}

export interface OfflinePackageRules {
  lateAfter: string;
  maxLeaseSeconds: number;
}

export interface OfflinePackagePayload {
  authorizationId: string;
  organizationId: string;
  sessionId: string;
  deviceFingerprint: string;
  rosterVersion: number;
  rosterDigest: string;
  peopleMappings: PersonMapping[];
  rules: OfflinePackageRules;
}

export interface OfflineAuthorizationPackage {
  header: OfflinePackageHeader;
  payload: OfflinePackagePayload;
  signature: string;
}

export interface ScanEventItem {
  eventId: string;
  authorizationId?: string;
  cardUid: string;
  deviceFingerprint?: string;
  deviceEventTime: string;
  monotonicElapsedMs?: number;
}

export interface ScanEventOutcome {
  eventId: string;
  outcome: EventOutcome;
  reason?: string;
  personId?: string;
  personName?: string;
  isLate?: boolean;
  markedPresentAt?: string;
}

export interface SyncBatchRequest {
  events: ScanEventItem[];
}

export interface SyncBatchResponse {
  processed: number;
  outcomes: ScanEventOutcome[];
}

export interface FinalizeSessionResponse {
  sessionId: string;
  state: SessionState;
  finalizedAt: string;
  finalizedBy: string;
  totalAccepted: number;
  snapshot: Record<string, unknown>;
}
