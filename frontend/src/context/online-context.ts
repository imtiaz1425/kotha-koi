import { createContext, useContext } from 'react'

export interface OnlineContextValue {
  count: number
}

export const OnlineContext = createContext<OnlineContextValue>({ count: 0 })

export function useOnlineCount(): number {
  const context = useContext(OnlineContext)
  return context.count
}
