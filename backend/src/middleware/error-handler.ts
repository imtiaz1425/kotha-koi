import { Request, Response, NextFunction } from 'express'
import { ZodError } from 'zod'
import { AppError } from '../errors/app-error'

/**
 * 404 Handler for unmatched routes.
 * Returns standard API error format with code NOT_FOUND.
 */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
    },
  })
}

interface BodyParserError extends Error {
  type?: string
  status?: number
  statusCode?: number
}

/**
 * Centralized error handler middleware.
 * Ensures all error responses strictly follow the standard shape:
 * { error: { code, message, details? } }
 *
 * Never exposes stack traces, SQL errors, internal file paths, or secrets to clients.
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // 1. Known application errors
  if (err instanceof AppError) {
    const payload: {
      error: {
        code: string
        message: string
        details?: Record<string, unknown>
      }
    } = {
      error: {
        code: err.code,
        message: err.message,
      },
    }
    if (err.details && Object.keys(err.details).length > 0) {
      payload.error.details = err.details
    }
    res.status(err.statusCode).json(payload)
    return
  }

  // 2. Zod validation errors
  if (
    err instanceof ZodError ||
    (err as { name?: string })?.name === 'ZodError'
  ) {
    const zodErr = err as ZodError
    const details: Record<string, string> = {}
    if (Array.isArray(zodErr.issues)) {
      for (const issue of zodErr.issues) {
        const pathKey = issue.path.join('.') || 'body'
        details[pathKey] = issue.message
      }
    }
    res.status(400).json({
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Validation failed',
        details,
      },
    })
    return
  }

  const bpErr = err as BodyParserError

  // 3. Request body too large (exceeds 16 KB)
  if (
    bpErr?.type === 'entity.too.large' ||
    bpErr?.status === 413 ||
    bpErr?.statusCode === 413
  ) {
    res.status(413).json({
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Request payload exceeds size limit of 16 KB',
      },
    })
    return
  }

  // 4. Malformed JSON syntax error
  if (
    err instanceof SyntaxError &&
    (bpErr?.status === 400 ||
      bpErr?.statusCode === 400 ||
      bpErr?.type === 'entity.parse.failed')
  ) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Malformed JSON payload',
      },
    })
    return
  }

  // 5. Unexpected / 500 internal server errors
  // Log internal diagnostic error to server console, never expose details to the response
  if (process.env.NODE_ENV !== 'test') {
    console.error('Unhandled internal server error:', err)
  }

  res.status(500).json({
    error: {
      code: 'INTERNAL',
      message: 'Internal server error',
    },
  })
}
