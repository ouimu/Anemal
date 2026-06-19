# Verify Data Isolation

**Skill Description:** The core security testing skill for simulating adversarial inputs to validate multi-tenant isolation.

## Instructions
1. Verify that Tenant A cannot read, update, or delete Tenant B's records under any circumstance.
2. Simulate requests with a JWT missing the `tenant_id` claim, or an expired one, and verify they are rejected by the middleware.
3. Simulate direct DB ID guessing attacks across tenants and ensure they return 403 or 404 HTTP statuses.
4. Flag any instances where data isolation is breached or relies on client-side filtering instead of backend DB constraints.
