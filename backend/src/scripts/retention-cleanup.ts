import { RetentionService } from '../services/retention.service'
import prisma from '../db'

async function main() {
  const isDryRun = process.argv.includes('--dry-run')
  console.log(`Running retention cleanup (dryRun=${isDryRun})...`)

  const result = await RetentionService.executeCleanup({ dryRun: isDryRun })
  console.log('Result:', JSON.stringify(result, null, 2))
}

main()
  .catch((err) => {
    console.error('Retention script failed:', err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

