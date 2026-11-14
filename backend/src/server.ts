import app from './app'
import { env } from './config/env'
import http from 'http'
import { initSocketServer } from './realtime/socket'
import { RetentionService } from './services/retention.service'

const server = http.createServer(app)
const io = initSocketServer(server)

if (env.NODE_ENV !== 'test') {
  RetentionService.startScheduler()
}

const shutdown = () => {
  RetentionService.stopScheduler()
  server.close()
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

server.listen(env.PORT, () => {
  console.log(
    `[server] KothaKoi backend running on http://localhost:${env.PORT}`
  )
  console.log(`[server] Environment: ${env.NODE_ENV}`)
})

export { server, io }
export default server
