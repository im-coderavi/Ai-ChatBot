import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { adminAPI } from '../services/api'
import './AdminDashboard.css'

function AdminDashboard() {
    const [stats, setStats] = useState(null)
    const [candidates, setCandidates] = useState([])
    const [total, setTotal] = useState(0)
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState('all')
    const [search, setSearch] = useState('')
    const navigate = useNavigate()

    useEffect(() => {
        fetchData()
    }, [filter])

    const fetchData = async () => {
        try {
            setLoading(true)
            const [statsRes, candidatesRes] = await Promise.all([
                adminAPI.getStats(),
                adminAPI.getCandidates({ status: filter, search, limit: 50 })
            ])
            setStats(statsRes.data.stats)
            setCandidates(candidatesRes.data.candidates)
            setTotal(candidatesRes.data.total)
        } catch (err) {
            console.error('Failed to fetch data:', err)
        } finally {
            setLoading(false)
        }
    }

    const handleSearch = (e) => {
        e.preventDefault()
        fetchData()
    }

    const handleDelete = async (id) => {
        if (!window.confirm('Delete this candidate record?')) return
        try {
            await adminAPI.deleteCandidate(id)
            setCandidates(prev => prev.filter(c => c._id !== id))
            setTotal(prev => prev - 1)
        } catch (err) {
            console.error('Failed to delete:', err)
        }
    }

    const getStatusBadge = (status) => {
        const map = {
            qualified: 'badge-qualified',
            disqualified: 'badge-disqualified',
            in_progress: 'badge-in-progress'
        }
        return `badge ${map[status] || 'badge-in-progress'}`
    }

    const formatDate = (date) => {
        return new Date(date).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        })
    }

    return (
        <div className="admin-dashboard">
            {/* Sidebar */}
            <aside className="admin-sidebar">
                <div className="sidebar-header">
                    <span className="sidebar-logo">🚚</span>
                    <div>
                        <h2>Tsavo West</h2>
                        <p>Hiring Dashboard</p>
                    </div>
                </div>

                <nav className="sidebar-nav">
                    <a className="nav-item active" href="#dashboard">
                        <span>📊</span> Dashboard
                    </a>
                    <a className="nav-item" href="/">
                        <span>💬</span> Chat Interface
                    </a>
                </nav>

                <div className="sidebar-footer">
                    <a href="/" className="btn btn-secondary w-full">← Back to Chat</a>
                </div>
            </aside>

            {/* Main Content */}
            <main className="admin-main">
                {/* Header */}
                <header className="admin-header">
                    <div>
                        <h1>Dashboard</h1>
                        <p>Manage and review candidate applications</p>
                    </div>
                </header>

                {/* Stats Grid */}
                {stats && (
                    <div className="stats-grid animate-fadeIn">
                        <div className="stats-card">
                            <div className="stats-value">{stats.total}</div>
                            <div className="stats-label">Total Candidates</div>
                        </div>
                        <div className="stats-card">
                            <div className="stats-value" style={{ background: 'linear-gradient(135deg, #10B981, #06B6D4)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                                {stats.qualified}
                            </div>
                            <div className="stats-label">Qualified</div>
                        </div>
                        <div className="stats-card">
                            <div className="stats-value" style={{ background: 'linear-gradient(135deg, #EF4444, #F59E0B)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                                {stats.disqualified}
                            </div>
                            <div className="stats-label">Disqualified</div>
                        </div>
                        <div className="stats-card">
                            <div className="stats-value">{stats.qualificationRate}%</div>
                            <div className="stats-label">Pass Rate</div>
                        </div>
                        <div className="stats-card">
                            <div className="stats-value">{stats.today}</div>
                            <div className="stats-label">Today</div>
                        </div>
                        <div className="stats-card">
                            <div className="stats-value">{stats.averageScore}</div>
                            <div className="stats-label">Avg Score</div>
                        </div>
                    </div>
                )}

                {/* Candidates Table */}
                <div className="candidates-section animate-slideUp">
                    <div className="candidates-header">
                        <h2>Candidates ({total})</h2>
                        <div className="candidates-controls">
                            <form onSubmit={handleSearch} className="search-form">
                                <input
                                    type="text"
                                    className="input-field search-input"
                                    placeholder="Search by name..."
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                />
                            </form>
                            <div className="filter-pills">
                                {['all', 'qualified', 'disqualified', 'in_progress'].map(f => (
                                    <button
                                        key={f}
                                        className={`filter-pill ${filter === f ? 'active' : ''}`}
                                        onClick={() => setFilter(f)}
                                    >
                                        {f === 'in_progress' ? 'In Progress' : f.charAt(0).toUpperCase() + f.slice(1)}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {loading ? (
                        <div className="loading-state">Loading candidates...</div>
                    ) : candidates.length === 0 ? (
                        <div className="empty-state">
                            <span className="empty-icon">📋</span>
                            <p>No candidates found</p>
                        </div>
                    ) : (
                        <div className="candidates-table-wrapper">
                            <table className="candidates-table">
                                <thead>
                                    <tr>
                                        <th>Name</th>
                                        <th>Email</th>
                                        <th>Status</th>
                                        <th>Score</th>
                                        <th>Phase</th>
                                        <th>Date</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {candidates.map(c => (
                                        <tr key={c._id}>
                                            <td>
                                                <span className="candidate-name">
                                                    {c.personalInfo?.name || 'Anonymous'}
                                                </span>
                                            </td>
                                            <td className="email-cell">
                                                {c.personalInfo?.email || '-'}
                                            </td>
                                            <td>
                                                <span className={getStatusBadge(c.status)}>
                                                    {c.status?.replace('_', ' ')}
                                                </span>
                                            </td>
                                            <td className="score-cell">{c.overallScore || 0}</td>
                                            <td className="phase-cell">{c.currentPhase?.replace('_', ' ')}</td>
                                            <td className="date-cell">{formatDate(c.createdAt)}</td>
                                            <td>
                                                <div className="action-btns">
                                                    <Link to={`/admin/candidate/${c._id}`} className="btn btn-icon" title="View Details">
                                                        👁️
                                                    </Link>
                                                    <button
                                                        className="btn btn-icon"
                                                        onClick={() => handleDelete(c._id)}
                                                        title="Delete"
                                                    >
                                                        🚨
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </main>
        </div>
    )
}

export default AdminDashboard
