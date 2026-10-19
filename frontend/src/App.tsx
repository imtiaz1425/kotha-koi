import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import Chat from './pages/Chat'
import Video from './pages/Video'
import Login from './pages/Login'
import Register from './pages/Register'
import Profile from './pages/Profile'
import ChooseNickname from './pages/ChooseNickname'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/video" element={<Video />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/choose-nickname" element={<ChooseNickname />} />
        <Route path="/nickname" element={<ChooseNickname />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App

