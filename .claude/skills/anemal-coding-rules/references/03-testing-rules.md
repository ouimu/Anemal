# Testing Rules

> **Audience:** QA engineers, test developers  
> **See also:** [Index](00-index.md) | [Security Rules](05-security-rules.md)

---

## Test Pyramid

| Type | Tool | Target | Purpose |
|------|------|--------|---------|
| Unit | Jest | Services: 90%+ | Test business logic in isolation |
| Integration | Jest + supertest | API routes: 80%+ | Test full request/response |
| Security | Jest custom | Tenant isolation: 100% | Verify data isolation |
| E2E | Playwright | Critical paths: 100% | Test real user workflows |

---

## Unit Tests

**Pattern: Arrange → Act → Assert**

```typescript
describe('AppointmentService.create', () => {
  it('throws ConflictError when doctor is double-booked', async () => {
    // Arrange
    mockRepo.hasConflict.mockResolvedValue(true);
    
    // Act & Assert
    await expect(
      appointmentService.create(TENANT_ID, dto)
    ).rejects.toThrow(ConflictError);
  });
});
```

**Rules:**
- Mock only external dependencies (DB, email, S3)
- Never mock the service under test
- Every service method: 1 happy path + minimum 2 edge cases
- Test empty input, boundary values, conflicts

---

## Integration Tests

- **Must hit a real test database** — no mocking the repository layer
- Use separate `test` database schema seeded in `beforeAll`
- Clean state between tests: wrap in transaction rolled back after each test

---

## Security / Tenant Isolation Tests (MANDATORY)

```typescript
it('returns 404 when tenant B tries to access tenant A pet', async () => {
  const res = await request(app)
    .get(`/api/v1/pets/${tenantAPetId}`)
    .set('Authorization', `Bearer ${tenantBToken}`);
  expect(res.status).toBe(404);
});
```

**Rules:**
- Verify cross-tenant rejection for **every** protected resource
- Return 404 (not 403) — never leak that record exists
- Run with `npm run test:security`
- **Mandatory before every PR merge**

---

## Test Checklist

Every PR must include tests for:

| Scenario | Type | Example |
|----------|------|---------|
| Happy path | Unit | Valid input → correct output |
| Validation fail | Unit | Invalid input → AppError thrown |
| Authorization fail | Integration | User without role → 403 Forbidden |
| Tenant isolation | Integration | User A cannot see User B data |
| Edge case | Unit | Empty, null, boundary values |
| Offline sync | Integration | Action queued offline → synced online |

---

**See also:** [Security Rules](05-security-rules.md) | [Backend Rules](01-backend-rules.md)
