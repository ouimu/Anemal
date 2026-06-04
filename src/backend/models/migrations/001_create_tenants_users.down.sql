-- Migration: 001_create_tenants_users (DOWN)
-- Drops in reverse dependency order

DROP INDEX IF EXISTS idx_users_tenant;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS tenants;
