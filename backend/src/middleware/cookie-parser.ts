import { Request, Response, NextFunction } from 'express'

/**
 * Lightweight, zero-dependency cookie parsing middleware.
 * Parses raw Cookie request headers into a key-value record on req.cookies.
 */
export function cookieParser(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const cookieHeader = req.headers.cookie
  if (!cookieHeader) {
    req.cookies = {}
    return next()
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

  req.cookies = cookies
  next()
}
