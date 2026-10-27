import { describe, it, expect } from 'vitest'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext } from '../context/auth-context'
import type { AuthContextValue, AuthUser } from '../types/auth'
import Register from '../pages/Register'
import Profile from '../pages/Profile'
import ChooseNickname from '../pages/ChooseNickname'

describe('Frontend Identity Separation & Nickname UI Tests', () => {
  const mockUser: AuthUser = {
    id: 'user-uiu-123',
    email: '011231999@bscse.uiu.ac.bd',
    role: 'student',
    status: 'active',
    hasProfile: true,
    name: 'Tariqul Alam',
  }

  const mockAuthContext: AuthContextValue = {
    user: mockUser,
    status: 'authenticated',
    isLoading: false,
    isAuthenticated: true,
    error: null,
    errorCode: null,
    checkAuth: async () => {},
    loginUser: () => {},
    logout: async () => {},
  }

  it('1. Register page includes UI elements for registration and mentions anonymous privacy', () => {
    const html = renderToString(
      <MemoryRouter>
        <Register />
      </MemoryRouter>
    )

    expect(html).toContain('UIU Institutional Email')
    expect(html).toContain('UIU Registration')
    expect(html).toContain('100% Anonymous by Design')
  })

  it('2. Profile page displays the authenticated private Profile Name and actual account info without fabricated demo identity', () => {
    const html = renderToString(
      <MemoryRouter>
        <AuthContext.Provider value={mockAuthContext}>
          <Profile />
        </AuthContext.Provider>
      </MemoryRouter>
    )

    // Displays authenticated user's private name
    expect(html).toContain('Tariqul Alam')
    expect(html).toContain('011231999')
    expect(html).toContain('011231999@bscse.uiu.ac.bd')
    expect(html).toContain('Computer Science &amp; Engineering')

    // Confidentiality indicator
    expect(html).toContain('Private Profile Name (Confidential)')

    // Dedicated Current Chat Nickname section is present
    expect(html).toContain('Current Chat Nickname (Temporary Persona)')
    expect(html).toContain('Active Chat Alias')

    // Fabricated demo student "Tanvir Ahmed" and fake demo metrics are completely removed
    expect(html).not.toContain('Tanvir Ahmed')
    expect(html).not.toContain('2310125@bscse.uiu.ac.bd')
    expect(html).not.toContain('14.5 hrs')
    expect(html).not.toContain('42 students')
    expect(html).not.toContain('38 cups')
  })

  it('3. ChooseNickname page displays temporary adda alias selection and authenticated session without demo identity', () => {
    const html = renderToString(
      <MemoryRouter>
        <AuthContext.Provider value={mockAuthContext}>
          <ChooseNickname />
        </AuthContext.Provider>
      </MemoryRouter>
    )

    expect(html).toContain('Choose Chat Nickname')
    expect(html).toContain('Pick Your Temporary Adda Alias')
    expect(html).toContain('Student Session: 011231999')
    expect(html).toContain('Tariqul Alam')

    // Tanvir Ahmed demo banner removed
    expect(html).not.toContain('Prototype Mode: Demo Student (Tanvir Ahmed')
  })
})
