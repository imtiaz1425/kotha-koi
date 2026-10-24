import { env } from '../config/env'

/**
 * Parses and normalizes a comma-separated list of allowed domains.
 * Trims whitespace, lowercases, and strips leading/trailing dots.
 */
export function parseAllowedDomains(raw?: string): string[] {
  if (!raw || typeof raw !== 'string') {
    return []
  }
  return raw
    .split(',')
    .map((d) =>
      d
        .trim()
        .toLowerCase()
        .replace(/^\.+|\.+$/g, '')
    )
    .filter((d) => d.length > 0)
}

/**
 * Validates whether an email string adheres to strict ASCII syntax requirements
 * and normalizes it (trim + lowercase). Returns the normalized email or null if invalid.
 *
 * Rules per TRD §4:
 * 1. Trim and lowercase. Reject if empty, contains internal whitespace, or length > 254.
 * 2. Exactly one '@' symbol.
 * 3. Local part: non-empty, ASCII only, no leading/trailing dot, no consecutive dots.
 * 4. Domain part: non-empty, ASCII only, no trailing dot, at least two labels (has a dot).
 * 5. Reject any non-ASCII characters (homograph defense).
 */
export function normalizeEmail(email: string): string | null {
  if (typeof email !== 'string') {
    return null
  }

  const trimmed = email.trim()
  if (!trimmed || trimmed.length > 254) {
    return null
  }

  // Reject internal whitespace
  if (/\s/.test(trimmed)) {
    return null
  }

  // Reject non-ASCII characters completely (defense against IDN homograph attacks)
  // eslint-disable-next-line no-control-regex
  if (!/^[\x00-\x7F]+$/.test(trimmed)) {
    return null
  }

  const parts = trimmed.split('@')
  if (parts.length !== 2) {
    return null
  }

  const [localPart, domainPart] = parts

  if (!localPart || !domainPart) {
    return null
  }

  // Local part validation (conservative RFC 5322 subset)
  // Cannot start or end with dot, no consecutive dots, max 64 chars
  if (
    localPart.length > 64 ||
    localPart.startsWith('.') ||
    localPart.endsWith('.') ||
    localPart.includes('..') ||
    !/^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(localPart)
  ) {
    return null
  }

  // Domain part validation
  // Reject trailing dot explicitly per TRD §4 rule 3
  if (domainPart.endsWith('.')) {
    return null
  }

  const lowerDomain = domainPart.toLowerCase()

  // Domain labels must be non-empty, separated by dots, containing only a-z, 0-9, hyphen
  // Hyphens cannot be at the start or end of a label
  const labels = lowerDomain.split('.')
  if (labels.length < 2) {
    return null
  }

  const labelRegex = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/
  const allLabelsValid = labels.every(
    (label) => label.length > 0 && label.length <= 63 && labelRegex.test(label)
  )

  if (!allLabelsValid) {
    return null
  }

  return `${localPart.toLowerCase()}@${lowerDomain}`
}

/**
 * Checks if the given email belongs to an allowed educational domain.
 *
 * Algorithm per TRD §4:
 * 1. Normalize email (trim, lowercase, validate ASCII structure).
 * 2. Extract domain part.
 * 3. Match against allowed domain list:
 *    Accept iff domain === allowed OR domain.endsWith('.' + allowed).
 *    Never use unanchored regex or substring includes.
 *
 * @param email - The email string to validate.
 * @param allowedDomainsConfig - Optional override for allowed domains. Defaults to env.ALLOWED_EMAIL_DOMAINS.
 */
export function isAllowedEmail(
  email: string,
  allowedDomainsConfig?: string | string[]
): boolean {
  const normalized = normalizeEmail(email)
  if (!normalized) {
    return false
  }

  const domain = normalized.split('@')[1]
  if (!domain) {
    return false
  }

  const allowedList = Array.isArray(allowedDomainsConfig)
    ? allowedDomainsConfig
        .map((d) =>
          d
            .trim()
            .toLowerCase()
            .replace(/^\.+|\.+$/g, '')
        )
        .filter(Boolean)
    : parseAllowedDomains(allowedDomainsConfig ?? env.ALLOWED_EMAIL_DOMAINS)

  if (allowedList.length === 0) {
    return false
  }

  return allowedList.some((allowed) => {
    return domain === allowed || domain.endsWith('.' + allowed)
  })
}
