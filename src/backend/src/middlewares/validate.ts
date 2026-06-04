// Request validation middleware (CODING_RULES §5).
// Runs a Zod schema before the controller; on success it replaces req.body with
// the parsed (and unknown-key-stripped) value, on failure it forwards a
// ValidationError to the global error handler.

import { Request, Response, NextFunction } from 'express'
import { ZodSchema } from 'zod'
import { ValidationError } from '../utils/errors'

export function validate(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body)
    if (!result.success) {
      next(new ValidationError(result.error.flatten()))
      return
    }
    req.body = result.data
    next()
  }
}
