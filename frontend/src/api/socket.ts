import { io, Socket } from 'socket.io-client'

let socketInstance: Socket | null = null

/**
 * Returns a singleton Socket.IO client instance configured for cookie-based authentication.
 */
export function getSocket(): Socket {
  if (!socketInstance) {
    socketInstance = io('/', {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      autoConnect: false,
      withCredentials: true,
    })
  }
  return socketInstance
}

/**
 * Disconnects and resets the active socket instance.
 */
export function disconnectSocket(): void {
  if (socketInstance) {
    socketInstance.disconnect()
    socketInstance = null
  }
}
