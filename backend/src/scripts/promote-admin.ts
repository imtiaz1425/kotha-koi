import readline from 'node:readline'
import prisma from '../db'
import { hashPassword } from '../utils/password'
import { normalizeEmail, isAllowedEmail } from '../utils/email'

/**
 * Prompts the user for a password in the terminal with hidden/muted input.
 * Falls back safely in non-interactive/piped environments.
 */
function promptPassword(promptText: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(promptText)

    if (process.stdin.setRawMode && process.stdin.isTTY) {
      process.stdin.setRawMode(true)
      process.stdin.resume()

      let password = ''

      const onData = (buffer: Buffer) => {
        const str = buffer.toString('utf-8')
        for (let i = 0; i < str.length; i++) {
          const char = str[i]
          const code = char.charCodeAt(0)

          // Ctrl+C
          if (code === 3) {
            process.stdin.setRawMode!(false)
            process.stdin.pause()
            process.stdin.removeListener('data', onData)
            process.stdout.write('\n')
            process.exit(130)
          }

          // Enter (\r or \n)
          if (char === '\r' || char === '\n') {
            process.stdin.setRawMode!(false)
            process.stdin.pause()
            process.stdin.removeListener('data', onData)
            process.stdout.write('\n')
            resolve(password)
            return
          }

          // Backspace
          if (code === 8 || code === 127) {
            if (password.length > 0) {
              password = password.slice(0, -1)
            }
          } else if (code >= 32) {
            password += char
          }
        }
      }

      process.stdin.on('data', onData)
    } else {
      // Non-interactive or non-TTY fallback
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      })
      rl.once('line', (line) => {
        rl.close()
        resolve(line.trim())
      })
    }
  })
}

/**
 * Prompts the user with standard text in the terminal.
 */
function promptText(promptText: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })
    rl.question(promptText, (answer) => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

/**
 * Server-side CLI script to provision or promote an administrator.
 * Prompts securely for password and confirmation with hidden input.
 * Usage:
 *   npx ts-node src/scripts/promote-admin.ts <email> [optional-password]
 */
async function main() {
  const args = process.argv.slice(2)
  const emailInput = args[0]
  let passwordInput = args[1]

  if (!emailInput) {
    console.error('Error: Please provide an email address.')
    console.error('Usage: npx ts-node src/scripts/promote-admin.ts <email> [optional-password]')
    process.exit(1)
  }

  const normalized = normalizeEmail(emailInput)
  if (!normalized || !isAllowedEmail(normalized)) {
    console.error(`Error: "${emailInput}" is not a valid UIU institutional email.`)
    process.exit(1)
  }

  let user = await prisma.user.findUnique({
    where: { email: normalized },
    include: { passwordAuth: true },
  })

  // 1. Create or promote user to ADMIN
  if (!user) {
    console.log(`User ${normalized} not found. Creating new administrator account...`)
    user = await prisma.user.create({
      data: {
        email: normalized,
        role: 'ADMIN',
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        termsAcceptedAt: new Date(),
      },
      include: { passwordAuth: true },
    })
    console.log(`Created administrator account for ${normalized} (Role: ADMIN).`)
  } else {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { role: 'ADMIN', status: 'ACTIVE' },
      include: { passwordAuth: true },
    })
    console.log(`Account ${normalized} verified as ADMIN.`)
  }

  // 2. Check password status
  const hasExistingPassword = Boolean(user.passwordAuth)

  if (hasExistingPassword && !passwordInput) {
    console.log(`Administrator ${normalized} already has a password configured.`)
    const answer = await promptText('Do you want to reset/update the password? (y/N): ')
    if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
      console.log('Password unchanged. Existing password preserved.')
      return
    }
  }

  // 3. Obtain password securely if not passed via CLI argument
  if (!passwordInput) {
    const entered = await promptPassword('Enter new administrator password (min 8 chars): ')
    if (!entered || entered.length < 8) {
      console.error('Error: Password must be at least 8 characters long.')
      process.exit(1)
    }
    if (entered.length > 128) {
      console.error('Error: Password must not exceed 128 characters.')
      process.exit(1)
    }

    const confirmed = await promptPassword('Confirm administrator password: ')
    if (entered !== confirmed) {
      console.error('Error: Passwords do not match.')
      process.exit(1)
    }

    passwordInput = entered
  } else {
    // If passed as CLI argument, validate length
    if (passwordInput.length < 8) {
      console.error('Error: Password must be at least 8 characters long.')
      process.exit(1)
    }
    if (passwordInput.length > 128) {
      console.error('Error: Password must not exceed 128 characters.')
      process.exit(1)
    }
  }

  // 4. Hash and save password in UserPassword model
  const passwordHash = hashPassword(passwordInput)
  await prisma.userPassword.upsert({
    where: { userId: user.id },
    create: { userId: user.id, passwordHash },
    update: { passwordHash },
  })

  console.log(`Password has been securely configured for administrator ${normalized}.`)
}

main()
  .catch((err) => {
    console.error('Failed to promote/provision admin:', err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
