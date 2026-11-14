import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context'
import { OnlineProvider } from './context/OnlineContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import Home from './pages/Home'
import Chat from './pages/Chat'
import Video from './pages/Video'
import Login from './pages/Login'
import Register from './pages/Register'
import Profile from './pages/Profile'
import ChooseNickname from './pages/ChooseNickname'
import CommunityGuidelines from './pages/CommunityGuidelines'
import TermsOfService from './pages/TermsOfService'
import PrivacyPolicy from './pages/PrivacyPolicy'
import SafetyTips from './pages/SafetyTips'
import AdminLogin from './pages/AdminLogin'
import AdminDashboard from './pages/AdminDashboard'
import NotFound from './pages/NotFound'

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <OnlineProvider>
          <Routes>
            {/* Public Routes */}
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/community-guidelines" element={<CommunityGuidelines />} />
            <Route path="/terms" element={<TermsOfService />} />
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/safety-tips" element={<SafetyTips />} />
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin" element={<AdminDashboard />} />

            {/* Protected Routes */}
            <Route element={<ProtectedRoute />}>
              <Route path="/chat" element={<Chat />} />
              <Route path="/video" element={<Video />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/choose-nickname" element={<ChooseNickname />} />
              <Route path="/nickname" element={<ChooseNickname />} />
            </Route>

            {/* 404 Catch-All Route */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </OnlineProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
