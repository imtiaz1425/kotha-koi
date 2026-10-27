import app from './app'
import { env } from './config/env'
import http from 'http'
import { initSocketServer } from './realtime/socket'

const server = http.createServer(app)
const io = initSocketServer(server)

server.listen(env.PORT, () => {
  console.log(
    `[server] KothaKoi backend running on http://localhost:${env.PORT}`
  )
  console.log(`[server] Environment: ${env.NODE_ENV}`)
})

export { server, io }
export default server
