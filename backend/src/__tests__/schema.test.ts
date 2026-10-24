import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient, Prisma } from '@prisma/client'

const prisma = new PrismaClient()

describe('UT-PRIVACY — Identity Data Minimisation (OD-05)', () => {
  beforeAll(async () => {
    await prisma.$connect()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it('ensures users table in database does NOT contain real_name or student_id columns', async () => {
    const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'users' AND table_schema = 'public';
    `
    const columnNames = columns.map((col) => col.column_name.toLowerCase())

    expect(columnNames).not.toContain('real_name')
    expect(columnNames).not.toContain('student_id')
    expect(columnNames).not.toContain('password_hash')
    expect(columnNames).not.toContain('password')

    // Confirm allowed columns are present
    expect(columnNames).toContain('id')
    expect(columnNames).toContain('email')
    expect(columnNames).toContain('role')
    expect(columnNames).toContain('status')
  })

  it('ensures Prisma User model definition does not expose real_name or student_id', () => {
    const userModel = Prisma.dmmf.datamodel.models.find(
      (m) => m.name === 'User'
    )
    expect(userModel).toBeDefined()

    const fieldNames = userModel?.fields.map((f) => f.name) ?? []
    expect(fieldNames).not.toContain('real_name')
    expect(fieldNames).not.toContain('student_id')
    expect(fieldNames).not.toContain('password')
    expect(fieldNames).not.toContain('passwordHash')
  })
})

describe('UT-SCHEMA — Integrity and CHECK Constraints', () => {
  const testEmail1 = 'schema-test-1@bscse.uiu.ac.bd'
  const testEmail2 = 'schema-test-2@bscse.uiu.ac.bd'
  let user1Id: string
  let user2Id: string

  beforeAll(async () => {
    await prisma.$connect()

    // Clean up any leftover test data
    await prisma.user.deleteMany({
      where: { email: { in: [testEmail1, testEmail2, 'duplicate@uiu.ac.bd'] } },
    })

    const u1 = await prisma.user.create({
      data: {
        email: testEmail1,
        profile: {
          create: {
            currentNickname: 'TestUserOne',
          },
        },
      },
    })
    user1Id = u1.id

    const u2 = await prisma.user.create({
      data: {
        email: testEmail2,
        profile: {
          create: {
            currentNickname: 'TestUserTwo',
          },
        },
      },
    })
    user2Id = u2.id
  })

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { in: [testEmail1, testEmail2, 'duplicate@uiu.ac.bd'] } },
    })
    await prisma.$disconnect()
  })

  it('rejects duplicate email with unique constraint violation', async () => {
    await prisma.user.create({
      data: { email: 'duplicate@uiu.ac.bd' },
    })

    await expect(
      prisma.user.create({
        data: { email: 'duplicate@uiu.ac.bd' },
      })
    ).rejects.toThrowError()
  })

  it('enforces chk_nickname_length on profile (< 2 chars rejected)', async () => {
    await expect(
      prisma.profile.create({
        data: {
          userId: user1Id,
          currentNickname: 'A', // 1 char, must be >= 2
        },
      })
    ).rejects.toThrowError(/chk_nickname_length/)
  })

  it('enforces chk_nickname_length on profile (> 20 chars rejected)', async () => {
    await expect(
      prisma.user.create({
        data: {
          email: 'too-long-nick@bscse.uiu.ac.bd',
          profile: {
            create: {
              currentNickname: 'ThisNicknameIsWayTooLongForKothaKoi', // > 20 chars
            },
          },
        },
      })
    ).rejects.toThrowError(/chk_nickname_length/)
  })

  it('enforces chk_blocks_no_self CHECK constraint', async () => {
    await expect(
      prisma.block.create({
        data: {
          blockerId: user1Id,
          blockedId: user1Id, // self block
        },
      })
    ).rejects.toThrowError(/chk_blocks_no_self/)
  })

  it('enforces chk_chat_sessions_no_self CHECK constraint', async () => {
    await expect(
      prisma.chatSession.create({
        data: {
          mode: 'TEXT',
          userAId: user1Id,
          userBId: user1Id, // self chat
        },
      })
    ).rejects.toThrowError(/chk_chat_sessions_no_self/)
  })

  it('cascades deletion of user to profile and blocks', async () => {
    const tempUser = await prisma.user.create({
      data: {
        email: 'cascade-test@bscse.uiu.ac.bd',
        profile: {
          create: {
            currentNickname: 'CascadeUser',
          },
        },
      },
    })

    await prisma.block.create({
      data: {
        blockerId: tempUser.id,
        blockedId: user2Id,
      },
    })

    // Delete user
    await prisma.user.delete({ where: { id: tempUser.id } })

    // Profile and block should be gone
    const profile = await prisma.profile.findUnique({
      where: { userId: tempUser.id },
    })
    expect(profile).toBeNull()

    const block = await prisma.block.findUnique({
      where: {
        blockerId_blockedId: {
          blockerId: tempUser.id,
          blockedId: user2Id,
        },
      },
    })
    expect(block).toBeNull()
  })

  it('nullifies user_a_id / user_b_id on chat_sessions when user is deleted (retention OD-12)', async () => {
    const tempUser = await prisma.user.create({
      data: {
        email: 'retention-test@bscse.uiu.ac.bd',
        profile: {
          create: {
            currentNickname: 'RetentionUser',
          },
        },
      },
    })

    const chat = await prisma.chatSession.create({
      data: {
        mode: 'TEXT',
        userAId: tempUser.id,
        userBId: user1Id,
      },
    })

    // Delete tempUser
    await prisma.user.delete({ where: { id: tempUser.id } })

    // ChatSession should still exist with userAId = null
    const updatedChat = await prisma.chatSession.findUnique({
      where: { id: chat.id },
    })
    expect(updatedChat).not.toBeNull()
    expect(updatedChat?.userAId).toBeNull()
    expect(updatedChat?.userBId).toBe(user1Id)

    // Clean up chat session
    await prisma.chatSession.delete({ where: { id: chat.id } })
  })

  it('nullifies chat_session_id on reports when chat session is pruned/deleted (retention OD-12)', async () => {
    const chat = await prisma.chatSession.create({
      data: {
        mode: 'TEXT',
        userAId: user1Id,
        userBId: user2Id,
      },
    })

    const report = await prisma.report.create({
      data: {
        reporterId: user1Id,
        reportedId: user2Id,
        chatSessionId: chat.id,
        reason: 'SPAM_OR_BOT',
        details: 'Test report details',
      },
    })

    // Delete the chat session (simulating pruning)
    await prisma.chatSession.delete({ where: { id: chat.id } })

    // Report should still exist with chatSessionId = null
    const updatedReport = await prisma.report.findUnique({
      where: { id: report.id },
    })
    expect(updatedReport).not.toBeNull()
    expect(updatedReport?.chatSessionId).toBeNull()
    expect(updatedReport?.reporterId).toBe(user1Id)

    // Clean up report
    await prisma.report.delete({ where: { id: report.id } })
  })
})
