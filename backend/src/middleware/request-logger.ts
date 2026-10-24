import { Request, Response, NextFunction } from 'express'

export interface LogOutput {
  write(message: string): void
}

/**
 * Sanitize URL to ensure query strings, tokens, or parameters are completely removed.
 * Returns only the normalized pathname.
 */
export function sanitizePath(rawUrl: string, rawPath: string): string {
  try {
    const parsed = new URL(rawUrl, 'http://localhost')
    return parsed.pathname
  } catch {
    const clean = (rawPath || rawUrl || '/').split('?')[0]
    return clean.replace(/[^\w\-/.]/g, '') || '/'
  }
}

/**
 * Creates privacy-preserving request logging middleware.
 * Strictly logs only method, sanitized pathname, HTTP status, and duration in ms.
 * Never logs bodies, query parameters, authorization headers, cookies, emails, or message text.
 */
export function createRequestLogger(
  output: LogOutput = { write: (msg: string) => console.log(msg) }
) {
  return function requestLogger(
    req: Request,
    res: Response,
    next: NextFunction
  ): void {
    const start = process.hrtime.bigint()

    res.on('finish', () => {
      const end = process.hrtime.bigint()
      const durationMs = Number((end - start) / 1_000_000n)
      const path = sanitizePath(req.originalUrl || req.url, req.path)

      const logEntry = JSON.stringify({
        method: req.method,
        path,
        status: res.statusCode,
        durationMs,
      })

      output.write(logEntry)
    })

    next()
  }
}

export const requestLogger = createRequestLogger()
