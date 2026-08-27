// Shared TypeScript types across the backend
// @dev-agent — no `any` types; all API shapes defined here

// JWT token payload — shared by clinic and platform planes.
//
// Clinic plane  (plane === 'clinic'):   userId + tenantId carry real values.
// Platform plane (plane === 'platform'): platformUserId is set; userId + tenantId are 0
//   (sentinel — never used when plane === 'platform'; requirePlane blocks before they are read).
export interface JwtPayload {
  userId:          number
  tenantId:        number
  branchId?:       number    // active branch (Phase 4)
  plane:           'clinic' | 'platform'
  permSetVersion:  number
  role:            string    // transitional — kept until T-5B-02
  platformUserId?: number    // T-5C-02: set only on platform-plane tokens
  scope?:          'branch_select'   // marks 5-min pending tokens only
  iat?:            number
  exp?:            number
}

// Augment Express Request with authenticated context
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- global module augmentation requires `namespace`, no ES2015 equivalent exists
  namespace Express {
    interface Request {
      context?: JwtPayload
    }
  }
}

// ─── Platform Auth (T-5C-02) ─────────────────────────────────────────────────
export interface PlatformLoginResponse {
  token:        string
  refreshToken: string
  user: {
    id:    number
    name:  string
    email: string
    role:  string
  }
}

// ─── Auth ────────────────────────────────────────────────────────────────────
export interface LoginRequest {
  subdomain: string   // identifies the tenant
  username:  string   // D-2-01: login changed from email to username
  password:  string
}

// Two-step login: step 1 always returns branch selection prompt.
// Step 2 (/auth/select-branch) returns the full token.
export type LoginResponse =
  | {
      requiresBranchSelection: true
      pendingToken: string                        // 5-min JWT, scope='branch_select'
      branches:     { id: number; name: string }[] // admin: all active; staff/doctor: assigned only
    }
  | {
      requiresBranchSelection: false              // returned only by POST /auth/select-branch
      token:        string
      refreshToken: string
      userId:       number
      tenantId:     number
      branchId:     number | null
      role:         string
      name:         string
      companyName:  string
    }

/** Alias for the full-token variant — return type of selectBranch(). */
export type SelectBranchResponse = Extract<LoginResponse, { requiresBranchSelection: false }>

/** Returned by POST /auth/refresh and POST /platform/auth/refresh. */
export interface RefreshResponse {
  token:        string
  refreshToken: string
  expiresIn:    number
}

// Current clinic-plane identity, returned by GET /auth/me.
// roleIds come from the user_roles join table — not the legacy users.role FK.
export interface MeResponse {
  userId:      number
  tenantId:    number
  branchId:    number | null
  name:        string
  username:    string
  email:       string | null
  roleIds:     number[]
  permissions: string[]
}

// Current platform-plane identity, returned by GET /platform/auth/me.
// permissions is a stub ([]) until the platform RBAC model lands.
export interface PlatformMeResponse {
  platformUserId: number
  name:           string
  email:          string
  role:           string
  permissions:    string[]
}

// ─── Users ───────────────────────────────────────────────────────────────────
export interface CreateUserRequest {
  name:     string
  username: string              // D-2-02: required unique login handle
  email?:   string              // D-2-02: now optional; at least one of email/phone required
  phone?:   string              // D-2-02: new optional contact field
  password: string
  roleId:   number              // ADR-0019/D-7: was role: 'doctor' | 'staff'
}

export interface UpdateUserRequest {
  name?:     string
  username?: string             // D-2-02: optional update
  email?:    string             // D-2-02: optional
  phone?:    string             // D-2-02: new optional contact field
  roleId?:   number             // ADR-0019/D-7: was role?: 'admin' | 'doctor' | 'staff'
  isActive?: boolean
}

export interface UserResponse {
  id:             number
  tenantId:       number
  name:           string
  username:       string             // D-2-02: included in response
  email:          string | null      // D-2-02: nullable
  phone:          string | null      // D-2-02: new field
  role:           { id: number; name: string; key: string; isSystem: boolean }
  isPrimaryAdmin: boolean
  isActive:       boolean
  createdAt:      string
}

// ─── API helpers ─────────────────────────────────────────────────────────────
export interface ApiSuccess<T> {
  success: true
  data:    T
}

export interface ApiError {
  success: false
  error:   string
  details?: unknown
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError
