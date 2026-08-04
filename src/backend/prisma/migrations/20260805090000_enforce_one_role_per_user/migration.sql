-- HI-06 (ADR-0019 D-7): enforce exactly ONE role per user per tenant at the
-- database level.
--
-- Before adding the unique constraint, deduplicate existing multi-role users
-- so the migration does not fail against live data:
--   Pass 1 — where a duplicate row's roleId matches the user's canonical
--            "users"."roleId" (the ADR-0019 primary-role FK — this is the
--            exact "survivor rule" already used by
--            prisma/scripts/collapse-multi-role.ts's auto-collapsible case),
--            keep that row and drop every other user_roles row for the user.
--   Guard  — if any user still holds more than one row after pass 1 (an
--            "ambiguous" case per collapse-multi-role.ts: 2+ system roles,
--            or 2+ custom roles with no system role match), ABORT the
--            migration rather than silently picking a winner. An operator
--            must run `npx ts-node prisma/scripts/collapse-multi-role.ts`
--            (or resolve manually) first — this migration does not decide
--            business identity for a human.
DO $$
DECLARE
  ambiguous_count INTEGER;
BEGIN
  -- Pass 1: auto-resolve the safe case only.
  DELETE FROM "user_roles" ur
  USING "users" u
  WHERE ur."userId" = u.id
    AND ur."roleId" <> u."roleId"
    AND EXISTS (
      SELECT 1 FROM "user_roles" ur2
      WHERE ur2."userId" = u.id AND ur2."roleId" = u."roleId"
    );

  -- Guard: fail closed on anything pass 1 could not resolve.
  SELECT COUNT(*) INTO ambiguous_count
  FROM (
    SELECT "userId" FROM "user_roles" GROUP BY "userId" HAVING COUNT(*) > 1
  ) dupes;

  IF ambiguous_count > 0 THEN
    RAISE EXCEPTION
      'Migration blocked: % user(s) still hold more than one user_roles row after auto-resolution. Run prisma/scripts/collapse-multi-role.ts (see its ambiguous-case report) or resolve manually before re-running this migration (see HI-06).',
      ambiguous_count;
  END IF;
END $$;

-- Replace the non-unique (tenantId, userId) index with a unique constraint —
-- this is the invariant itself, not just a performance index.
DROP INDEX IF EXISTS "user_roles_tenantId_userId_idx";
CREATE UNIQUE INDEX "user_roles_tenantId_userId_key" ON "user_roles"("tenantId", "userId");
