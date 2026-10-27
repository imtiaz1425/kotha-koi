import { Request, Response, NextFunction } from 'express'

/**
 * Parses raw Cookie header string into a key-value record.
 */
export function parseCookieHeader(
  cookieHeader?: string
): Record<string, string> {
  if (!cookieHeader) {
    return {}
  }

  const cookies: Record<string, string> = {}
  const pairs = cookieHeader.split(';')

  for (const pair of pairs) {
    const idx = pair.indexOf('=')
    if (idx === -1) continue

    const key = pair.slice(0, idx).trim()
    const rawVal = pair.slice(idx + 1).trim()

    if (!key || cookies[key]) continue

    try {
      cookies[key] = decodeURIComponent(rawVal)
    } catch {
      cookies[key] = rawVal
    }
  }

  return cookies
}

/**
 * Lightweight, zero-dependency cookie parsing middleware.
 * Parses raw Cookie request headers into a key-value record on req.cookies.
 */
export function cookieParser(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  req.cookies = parseCookieHeader(req.headers.cookie)
  next()
}
