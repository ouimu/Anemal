# Idle-logout enforced client-side only, not via server-side token revocation

Idle-logout (auto-logout after N minutes of inactivity, per-tenant configurable for clinic plane, fixed for platform plane) is enforced entirely in the frontend: an activity-tracking timer clears the local auth store and redirects to login. The JWT itself is untouched and remains valid until its normal 8h TTL.

Considered alternative: also revoking the refresh token server-side on idle-logout (via a blacklist or revocation table), so a stolen token can't be replayed during the idle window even if the client is bypassed. Rejected for this feature — it would require a new revocation-check on every request or a token blacklist table, disproportionate to the actual risk being addressed (an unattended screen, not a stolen credential). If server-side revocation is needed later, it can be added as a separate hardening pass without changing the client-side timer logic.
