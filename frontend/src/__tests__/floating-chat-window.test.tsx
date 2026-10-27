import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import React from 'react'
import {
  FloatingChatWindow,
  ChatMessage,
} from '../components/FloatingChatWindow'
import {
  getDefaultRect,
  loadSavedRect,
  DEFAULT_CHAT_WIDTH,
  DEFAULT_CHAT_HEIGHT,
} from '../components/floating-chat-rect'
import Chat from '../pages/Chat'

class MockStorage implements Storage {
  private store = new Map<string, string>()

  get length(): number {
    return this.store.size
  }

  clear(): void {
    this.store.clear()
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null
  }

  removeItem(key: string): void {
    this.store.delete(key)
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value))
  }
}

if (!globalThis.localStorage) {
  Object.defineProperty(globalThis, 'localStorage', {
    value: new MockStorage(),
    writable: true,
  })
}

describe('Floating, Draggable, Resizable Chat Window Tests', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  const dummyMessages: ChatMessage[] = [
    {
      id: 1,
      sender: 'notice',
      name: 'KothaKoi',
      time: '12:00 PM',
      text: 'Connected with UIU peer.',
    },
    {
      id: 2,
      sender: 'stranger',
      name: 'Pixel Panda',
      time: '12:01 PM',
      text: 'Salam! How is the CSE trimester going?',
    },
    {
      id: 3,
      sender: 'user',
      name: 'You (Midnight Mango)',
      time: '12:02 PM',
      text: 'Walaykum Assalam! Extremely busy with lab reports and quizzes.',
    },
    {
      id: 4,
      sender: 'stranger',
      name: 'Pixel Panda',
      time: '12:03 PM',
      text: 'Check this link: https://elearning.uiu.ac.bd/course/view.php?id=999999999999999999999999999999999999999999999999999999999999',
    },
    {
      id: 5,
      sender: 'user',
      name: 'You (Midnight Mango)',
      time: '12:04 PM',
      text: 'SuperLongWordWithoutAnySpacesAtAllToTestWordBreakingAndWrappingBehaviorInTheChatWindowComponent1234567890',
    },
  ]

  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    onMinimize: vi.fn(),
    messages: dummyMessages,
    input: '',
    onInputChange: vi.fn(),
    onSend: vi.fn(),
    isTyping: false,
    partnerName: 'Pixel Panda',
    sessionId: 'session-123',
    partnerStatus: 'connected' as const,
    onQuickEmoji: vi.fn(),
    chatStreamRef: React.createRef<HTMLDivElement>(),
    inputRef: React.createRef<HTMLInputElement>(),
  }

  it('1. Renders floating chat window with draggable header and title when isOpen is true', () => {
    const html = renderToString(<FloatingChatWindow {...defaultProps} />)

    expect(html).toContain('id="chatOverlay"')
    expect(html).toContain('id="chatHeader"')
    expect(html).toContain('Adda • Pixel Panda')
    expect(html).toContain('id="btnMinimizeChat"')
    expect(html).toContain('id="btnCloseChat"')
    expect(html).toContain('cursor-grab')
  })

  it('2. Does not render any DOM elements when isOpen is false', () => {
    const html = renderToString(
      <FloatingChatWindow {...defaultProps} isOpen={false} />
    )

    expect(html).not.toContain('id="chatOverlay"')
  })

  it('3. Renders all 8 resize handles for multi-directional resizing', () => {
    const html = renderToString(<FloatingChatWindow {...defaultProps} />)

    expect(html).toContain('cursor-ns-resize') // Top & Bottom
    expect(html).toContain('cursor-ew-resize') // Left & Right
    expect(html).toContain('cursor-nwse-resize') // Corners NW & SE
    expect(html).toContain('cursor-nesw-resize') // Corners NE & SW
  })

  it('4. Applies long text wrapping rules (break-words, overflow-wrap, max-w-[85%]) preventing horizontal overflow', () => {
    const html = renderToString(<FloatingChatWindow {...defaultProps} />)

    // Long unbroken URL
    expect(html).toContain('https://elearning.uiu.ac.bd/course/view.php')
    // Long unbroken word
    expect(html).toContain(
      'SuperLongWordWithoutAnySpacesAtAllToTestWordBreaking'
    )

    // CSS class assertions for wrapping
    expect(html).toContain('break-words')
    expect(html).toContain('[overflow-wrap:anywhere]')
    expect(html).toContain('whitespace-pre-wrap')
    expect(html).toContain('max-w-[85%]')
    expect(html).toContain('overflow-x-hidden')
  })

  it('5. Chat page renders floating chat window open by default', () => {
    const html = renderToString(
      <MemoryRouter>
        <Chat />
      </MemoryRouter>
    )

    // Window is rendered open by default
    expect(html).toContain('id="chatOverlay"')
    expect(html).toContain('id="chatHeader"')
    // Composer input and send button
    expect(html).toContain('id="messageInput"')
    expect(html).toContain('id="sendBtn"')
  })

  it('6. Header controls have data-no-drag to prevent accidental drag during button clicks', () => {
    const html = renderToString(<FloatingChatWindow {...defaultProps} />)

    expect(html).toContain('data-no-drag="true"')
  })

  it('7. FloatingChatWindow includes visual resize grip indicator in bottom-right corner', () => {
    const html = renderToString(<FloatingChatWindow {...defaultProps} />)

    expect(html).toContain('stroke-width="1.5"')
    expect(html).toContain('stroke-linecap="round"')
  })

  it('8. Message composer is pinned with shrink-0 and message input is full-width min-w-0', () => {
    const html = renderToString(<FloatingChatWindow {...defaultProps} />)

    expect(html).toContain('shrink-0')
    expect(html).toContain('min-w-0 flex-1')
  })

  it('9. Default desktop window size is compact (approximately 360px wide x 400px tall)', () => {
    const rect = getDefaultRect()
    expect(rect.width).toBe(DEFAULT_CHAT_WIDTH)
    expect(rect.height).toBe(DEFAULT_CHAT_HEIGHT)
    expect(rect.width).toBe(360)
    expect(rect.height).toBe(400)
  })

  it('10. Safely normalizes oversized saved dimensions from older versions to compact 360x400 defaults', () => {
    localStorage.setItem(
      'kothakoi_floating_chat_rect',
      JSON.stringify({ x: 100, y: 100, width: 550, height: 650 })
    )

    const rect = loadSavedRect()
    expect(rect.width).toBe(360)
    expect(rect.height).toBe(400)
  })

  it('11. Header truncates long titles with ellipses to prevent window expansion', () => {
    const html = renderToString(
      <FloatingChatWindow
        {...defaultProps}
        partnerName="ExtremelyLongUIUStudentNicknameWithManyCharactersThatWouldOverflowTheWindow1234567890"
      />
    )

    expect(html).toContain('truncate')
    expect(html).toContain('min-w-0')
    expect(html).toContain('ExtremelyLongUIUStudentNickname')
  })

  it('12. Composer has min-w-0 and overflow-hidden to prevent forcing the window wider', () => {
    const html = renderToString(<FloatingChatWindow {...defaultProps} />)

    expect(html).toContain('overflow-hidden')
    expect(html).toContain('max-w-full')
  })
})
