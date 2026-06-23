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
  iat?:            number
  exp?:            number
}

// Augment Express Request with authenticated context
declare global {
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
  email:     string
  password:  string
}

export interface LoginResponse {
  token:        string
  refreshToken: string
  userId:       number
  tenantId:     number
  branchId:     number | null
  role:         string
  name:         string
}

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
  email:       string
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
  email:    string
  password: string
  role:     'doctor' | 'staff'   // admin cannot be created via API
}

export interface UpdateUserRequest {
  name?:     string
  role?:     'admin' | 'doctor' | 'staff'
  isActive?: boolean
}

export interface UserResponse {
  id:        number
  tenantId:  number
  name:      string
  email:     string
  role:      string
  isActive:  boolean
  createdAt: string
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
