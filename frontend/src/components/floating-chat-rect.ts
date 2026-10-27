export interface WindowRect {
  x: number
  y: number
  width: number
  height: number
}

export const STORAGE_KEY = 'kothakoi_floating_chat_rect'
export const DEFAULT_CHAT_WIDTH = 360
export const DEFAULT_CHAT_HEIGHT = 400
export const MIN_CHAT_WIDTH = 280
export const MIN_CHAT_HEIGHT = 300

export function getDefaultRect(): WindowRect {
  const winW = typeof window !== 'undefined' ? window.innerWidth : 1024
  const winH = typeof window !== 'undefined' ? window.innerHeight : 768

  const width = Math.min(
    DEFAULT_CHAT_WIDTH,
    Math.max(MIN_CHAT_WIDTH, winW - 32)
  )
  const height = Math.min(
    DEFAULT_CHAT_HEIGHT,
    Math.max(MIN_CHAT_HEIGHT, winH - 120)
  )
  const x = Math.max(16, winW - width - 24)
  const y = Math.max(64, winH - height - 76)

  return { x, y, width, height }
}

export function loadSavedRect(): WindowRect {
  const fallback = getDefaultRect()
  if (typeof window === 'undefined') return fallback

  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<WindowRect>

    const winW = window.innerWidth
    const winH = window.innerHeight

    let savedWidth = Number(parsed.width)
    let savedHeight = Number(parsed.height)
    if (isNaN(savedWidth) || savedWidth < MIN_CHAT_WIDTH)
      savedWidth = fallback.width
    if (isNaN(savedHeight) || savedHeight < MIN_CHAT_HEIGHT)
      savedHeight = fallback.height

    // Normalize oversized saved dimensions from older versions once
    if (savedWidth > 420 || savedHeight > 460) {
      savedWidth = DEFAULT_CHAT_WIDTH
      savedHeight = DEFAULT_CHAT_HEIGHT
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            x: fallback.x,
            y: fallback.y,
            width: savedWidth,
            height: savedHeight,
          })
        )
      } catch {
        // Ignore quota error
      }
    }

    const width = Math.min(
      Math.max(MIN_CHAT_WIDTH, savedWidth),
      Math.max(MIN_CHAT_WIDTH, winW - 16)
    )
    const height = Math.min(
      Math.max(MIN_CHAT_HEIGHT, savedHeight),
      Math.max(MIN_CHAT_HEIGHT, winH - 16)
    )
    const maxX = Math.max(0, winW - width - 8)
    const maxY = Math.max(0, winH - height - 8)

    const rawX = Number(parsed.x)
    const rawY = Number(parsed.y)
    let x = isNaN(rawX) ? fallback.x : rawX
    let y = isNaN(rawY) ? fallback.y : rawY

    x = Math.min(Math.max(8, x), maxX)
    y = Math.min(Math.max(8, y), maxY)

    return { x, y, width, height }
  } catch {
    return fallback
  }
}
