import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { adminAPI } from '../services/api'
import './CandidateDetail.css'

function CandidateDetail() {
    const { id } = useParams()
    const navigate = useNavigate()
    const [candidate, setCandidate] = useState(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetchCandidate()
    }, [id])

    const fetchCandidate = async () => {
        try {
            const { data } = await adminAPI.getCandidate(id)
            setCandidate(data.candidate)
        } catch (err) {
            console.error('Failed to fetch candidate:', err)
        } finally {
            setLoading(false)
        }
    }

    if (loading) {
        return (
            <div className="detail-page">
                <div className="detail-loading">Loading candidate details...</div>
            </div>
        )
    }

    if (!candidate) {
        return (
            <div className="detail-page">
                <div className="detail-error">Candidate not found</div>
            </div>
        )
    }

    const isQualified = candidate.status === 'qualified'
    const mandatory = candidate.qualifications?.mandatory || {}
    const preferred = candidate.qualifications?.preferred || {}

    const getStatusIcon = (status) => {
        if (status === 'qualified') return '✅'
        if (status === 'disqualified') return '❌'
        return '⏳'
    }

    return (
        <div className="detail-page">
            <div className="detail-container">
                {/* Back Button */}
                <Link to="/admin" className="detail-back">← Back to Dashboard</Link>

                {/* Header Card */}
                <div className="detail-header glass-card animate-fadeIn">
                    <div className="detail-header-top">
                        <div>
                            <h1>{candidate.personalInfo?.name || 'Anonymous Candidate'}</h1>
                            <p className="detail-meta">
                                {candidate.personalInfo?.email && (
                                    <>
                                        <span className="detail-email">📧 {candidate.personalInfo.email}</span>
                                        <span className="detail-separator">•</span>
                                    </>
                                )}
                                Applied {new Date(candidate.createdAt).toLocaleDateString('en-US', {
                                    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
                                })}
                            </p>
                        </div>
                        <div className="detail-score-badge">
                            <div className={`score-ring ${isQualified ? 'qualified' : candidate.status === 'disqualified' ? 'disqualified' : ''}`}>
                                <span className="score-number">{candidate.overallScore || 0}</span>
                            </div>
                            <span className={`badge ${isQualified ? 'badge-qualified' : candidate.status === 'disqualified' ? 'badge-disqualified' : 'badge-in-progress'}`}>
                                {candidate.status?.replace('_', ' ')}
                            </span>
                        </div>
                    </div>

                    {candidate.disqualificationReason && (
                        <div className="detail-disq-reason">
                            <strong>Disqualification Reason:</strong> {candidate.disqualificationReason}
                        </div>
                    )}

                    <div className="detail-info-grid">
                        <div className="info-item">
                            <span className="info-label">Phase</span>
                            <span className="info-value">{candidate.currentPhase?.replace('_', ' ')}</span>
                        </div>
                        <div className="info-item">
                            <span className="info-label">AI Model</span>
                            <span className="info-value">{candidate.aiModelUsed || 'N/A'}</span>
                        </div>
                        <div className="info-item">
                            <span className="info-label">Processing Time</span>
                            <span className="info-value">{candidate.processingTime ? `${candidate.processingTime}ms` : 'N/A'}</span>
                        </div>
                        <div className="info-item">
                            <span className="info-label">Messages</span>
                            <span className="info-value">{candidate.transcript?.length || 0}</span>
                        </div>
                    </div>
                </div>

                {/* Qualifications Grid */}
                <div className="detail-section animate-slideUp">
                    <h2>Mandatory Qualifications</h2>
                    <div className="qual-grid">
                        {Object.entries(mandatory).map(([key, val]) => (
                            <div key={key} className={`qual-card glass-card ${val.status === 'qualified' ? 'qual-pass' : val.status === 'disqualified' ? 'qual-fail' : 'qual-pending'}`}>
                                <div className="qual-icon">{getStatusIcon(val.status)}</div>
                                <div className="qual-name">{key.replace(/([A-Z])/g, ' $1').trim()}</div>
                                <div className="qual-status">{val.status}</div>
                                {val.rawAnswer && (
                                    <div className="qual-answer">{val.rawAnswer}</div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                <div className="detail-section animate-slideUp">
                    <h2>Preferred Qualifications</h2>
                    <div className="qual-grid">
                        {Object.entries(preferred).map(([key, val]) => (
                            <div key={key} className="qual-card glass-card">
                                <div className="qual-score-bar">
                                    <div
                                        className="qual-score-fill"
                                        style={{ width: `${Math.min((val.score || 0) / 20 * 100, 100)}%` }}
                                    ></div>
                                </div>
                                <div className="qual-name">{key.replace(/([A-Z])/g, ' $1').trim()}</div>
                                <div className="qual-score-value">{val.score || 0} pts</div>
                                {val.details && (
                                    <div className="qual-answer">{val.details}</div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Transcript */}
                <div className="detail-section animate-slideUp">
                    <h2>Conversation Transcript</h2>
                    <div className="transcript glass-card">
                        {candidate.transcript?.map((entry, i) => (
                            <div key={i} className={`transcript-entry ${entry.role}`}>
                                <div className="transcript-role">
                                    {entry.role === 'agent' ? '🤖 Agent' : '👤 Candidate'}
                                </div>
                                <div className="transcript-message">{entry.message}</div>
                                <div className="transcript-time">
                                    {new Date(entry.timestamp).toLocaleTimeString()}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}

export default CandidateDetail
