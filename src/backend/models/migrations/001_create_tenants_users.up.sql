-- Migration: 001_create_tenants_users (UP)
-- Creates the two root tables for multi-tenancy. All other tables foreign-key to tenants(id).

CREATE TABLE IF NOT EXISTS tenants (
    id         SERIAL PRIMARY KEY,
    name       VARCHAR(255) NOT NULL,
    subdomain  VARCHAR(100) UNIQUE NOT NULL,
    is_active  BOOLEAN      DEFAULT TRUE,
    created_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    tenant_id     INT          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name          VARCHAR(255) NOT NULL,
    email         VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role          VARCHAR(50)  NOT NULL CHECK (role IN ('admin', 'doctor', 'staff')),
    is_active     BOOLEAN      DEFAULT TRUE,
    created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_tenant_user_email UNIQUE (tenant_id, email)
);

-- Composite index: all user lookups are always scoped to tenant_id first
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
