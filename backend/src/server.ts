import app from './app'
import { env } from './config/env'
import http from 'http'

const server = http.createServer(app)

server.listen(env.PORT, () => {
  console.log(
    `[server] KothaKoi backend running on http://localhost:${env.PORT}`
  )
  console.log(`[server] Environment: ${env.NODE_ENV}`)
})

export default server
