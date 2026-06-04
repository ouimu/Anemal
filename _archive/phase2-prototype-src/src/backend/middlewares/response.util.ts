// ==============================================
// utils/response.ts
// Standardized API response format
// ==============================================

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export const successResponse = (
  data: unknown,
  message = 'Success',
  meta?: PaginationMeta
) => ({
  success: true,
  message,
  data,
  ...(meta && { meta }),
});

export const errorResponse = (message: string, code?: string, details?: unknown) => ({
  success: false,
  message,
  ...(code && { code }),
  ...(details && { details }),
});

export const paginationMeta = (
  page: number,
  limit: number,
  total: number
): PaginationMeta => ({
  page,
  limit,
  total,
  totalPages: Math.ceil(total / limit),
});
