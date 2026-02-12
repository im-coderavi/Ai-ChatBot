import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import ChatPage from './pages/ChatPage'
import AdminDashboard from './pages/AdminDashboard'
import CandidateDetail from './pages/CandidateDetail'

function App() {
    return (
        <Router>
            <Routes>
                <Route path="/" element={<ChatPage />} />
                <Route path="/admin" element={<AdminDashboard />} />
                <Route path="/admin/candidate/:id" element={<CandidateDetail />} />
            </Routes>
        </Router>
    )
}

export default App
