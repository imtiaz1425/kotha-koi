import crypto from 'node:crypto'
import { PrismaClient } from '../backend/node_modules/@prisma/client'

export const DUMMY_USERS = {
  A: {
    email: 'dummy_a@bscse.uiu.ac.bd',
    password: 'DummyUser123!',
    nickname: 'Dummy A',
    avatar: 'mango',
  },
  B: {
    email: 'dummy_b@bscse.uiu.ac.bd',
    password: 'DummyUser123!',
    nickname: 'Dummy B',
    avatar: 'panda',
  },
  C: {
    email: 'dummy_c@bscse.uiu.ac.bd',
    password: 'DummyUser123!',
    nickname: 'Dummy C',
    avatar: 'cup',
  },
  D: {
    email: 'dummy_d@bscse.uiu.ac.bd',
    password: 'DummyUser123!',
    nickname: 'Dummy D',
    avatar: 'mango',
  },
} as const

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex')
  const derivedKey = crypto.scryptSync(password, salt, 64)
  return `${salt}:${derivedKey.toString('hex')}`
}

export async function ensureDummyUsers() {
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url:
          process.env.DATABASE_URL ||
          'postgresql://kothakoi:kothakoi_dev_password@localhost:5432/kothakoi?schema=public',
      },
    },
  })

  try {
    for (const [key, userDef] of Object.entries(DUMMY_USERS)) {
      const existing = await prisma.user.findUnique({
        where: { email: userDef.email },
        include: { profile: true, passwordAuth: true },
      })

      const passwordHash = hashPassword(userDef.password)

      if (!existing) {
        await prisma.user.create({
          data: {
            email: userDef.email,
            name: userDef.nickname,
            role: 'STUDENT',
            status: 'ACTIVE',
            emailVerifiedAt: new Date(),
            termsAcceptedAt: new Date(),
            passwordAuth: {
              create: {
                passwordHash,
              },
            },
            profile: {
              create: {
                currentNickname: userDef.nickname,
                avatarPreset: userDef.avatar,
                preferences: { autoShuffleNickname: false },
              },
            },
          },
        })
        console.log(`[setup-test-users] Created dummy user ${key} (${userDef.email})`)
      } else {
        // Ensure active status, verified email, password and profile exist
        await prisma.user.update({
          where: { id: existing.id },
          data: {
            status: 'ACTIVE',
            emailVerifiedAt: existing.emailVerifiedAt || new Date(),
            termsAcceptedAt: existing.termsAcceptedAt || new Date(),
          },
        })

        if (!existing.passwordAuth) {
          await prisma.userPassword.create({
            data: {
              userId: existing.id,
              passwordHash,
            },
          })
        }

        if (!existing.profile) {
          await prisma.profile.create({
            data: {
              userId: existing.id,
              currentNickname: userDef.nickname,
              avatarPreset: userDef.avatar,
              preferences: { autoShuffleNickname: false },
            },
          })
        }
        console.log(`[setup-test-users] Verified dummy user ${key} (${userDef.email})`)
      }
    }
  } finally {
    await prisma.$disconnect()
  }
}
