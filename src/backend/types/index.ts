// Shared TypeScript types across the backend
// @dev-agent — no `any` types; all API shapes defined here

// JWT token payload
export interface JwtPayload {
  userId:   number
  tenantId: number
  role:     'admin' | 'doctor' | 'staff'
  iat?:     number
  exp?:     number
}

// Augment Express Request with authenticated context
declare global {
  namespace Express {
    interface Request {
      context?: JwtPayload
    }
  }
}

// ─── Auth ────────────────────────────────────────────────────────────────────
export interface LoginRequest {
  subdomain: string   // identifies the tenant
  email:     string
  password:  string
}

export interface LoginResponse {
  token:    string
  userId:   number
  tenantId: number
  role:     string
  name:     string
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
