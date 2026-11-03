-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Core Tenants
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(64) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Users with Argon2id Password Hash
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(32) NOT NULL CHECK (role IN ('ADMIN', 'OPERATOR', 'REVIEWER', 'REPORT_VIEWER')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(organization_id, email)
);

-- Refresh Tokens for Option A Auth (Stored as SHA-256 hashes for security)
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash CHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Registered Devices
CREATE TABLE IF NOT EXISTS devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    device_fingerprint VARCHAR(128) NOT NULL,
    label VARCHAR(128) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(organization_id, device_fingerprint)
);

-- People & Roster Versions (Preserving leading zero IDs as text)
CREATE TABLE IF NOT EXISTS roster_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    digest_sha256 CHAR(64) NOT NULL,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(organization_id, version_number)
);

CREATE TABLE IF NOT EXISTS people (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    external_id VARCHAR(64) NOT NULL, -- Leading zeros preserved (e.g., '00123')
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    group_name VARCHAR(128),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(organization_id, external_id)
);

CREATE TABLE IF NOT EXISTS roster_memberships (
    roster_version_id UUID NOT NULL REFERENCES roster_versions(id) ON DELETE CASCADE,
    person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
    PRIMARY KEY (roster_version_id, person_id)
);

-- Card Registration (UID is identifier, not proof)
CREATE TABLE IF NOT EXISTS cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    card_uid VARCHAR(64) NOT NULL, -- normalized uppercase hex UID
    person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(organization_id, card_uid)
);

-- Sessions State Machine: DRAFT -> OPEN -> REVIEW -> FINALIZED (or CANCELLED / REOPENED)
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    roster_version_id UUID NOT NULL REFERENCES roster_versions(id),
    state VARCHAR(32) NOT NULL CHECK (state IN ('DRAFT', 'OPEN', 'REVIEW', 'FINALIZED', 'REOPENED', 'CANCELLED')),
    scheduled_start TIMESTAMPTZ NOT NULL,
    scheduled_end TIMESTAMPTZ NOT NULL,
    finalized_at TIMESTAMPTZ,
    finalized_by UUID REFERENCES users(id),
    finalized_snapshot JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Offline Authorization Leases (ADR-002: default 8h, max 12h)
CREATE TABLE IF NOT EXISTS offline_authorizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    device_id UUID NOT NULL REFERENCES devices(id),
    issued_by UUID NOT NULL REFERENCES users(id),
    issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    signature VARCHAR(512) NOT NULL,
    CONSTRAINT max_lease_duration CHECK (expires_at <= issued_at + INTERVAL '12 hours')
);

-- Raw Submitted Events (Durable Audit & Idempotency)
CREATE TABLE IF NOT EXISTS attendance_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL UNIQUE, -- Stable client-generated idempotency key
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    authorization_id UUID REFERENCES offline_authorizations(id),
    device_id UUID REFERENCES devices(id),
    person_id UUID REFERENCES people(id),
    card_uid_logged VARCHAR(64), -- Normalized UID
    device_event_time TIMESTAMPTZ NOT NULL,
    server_received_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    monotonic_elapsed_ms BIGINT,
    outcome VARCHAR(32) NOT NULL CHECK (outcome IN ('ACCEPTED', 'DUPLICATE', 'REJECTED', 'NEEDS_REVIEW')),
    outcome_reason VARCHAR(255),
    processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Authoritative Attendance Records (Unique per (session_id, person_id))
CREATE TABLE IF NOT EXISTS attendance_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
    first_event_id UUID NOT NULL REFERENCES attendance_events(id),
    marked_present_at TIMESTAMPTZ NOT NULL,
    is_late BOOLEAN NOT NULL DEFAULT FALSE,
    source VARCHAR(32) NOT NULL CHECK (source IN ('ONLINE_SCAN', 'OFFLINE_SYNC', 'MANUAL_AMENDMENT')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(session_id, person_id) -- Invariant 3: Database-enforced attendance uniqueness
);

-- Amendments & Full Audit Trail
CREATE TABLE IF NOT EXISTS attendance_amendments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attendance_record_id UUID NOT NULL REFERENCES attendance_records(id) ON DELETE CASCADE,
    actor_id UUID NOT NULL REFERENCES users(id),
    reason TEXT NOT NULL,
    old_status VARCHAR(32) NOT NULL,
    new_status VARCHAR(32) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    actor_id UUID REFERENCES users(id),
    action VARCHAR(64) NOT NULL,
    resource_type VARCHAR(64) NOT NULL,
    resource_id UUID NOT NULL,
    details JSONB,
    server_time TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Schema Migrations Tracking
CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(255) PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Performance & Isolation Indexes
CREATE INDEX IF NOT EXISTS idx_users_org ON users(organization_id);
CREATE INDEX IF NOT EXISTS idx_people_org ON people(organization_id);
CREATE INDEX IF NOT EXISTS idx_cards_lookup ON cards(organization_id, card_uid);
CREATE INDEX IF NOT EXISTS idx_sessions_org_state ON sessions(organization_id, state);
CREATE INDEX IF NOT EXISTS idx_attendance_events_session ON attendance_events(session_id, outcome);
CREATE INDEX IF NOT EXISTS idx_attendance_records_session ON attendance_records(session_id);
CREATE INDEX IF NOT EXISTS idx_audit_org_time ON audit_events(organization_id, server_time DESC);
