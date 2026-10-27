/**
 * FloatingChatWindow.tsx – Floating, Draggable, Resizable Chat Window
 * KothaKoi overlay desktop widget with 8-direction resize handles,
 * draggable header, long-text wrapping, and local persistence.
 */
import React, { useState, useEffect, useRef, FormEvent } from 'react'
import {
  WindowRect,
  MIN_CHAT_WIDTH,
  MIN_CHAT_HEIGHT,
  STORAGE_KEY,
  loadSavedRect,
} from './floating-chat-rect'

export type { WindowRect }

export interface ChatMessage {
  id: number
  sender: 'stranger' | 'user' | 'notice'
  name: string
  time: string
  text: string
}

interface FloatingChatWindowProps {
  isOpen: boolean
  onClose: () => void
  onMinimize: () => void
  messages: ChatMessage[]
  input: string
  onInputChange: (val: string) => void
  onSend: (e: FormEvent) => void
  isTyping: boolean
  partnerName: string
  sessionId: string | null
  partnerStatus: 'connected' | 'reconnecting'
  onQuickEmoji: (emoji: string) => void
  chatStreamRef: React.RefObject<HTMLDivElement>
  inputRef: React.RefObject<HTMLInputElement>
}

export function FloatingChatWindow({
  isOpen,
  onClose,
  onMinimize,
  messages,
  input,
  onInputChange,
  onSend,
  isTyping,
  partnerName,
  sessionId,
  partnerStatus,
  onQuickEmoji,
  chatStreamRef,
  inputRef,
}: FloatingChatWindowProps) {
  const [rect, setRect] = useState<WindowRect>(loadSavedRect)
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)

  const dragRef = useRef<{
    startX: number
    startY: number
    origX: number
    origY: number
  } | null>(null)

  const resizeRef = useRef<{
    direction: string
    startX: number
    startY: number
    origX: number
    origY: number
    origW: number
    origH: number
  } | null>(null)

  const rectRef = useRef(rect)
  useEffect(() => {
    rectRef.current = rect
  }, [rect])

  // Save rect to localStorage whenever it changes
  const persistRect = (newRect: WindowRect) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newRect))
    } catch {
      // Ignore quota errors
    }
  }

  // Handle window viewport resizing
  useEffect(() => {
    const handleViewportResize = () => {
      setRect((prev) => {
        const winW = window.innerWidth
        const winH = window.innerHeight
        const width = Math.min(Math.max(280, prev.width), winW - 16)
        const height = Math.min(Math.max(320, prev.height), winH - 16)
        const maxX = Math.max(0, winW - width - 8)
        const maxY = Math.max(0, winH - height - 8)
        const x = Math.min(Math.max(8, prev.x), maxX)
        const y = Math.min(Math.max(8, prev.y), maxY)
        const updated = { x, y, width, height }
        persistRect(updated)
        return updated
      })
    }

    window.addEventListener('resize', handleViewportResize)
    return () => window.removeEventListener('resize', handleViewportResize)
  }, [])

  // ── Drag Handlers ──────────────────────────────────────────────────────────
  const handleDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    const target = e.target as HTMLElement
    // Do not initiate drag if clicking buttons, inputs, links, or controls
    if (target.closest('button, input, a, [data-no-drag]')) {
      return
    }

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY

    dragRef.current = {
      startX: clientX,
      startY: clientY,
      origX: rectRef.current.x,
      origY: rectRef.current.y,
    }
    setIsDragging(true)
  }

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent | TouchEvent) => {
      if (!dragRef.current) return
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY

      const dx = clientX - dragRef.current.startX
      const dy = clientY - dragRef.current.startY

      const maxX = Math.max(0, window.innerWidth - rectRef.current.width)
      const maxY = Math.max(0, window.innerHeight - 44) // Keep title bar reachable

      const nextX = Math.min(Math.max(0, dragRef.current.origX + dx), maxX)
      const nextY = Math.min(Math.max(0, dragRef.current.origY + dy), maxY)

      setRect((prev) => ({ ...prev, x: nextX, y: nextY }))
    }

    const handleMouseUp = () => {
      dragRef.current = null
      setIsDragging(false)
      persistRect(rectRef.current)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    window.addEventListener('touchmove', handleMouseMove, { passive: false })
    window.addEventListener('touchend', handleMouseUp)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      window.removeEventListener('touchmove', handleMouseMove)
      window.removeEventListener('touchend', handleMouseUp)
    }
  }, [isDragging])

  // ── Resize Handlers (8 Directions) ─────────────────────────────────────────
  const handleResizeStart = (
    direction: string,
    e: React.MouseEvent | React.TouchEvent
  ) => {
    e.stopPropagation()
    e.preventDefault()

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY

    resizeRef.current = {
      direction,
      startX: clientX,
      startY: clientY,
      origX: rectRef.current.x,
      origY: rectRef.current.y,
      origW: rectRef.current.width,
      origH: rectRef.current.height,
    }
    setIsResizing(true)
  }

  useEffect(() => {
    if (!isResizing) return

    const handleMouseMove = (e: MouseEvent | TouchEvent) => {
      if (!resizeRef.current) return
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY

      const dx = clientX - resizeRef.current.startX
      const dy = clientY - resizeRef.current.startY
      const { direction, origX, origY, origW, origH } = resizeRef.current

      const minW = Math.min(MIN_CHAT_WIDTH, window.innerWidth - 16)
      const minH = Math.min(MIN_CHAT_HEIGHT, window.innerHeight - 16)
      const maxW = window.innerWidth - 16
      const maxH = window.innerHeight - 16

      let nextW = origW
      let nextH = origH
      let nextX = origX
      let nextY = origY

      // Horizontal resize
      if (direction.includes('e')) {
        nextW = Math.min(
          Math.max(minW, origW + dx),
          window.innerWidth - origX - 8
        )
      } else if (direction.includes('w')) {
        const proposedW = origW - dx
        const maxLeftW = origX + origW - 8
        nextW = Math.min(Math.max(minW, proposedW), Math.min(maxW, maxLeftW))
        nextX = origX + (origW - nextW)
      }

      // Vertical resize
      if (direction.includes('s')) {
        nextH = Math.min(
          Math.max(minH, origH + dy),
          window.innerHeight - origY - 8
        )
      } else if (direction.includes('n')) {
        const proposedH = origH - dy
        const maxTopH = origY + origH - 8
        nextH = Math.min(Math.max(minH, proposedH), Math.min(maxH, maxTopH))
        nextY = origY + (origH - nextH)
      }

      setRect({ x: nextX, y: nextY, width: nextW, height: nextH })
    }

    const handleMouseUp = () => {
      resizeRef.current = null
      setIsResizing(false)
      persistRect(rectRef.current)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    window.addEventListener('touchmove', handleMouseMove, { passive: false })
    window.addEventListener('touchend', handleMouseUp)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      window.removeEventListener('touchmove', handleMouseMove)
      window.removeEventListener('touchend', handleMouseUp)
    }
  }, [isResizing])

  if (!isOpen) return null

  return (
    <div
      id="chatOverlay"
      role="region"
      aria-label="Floating Chat Window"
      style={{
        position: 'fixed',
        left: `${rect.x}px`,
        top: `${rect.y}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        zIndex: 50,
      }}
      className={`flex flex-col bg-[#FFF5E6]/95 backdrop-blur-md border-2 border-on-surface rounded-xl shadow-[4px_4px_0px_#1c1b1b] overflow-hidden select-none animate-in fade-in zoom-in-95 duration-150 ${
        isDragging ? 'opacity-95 shadow-[6px_6px_0px_#1c1b1b]' : ''
      }`}
    >
      {/* ── 8 Resize Handles ──────────────────────────────────────────────── */}
      {/* Top Edge */}
      <div
        className="absolute top-0 left-3 right-3 h-2 cursor-ns-resize z-50 hover:bg-primary-container/20 transition-colors"
        onMouseDown={(e) => handleResizeStart('n', e)}
        onTouchStart={(e) => handleResizeStart('n', e)}
        title="Resize window height (Top)"
      />
      {/* Bottom Edge */}
      <div
        className="absolute bottom-0 left-3 right-3 h-2 cursor-ns-resize z-50 hover:bg-primary-container/20 transition-colors"
        onMouseDown={(e) => handleResizeStart('s', e)}
        onTouchStart={(e) => handleResizeStart('s', e)}
        title="Resize window height (Bottom)"
      />
      {/* Left Edge */}
      <div
        className="absolute left-0 top-3 bottom-3 w-2 cursor-ew-resize z-50 hover:bg-primary-container/20 transition-colors"
        onMouseDown={(e) => handleResizeStart('w', e)}
        onTouchStart={(e) => handleResizeStart('w', e)}
        title="Resize window width (Left)"
      />
      {/* Right Edge */}
      <div
        className="absolute right-0 top-3 bottom-3 w-2 cursor-ew-resize z-50 hover:bg-primary-container/20 transition-colors"
        onMouseDown={(e) => handleResizeStart('e', e)}
        onTouchStart={(e) => handleResizeStart('e', e)}
        title="Resize window width (Right)"
      />
      {/* Top-Left Corner */}
      <div
        className="absolute top-0 left-0 w-4 h-4 cursor-nwse-resize z-50 hover:bg-primary-container/40"
        onMouseDown={(e) => handleResizeStart('nw', e)}
        onTouchStart={(e) => handleResizeStart('nw', e)}
        title="Resize window (Top-Left)"
      />
      {/* Top-Right Corner */}
      <div
        className="absolute top-0 right-0 w-4 h-4 cursor-nesw-resize z-50 hover:bg-primary-container/40"
        onMouseDown={(e) => handleResizeStart('ne', e)}
        onTouchStart={(e) => handleResizeStart('ne', e)}
        title="Resize window (Top-Right)"
      />
      {/* Bottom-Left Corner */}
      <div
        className="absolute bottom-0 left-0 w-4 h-4 cursor-nesw-resize z-50 hover:bg-primary-container/40"
        onMouseDown={(e) => handleResizeStart('sw', e)}
        onTouchStart={(e) => handleResizeStart('sw', e)}
        title="Resize window (Bottom-Left)"
      />
      {/* Bottom-Right Corner */}
      <div
        className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize z-50 hover:bg-primary-container/40"
        onMouseDown={(e) => handleResizeStart('se', e)}
        onTouchStart={(e) => handleResizeStart('se', e)}
        title="Resize window (Bottom-Right)"
      />

      {/* Visible Bottom-Right Resize Grip Indicator */}
      <div
        className="absolute bottom-1 right-1 pointer-events-none select-none text-on-surface/40 z-30"
        aria-hidden="true"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path
            d="M8 2L2 8M9 5L5 9M9 8L8 9"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </div>

      {/* ── Draggable Header / Title Bar ──────────────────────────────────── */}
      <div
        id="chatHeader"
        onMouseDown={handleDragStart}
        onTouchStart={handleDragStart}
        className={`flex items-center justify-between px-2.5 py-1.5 bg-[#FFF5E6] border-b-2 border-on-surface shrink-0 select-none ${
          isDragging ? 'cursor-grabbing' : 'cursor-grab'
        }`}
        title="Drag to reposition chat window"
      >
        {/* Title & Status */}
        <div className="flex items-center gap-1.5 min-w-0 flex-1 pr-1 pointer-events-none">
          <span className="material-symbols-outlined text-[15px] text-outline/80 shrink-0">
            drag_indicator
          </span>
          <span
            className={`w-1.5 h-1.5 rounded-full border border-on-surface shrink-0 ${
              sessionId
                ? partnerStatus === 'reconnecting'
                  ? 'bg-error animate-ping'
                  : 'bg-emerald-500 animate-pulse'
                : 'bg-secondary-container'
            }`}
          />
          <span className="font-headline-md text-xs font-bold text-on-surface truncate min-w-0">
            {sessionId && partnerName
              ? `Adda • ${partnerName}`
              : 'UIU Live Chat'}
          </span>
        </div>

        {/* Header Action Buttons (Minimize, Close) */}
        <div className="flex items-center gap-0.5 shrink-0" data-no-drag="true">
          {/* Minimize / Hide Button */}
          <button
            id="btnMinimizeChat"
            type="button"
            title="Minimize chat window"
            aria-label="Minimize chat window"
            onClick={(e) => {
              e.stopPropagation()
              onMinimize()
            }}
            className="w-5 h-5 rounded flex items-center justify-center text-on-surface hover:bg-secondary-container transition-colors border border-transparent hover:border-on-surface active:translate-y-0.5"
          >
            <span className="material-symbols-outlined text-[14px]">
              remove
            </span>
          </button>

          {/* Close Button */}
          <button
            id="btnCloseChat"
            type="button"
            title="Close chat window"
            aria-label="Close chat window"
            onClick={(e) => {
              e.stopPropagation()
              onClose()
            }}
            className="w-5 h-5 rounded flex items-center justify-center text-on-surface hover:bg-error-container hover:text-error transition-colors border border-transparent hover:border-on-surface active:translate-y-0.5"
          >
            <span className="material-symbols-outlined text-[14px]">close</span>
          </button>
        </div>
      </div>

      {/* ── Message List Area ────────────────────────────────────────────── */}
      <div
        ref={chatStreamRef}
        id="chatStream"
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-2 py-1.5 space-y-1.5 bg-surface-container-lowest/80 scroll-smooth text-xs select-text"
      >
        {/* Connection Welcome Banner */}
        <div className="flex justify-center my-0.5">
          <span className="font-label-sm text-[9px] text-on-surface-variant bg-surface-container/70 px-1.5 py-0.5 rounded border border-on-surface/20 text-center truncate max-w-[92%]">
            {sessionId && partnerName
              ? `Connected with ${partnerName}. Say salam! ☕`
              : '✨ Ephemeral UIU Chat. Stay respectful & anonymous.'}
          </span>
        </div>

        {/* Message Items */}
        {messages.map((msg) => {
          if (msg.sender === 'notice') {
            return (
              <div
                key={msg.id}
                className="flex justify-center my-0.5 max-w-full"
              >
                <span className="font-label-sm text-[9px] text-primary font-bold bg-surface-container-high px-1.5 py-0.5 rounded border border-on-surface/50 shadow-[1px_1px_0px_#1c1b1b] text-center break-words [overflow-wrap:anywhere] max-w-[95%]">
                  {msg.text}
                </span>
              </div>
            )
          }

          if (msg.sender === 'stranger') {
            return (
              <div
                key={msg.id}
                className="flex flex-col items-start min-w-0 max-w-[85%]"
              >
                <div className="flex items-center gap-1 mb-0.5 max-w-full">
                  <span className="font-label-sm text-[9px] font-bold text-primary truncate max-w-[120px]">
                    {msg.name || 'Partner'}
                  </span>
                  <span className="font-label-sm text-[8px] text-outline shrink-0">
                    {msg.time}
                  </span>
                </div>
                <div className="min-w-0 max-w-full bg-surface-container-lowest text-on-surface border border-on-surface px-2.5 py-1 rounded-xl shadow-[1px_1px_0px_#1c1b1b] text-xs leading-snug break-words [overflow-wrap:anywhere] [word-break:break-word] whitespace-pre-wrap select-text">
                  {msg.text}
                </div>
              </div>
            )
          }

          // Local User Message
          return (
            <div
              key={msg.id}
              className="flex flex-col items-end self-end ml-auto min-w-0 max-w-[85%]"
            >
              <div className="flex items-center gap-1 mb-0.5 max-w-full">
                <span className="font-label-sm text-[8px] text-outline shrink-0">
                  {msg.time}
                </span>
                <span className="font-label-sm text-[9px] font-bold text-on-secondary-container truncate max-w-[120px]">
                  {msg.name}
                </span>
              </div>
              <div className="min-w-0 max-w-full bg-secondary-container text-on-secondary-container border border-on-surface px-2.5 py-1 rounded-xl shadow-[1px_1px_0px_#1c1b1b] text-xs font-medium leading-snug break-words [overflow-wrap:anywhere] [word-break:break-word] whitespace-pre-wrap select-text">
                {msg.text}
              </div>
            </div>
          )
        })}

        {/* Typing Indicator */}
        <div
          id="typingIndicator"
          className={`flex items-center gap-1 pt-0.5 ${isTyping ? '' : 'hidden'}`}
        >
          <span className="font-label-sm text-[9px] font-bold text-primary truncate max-w-[100px]">
            {partnerName || 'Partner'}
          </span>
          <span className="font-body-sm text-[9px] text-on-surface-variant italic">
            typing
          </span>
          <div className="flex items-center gap-0.5 ml-0.5 bg-surface-container px-1 py-0.5 rounded-full border border-on-surface/20">
            <span className="w-1 h-1 rounded-full bg-primary animate-bounce" />
            <span className="w-1 h-1 rounded-full bg-primary animate-bounce [animation-delay:0.2s]" />
            <span className="w-1 h-1 rounded-full bg-primary animate-bounce [animation-delay:0.4s]" />
          </div>
        </div>
      </div>

      {/* ── Message Composer Dock (Always Pinned at Bottom) ────────────────── */}
      <form
        id="chatForm"
        onSubmit={onSend}
        className="flex items-center gap-1 p-1.5 bg-[#FFF5E6] border-t-2 border-on-surface shrink-0 min-w-0 max-w-full overflow-hidden"
      >
        <div className="relative min-w-0 flex-1">
          <input
            ref={inputRef}
            id="messageInput"
            type="text"
            autoComplete="off"
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            placeholder="Type a message..."
            className="w-full px-2 py-1 bg-surface text-on-surface font-body-sm text-xs rounded-lg border border-on-surface shadow-[1px_1px_0px_#1c1b1b] focus:border-primary-container focus:outline-none transition-all placeholder:text-outline/70 min-w-0"
          />
        </div>

        {/* Quick Reactions */}
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            data-text="☕"
            onClick={() => onQuickEmoji('☕')}
            className="quick-reaction px-1 py-0.5 bg-surface-container hover:bg-secondary-container border border-on-surface rounded text-xs shadow-[1px_1px_0px_#1c1b1b] active:translate-y-[1px] transition-all"
            title="Send ☕"
          >
            ☕
          </button>
          {rect.width >= 330 && (
            <>
              <button
                type="button"
                data-text="😭"
                onClick={() => onQuickEmoji('😭')}
                className="quick-reaction px-1 py-0.5 bg-surface-container hover:bg-secondary-container border border-on-surface rounded text-xs shadow-[1px_1px_0px_#1c1b1b] active:translate-y-[1px] transition-all"
                title="Send 😭"
              >
                😭
              </button>
              <button
                type="button"
                data-text="🔥"
                onClick={() => onQuickEmoji('🔥')}
                className="quick-reaction px-1 py-0.5 bg-surface-container hover:bg-secondary-container border border-on-surface rounded text-xs shadow-[1px_1px_0px_#1c1b1b] active:translate-y-[1px] transition-all"
                title="Send 🔥"
              >
                🔥
              </button>
            </>
          )}
        </div>

        {/* Send Button */}
        <button
          id="sendBtn"
          type="submit"
          className="inline-flex items-center justify-center gap-1 px-2.5 py-1 bg-primary-container text-on-surface font-label-sm text-xs uppercase font-bold rounded-lg border border-on-surface shadow-[1px_1px_0px_#1c1b1b] hover:bg-[#ff8638] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all shrink-0 cursor-pointer"
        >
          <span>Send</span>
          <span className="material-symbols-outlined text-[13px]">send</span>
        </button>
      </form>
    </div>
  )
}
