import crypto from 'node:crypto'

/**
 * Derives a secure password hash using scrypt with a unique random 16-byte salt.
 * Stored format: "<salt_hex>:<hash_hex>"
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex')
  const derivedKey = crypto.scryptSync(password, salt, 64)
  return `${salt}:${derivedKey.toString('hex')}`
}

/**
 * Timing-safe password verification against the stored scrypt hash.
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  try {
    const [salt, expectedHash] = storedHash.split(':')
    if (!salt || !expectedHash) return false

    const derivedKey = crypto.scryptSync(password, salt, 64)
    const expectedBuf = Buffer.from(expectedHash, 'hex')

    if (derivedKey.length !== expectedBuf.length) {
      return false
    }

    return crypto.timingSafeEqual(derivedKey, expectedBuf)
  } catch {
    return false
  }
}
