import { describe, it, expect } from 'vitest'
import {
  isAllowedEmail,
  normalizeEmail,
  parseAllowedDomains,
} from '../utils/email'

describe('UT-EMAIL — UIU Email Domain Verification (TRD §4, OD-06)', () => {
  describe('TRD §4 Authoritative Verification Table', () => {
    const defaultAllowed = 'uiu.ac.bd'

    it('accepts student ID email under departmental subdomain: 2310125@bscse.uiu.ac.bd', () => {
      expect(isAllowedEmail('2310125@bscse.uiu.ac.bd', defaultAllowed)).toBe(
        true
      )
    })

    it('accepts uppercase email and normalizes it: A@UIU.AC.BD', () => {
      expect(isAllowedEmail('A@UIU.AC.BD', defaultAllowed)).toBe(true)
    })

    it('accepts email with leading/trailing whitespace and trims it:   a@uiu.ac.bd  ', () => {
      expect(isAllowedEmail('  a@uiu.ac.bd  ', defaultAllowed)).toBe(true)
    })

    it('rejects subdomain spoofing attack: a@uiu.ac.bd.evil.com', () => {
      expect(isAllowedEmail('a@uiu.ac.bd.evil.com', defaultAllowed)).toBe(false)
    })

    it('rejects prefix spoofing attack: a@evil-uiu.ac.bd', () => {
      expect(isAllowedEmail('a@evil-uiu.ac.bd', defaultAllowed)).toBe(false)
    })

    it('rejects completely different domain: a@notuiu.ac.bd', () => {
      expect(isAllowedEmail('a@notuiu.ac.bd', defaultAllowed)).toBe(false)
    })

    it('rejects domain with trailing dot: a@uiu.ac.bd.', () => {
      expect(isAllowedEmail('a@uiu.ac.bd.', defaultAllowed)).toBe(false)
    })

    it('rejects multiple @ symbols: a@b@uiu.ac.bd', () => {
      expect(isAllowedEmail('a@b@uiu.ac.bd', defaultAllowed)).toBe(false)
    })

    it('rejects internal whitespace and missing @: a uiu.ac.bd', () => {
      expect(isAllowedEmail('a uiu.ac.bd', defaultAllowed)).toBe(false)
    })
  })

  describe('IDN Homograph and Character Encoding Attacks', () => {
    it('rejects Cyrillic homograph characters in domain: user@u\\u0456u.ac.bd', () => {
      // Cyrillic small letter byelorussian-ukrainian i (U+0456)
      const homograph = 'user@u\u0456u.ac.bd'
      expect(isAllowedEmail(homograph, 'uiu.ac.bd')).toBe(false)
    })

    it('rejects Cyrillic homograph characters in local part', () => {
      // Cyrillic small letter a (U+0430)
      const homograph = '\u0430dmin@uiu.ac.bd'
      expect(isAllowedEmail(homograph, 'uiu.ac.bd')).toBe(false)
    })

    it('rejects non-printable ASCII or control characters', () => {
      expect(isAllowedEmail('user\x00@uiu.ac.bd', 'uiu.ac.bd')).toBe(false)
      expect(isAllowedEmail('user\n@uiu.ac.bd', 'uiu.ac.bd')).toBe(false)
      expect(isAllowedEmail('user\t@uiu.ac.bd', 'uiu.ac.bd')).toBe(false)
    })
  })

  describe('Local-Part and Malformed Syntax Validation', () => {
    it('rejects empty or whitespace-only inputs', () => {
      expect(isAllowedEmail('', 'uiu.ac.bd')).toBe(false)
      expect(isAllowedEmail('   ', 'uiu.ac.bd')).toBe(false)
    })

    it('rejects missing local part or domain part', () => {
      expect(isAllowedEmail('@uiu.ac.bd', 'uiu.ac.bd')).toBe(false)
      expect(isAllowedEmail('student@', 'uiu.ac.bd')).toBe(false)
      expect(isAllowedEmail('@', 'uiu.ac.bd')).toBe(false)
    })

    it('rejects consecutive dots in local part', () => {
      expect(isAllowedEmail('john..doe@uiu.ac.bd', 'uiu.ac.bd')).toBe(false)
    })

    it('rejects leading or trailing dot in local part', () => {
      expect(isAllowedEmail('.john@uiu.ac.bd', 'uiu.ac.bd')).toBe(false)
      expect(isAllowedEmail('john.@uiu.ac.bd', 'uiu.ac.bd')).toBe(false)
    })

    it('rejects quotes and special injection characters in local part', () => {
      expect(isAllowedEmail('"john"@uiu.ac.bd', 'uiu.ac.bd')).toBe(false)
      expect(isAllowedEmail('john<doe>@uiu.ac.bd', 'uiu.ac.bd')).toBe(false)
      expect(isAllowedEmail('john[doe]@uiu.ac.bd', 'uiu.ac.bd')).toBe(false)
    })

    it('rejects local parts exceeding 64 characters', () => {
      const longLocal = 'a'.repeat(65)
      expect(isAllowedEmail(`${longLocal}@uiu.ac.bd`, 'uiu.ac.bd')).toBe(false)
    })

    it('rejects total email exceeding 254 characters', () => {
      const longLocal = 'a'.repeat(64)
      const longDomain = `${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(63)}.uiu.ac.bd`
      expect(isAllowedEmail(`${longLocal}@${longDomain}`, 'uiu.ac.bd')).toBe(
        false
      )
    })
  })

  describe('Subdomain Matching Rules', () => {
    it('accepts exact domain match', () => {
      expect(isAllowedEmail('teacher@uiu.ac.bd', 'uiu.ac.bd')).toBe(true)
    })

    it('accepts subdomains when parent domain is in allowlist', () => {
      expect(isAllowedEmail('student@bscse.uiu.ac.bd', 'uiu.ac.bd')).toBe(true)
      expect(isAllowedEmail('student@bba.uiu.ac.bd', 'uiu.ac.bd')).toBe(true)
      expect(
        isAllowedEmail('student@deep.nested.dept.uiu.ac.bd', 'uiu.ac.bd')
      ).toBe(true)
    })

    it('rejects subdomains of non-allowed domains even if substring matches', () => {
      expect(isAllowedEmail('user@sub.otheruiu.ac.bd', 'uiu.ac.bd')).toBe(false)
      expect(isAllowedEmail('user@uiu.ac.bd.other.com', 'uiu.ac.bd')).toBe(
        false
      )
    })
  })

  describe('Allowlist Configuration Parsing and Defaults', () => {
    it('parses comma-separated domain strings with spaces and dots safely', () => {
      const parsed = parseAllowedDomains(
        ' uiu.ac.bd ,  bscse.uiu.ac.bd , .bba.uiu.ac.bd. , , '
      )
      expect(parsed).toEqual(['uiu.ac.bd', 'bscse.uiu.ac.bd', 'bba.uiu.ac.bd'])
    })

    it('handles empty allowlist configuration by rejecting all emails (fail-safe closed)', () => {
      expect(isAllowedEmail('student@uiu.ac.bd', '')).toBe(false)
      expect(isAllowedEmail('student@uiu.ac.bd', '   ')).toBe(false)
      expect(isAllowedEmail('student@uiu.ac.bd', [])).toBe(false)
    })

    it('accepts array of allowed domains', () => {
      const allowed = ['uiu.ac.bd', 'alumni.uiu.ac.bd']
      expect(isAllowedEmail('student@uiu.ac.bd', allowed)).toBe(true)
      expect(isAllowedEmail('alum@alumni.uiu.ac.bd', allowed)).toBe(true)
      expect(isAllowedEmail('other@gmail.com', allowed)).toBe(false)
    })

    it('uses env.ALLOWED_EMAIL_DOMAINS by default when no override is provided', () => {
      // env.ALLOWED_EMAIL_DOMAINS default is uiu.ac.bd,bscse.uiu.ac.bd
      expect(isAllowedEmail('test@uiu.ac.bd')).toBe(true)
      expect(isAllowedEmail('test@bscse.uiu.ac.bd')).toBe(true)
      expect(isAllowedEmail('test@gmail.com')).toBe(false)
    })
  })

  describe('normalizeEmail() Utility', () => {
    it('normalizes valid emails by trimming and lowercasing', () => {
      expect(normalizeEmail('  STUDENT.ONE@BSCSE.UIU.AC.BD  ')).toBe(
        'student.one@bscse.uiu.ac.bd'
      )
      expect(normalizeEmail('2310125@UIU.AC.BD')).toBe('2310125@uiu.ac.bd')
    })

    it('returns null for invalid email formats', () => {
      expect(normalizeEmail('')).toBeNull()
      expect(normalizeEmail('not-an-email')).toBeNull()
      expect(normalizeEmail('user@domain-without-tld')).toBeNull()
      expect(normalizeEmail('user@.leadingdot.com')).toBeNull()
      expect(normalizeEmail('user@trailingdot.com.')).toBeNull()
    })
  })
})
