import prisma from '../db'

export interface CleanupResult {
  dryRun: boolean
  expiredLoginCodesCount: number
  expiredSessionsCount: number
  archivedReportsCount: number
  timestamp: string
}

export class RetentionService {
  private static isRunning = false
  private static timer: NodeJS.Timeout | null = null

  /**
   * Executes database retention cleanup tasks.
   * If dryRun is true, queries counts without deleting records.
   */
  static async executeCleanup(options: {
    dryRun?: boolean
    resolvedReportRetentionDays?: number
    log?: (msg: string) => void
  } = {}): Promise<CleanupResult> {
    const dryRun = Boolean(options.dryRun)
    const retentionDays = options.resolvedReportRetentionDays || 90
    const log = options.log || ((msg: string) => console.log(`[RetentionService] ${msg}`))

    if (this.isRunning) {
      log('Cleanup job is already running; skipping concurrent trigger.')
      return {
        dryRun,
        expiredLoginCodesCount: 0,
        expiredSessionsCount: 0,
        archivedReportsCount: 0,
        timestamp: new Date().toISOString(),
      }
    }

    this.isRunning = true
    const now = new Date()
    const reportThreshold = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000)

    try {
      if (dryRun) {
        const [expiredCodes, expiredSessions, resolvedReports] = await Promise.all([
          prisma.loginCode.count({ where: { expiresAt: { lt: now } } }),
          prisma.session.count({ where: { expiresAt: { lt: now } } }),
          prisma.report.count({
            where: {
              status: { in: ['DISMISSED', 'ACTIONED'] },
              resolvedAt: { lt: reportThreshold },
            },
          }),
        ])

        const summary: CleanupResult = {
          dryRun: true,
          expiredLoginCodesCount: expiredCodes,
          expiredSessionsCount: expiredSessions,
          archivedReportsCount: resolvedReports,
          timestamp: now.toISOString(),
        }

        log(
          `Dry-run summary: ${expiredCodes} expired codes, ${expiredSessions} expired sessions, ${resolvedReports} old resolved reports.`
        )
        return summary
      }

      // Safe execution
      const [deletedCodes, deletedSessions, deletedReports] = await prisma.$transaction([
        prisma.loginCode.deleteMany({
          where: { expiresAt: { lt: now } },
        }),
        prisma.session.deleteMany({
          where: { expiresAt: { lt: now } },
        }),
        prisma.report.deleteMany({
          where: {
            status: { in: ['DISMISSED', 'ACTIONED'] },
            resolvedAt: { lt: reportThreshold },
          },
        }),
      ])

      const summary: CleanupResult = {
        dryRun: false,
        expiredLoginCodesCount: deletedCodes.count,
        expiredSessionsCount: deletedSessions.count,
        archivedReportsCount: deletedReports.count,
        timestamp: now.toISOString(),
      }

      log(
        `Purged: ${deletedCodes.count} expired codes, ${deletedSessions.count} expired sessions, ${deletedReports.count} resolved reports (> ${retentionDays}d).`
      )
      return summary
    } catch (err) {
      log(`Retention cleanup error: ${err instanceof Error ? err.message : String(err)}`)
      throw err
    } finally {
      this.isRunning = false
    }
  }

  /**
   * Starts the recurring background cleanup schedule.
   */
  static startScheduler(intervalMs = 60 * 60 * 1000): void {
    if (this.timer) return

    // Run first cleanup after 30 seconds
    const initialDelay = setTimeout(() => {
      this.executeCleanup().catch(() => {})
    }, 30000)

    this.timer = setInterval(() => {
      this.executeCleanup().catch(() => {})
    }, intervalMs)

    // Unref so timer doesn't keep node process alive during tests
    if (initialDelay.unref) initialDelay.unref()
    if (this.timer.unref) this.timer.unref()
  }

  /**
   * Stops the recurring background cleanup schedule.
   */
  static stopScheduler(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }
}

