import React, { useEffect, useState } from 'react'
import { getSocket } from '../api/socket'
import { apiClient } from '../api/client'
import { useAuth } from './auth-context'
import { OnlineContext } from './online-context'

export function OnlineProvider({ children }: { children: React.ReactNode }) {
  const [onlineCount, setOnlineCount] = useState<number>(0)
  const { isAuthenticated } = useAuth()

  useEffect(() => {
    // Fetch initial count from public stats endpoint
    apiClient
      .get<{ ok: boolean; count: number }>('/stats/online')
      .then((res) => {
        if (typeof res?.count === 'number') {
          setOnlineCount(res.count)
        }
      })
      .catch(() => {})

    // Real-time socket updates for authenticated sessions
    if (isAuthenticated) {
      const socket = getSocket()
      if (!socket.connected) {
        socket.connect()
      }

      const handleOnlineCount = (payload: { count: number }) => {
        if (typeof payload?.count === 'number') {
          setOnlineCount(payload.count)
        }
      }

      socket.on('online:count', handleOnlineCount)

      return () => {
        socket.off('online:count', handleOnlineCount)
      }
    }
  }, [isAuthenticated])

  return (
    <OnlineContext.Provider value={{ count: onlineCount }}>
      {children}
    </OnlineContext.Provider>
  )
}
