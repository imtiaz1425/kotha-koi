import process from 'node:process'
import { PrismaClient, UserRole, UserStatus } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding database...')

  // 1. Admin user
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@uiu.ac.bd' },
    update: {},
    create: {
      email: 'admin@uiu.ac.bd',
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
      termsAcceptedAt: new Date(),
      profile: {
        create: {
          currentNickname: 'KothaAdmin',
          avatarPreset: 'admin',
          preferences: {},
        },
      },
    },
  })
  console.log(`✓ Admin user: ${adminUser.email}`)

  // 2. Student users
  const student1 = await prisma.user.upsert({
    where: { email: 'student1@bscse.uiu.ac.bd' },
    update: {},
    create: {
      email: 'student1@bscse.uiu.ac.bd',
      role: UserRole.STUDENT,
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
      termsAcceptedAt: new Date(),
      profile: {
        create: {
          currentNickname: 'Midnight Mango',
          avatarPreset: 'mango',
          preferences: { autoShuffleNickname: false },
        },
      },
    },
  })
  console.log(`✓ Student user 1: ${student1.email}`)

  const student2 = await prisma.user.upsert({
    where: { email: 'student2@bscse.uiu.ac.bd' },
    update: {},
    create: {
      email: 'student2@bscse.uiu.ac.bd',
      role: UserRole.STUDENT,
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
      termsAcceptedAt: new Date(),
      profile: {
        create: {
          currentNickname: 'Pixel Panda',
          avatarPreset: 'panda',
          preferences: { autoShuffleNickname: false },
        },
      },
    },
  })
  console.log(`✓ Student user 2: ${student2.email}`)

  const student3 = await prisma.user.upsert({
    where: { email: 'student3@bba.uiu.ac.bd' },
    update: {},
    create: {
      email: 'student3@bba.uiu.ac.bd',
      role: UserRole.STUDENT,
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
      termsAcceptedAt: new Date(),
      profile: {
        create: {
          currentNickname: 'Cha Cup',
          avatarPreset: 'cup',
          preferences: { autoShuffleNickname: false },
        },
      },
    },
  })
  console.log(`✓ Student user 3: ${student3.email}`)

  console.log('✅ Seeding completed.')
}

main()
  .catch((e) => {
    console.error('❌ Seeding error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
