import app from './app'
import http from 'http'

const PORT = Number(process.env.PORT) || 5000

const server = http.createServer(app)

server.listen(PORT, () => {
  console.log(`[server] KothaKoi backend running on http://localhost:${PORT}`)
  console.log(`[server] Environment: ${process.env.NODE_ENV ?? 'development'}`)
})

export default server
