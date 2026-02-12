import { useState, useEffect, useRef } from 'react'
import { chatAPI } from '../services/api'
import ChatInput from './ChatInput'
import './CompletionScreen.css'

function CompletionScreen({ conversationId, status, onClose, messages, onSendFollowUp, isTyping }) {
    const [result, setResult] = useState(null)
    const [loading, setLoading] = useState(true)
    const [showHistory, setShowHistory] = useState(false)
    const historyEndRef = useRef(null)

    useEffect(() => {
        const fetchResult = async () => {
            try {
                const { data } = await chatAPI.getResult(conversationId)
                setResult(data)
            } catch (err) {
                console.error('Failed to fetch result:', err)
            } finally {
                setLoading(false)
            }
        }
        if (conversationId) fetchResult()
    }, [conversationId])

    useEffect(() => {
        if (showHistory) {
            historyEndRef.current?.scrollIntoView({ behavior: 'smooth' })
        }
    }, [messages, showHistory])

    if (loading) {
        return (
            <div className="completion-overlay animate-fadeIn">
                <div className="completion-panel glass-card">
                    <div className="completion-loading">
                        <div className="loading-spinner"></div>
                        <span>Preparing your results...</span>
                    </div>
                </div>
            </div>
        )
    }

    const isQualified = status === 'qualified'
    const matchScore = result?.matchScore || 0
    const mandatoryBreakdown = result?.mandatoryBreakdown || []
    const preferredBreakdown = result?.preferredBreakdown || []
    const veteranBonus = result?.veteranBonus || { isVeteran: false, bonusPoints: 0 }
    const earlyDisqualification = result?.earlyDisqualification || null
    const totalPreferred = preferredBreakdown.reduce((s, p) => s + p.score, 0) + veteranBonus.bonusPoints

    const getStatusIcon = (s) => {
        if (s === 'qualified') return '✅'
        if (s === 'disqualified') return '❌'
        return '⬜'
    }

    return (
        <div className="completion-overlay animate-fadeIn">
            <div className="completion-panel glass-card">
                {/* Close Button */}
                <button className="completion-close-btn" onClick={onClose} aria-label="Close results">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>

                <div className="completion-scroll">
                    {/* Header */}
                    <div className="completion-header">
                        <div className={`status-badge ${isQualified ? 'status-qualified' : 'status-disqualified'}`}>
                            <span className="status-badge-icon">{isQualified ? '✅' : '❌'}</span>
                            <span className="status-badge-text">{isQualified ? 'QUALIFIED' : 'NOT QUALIFIED'}</span>
                        </div>
                        {result?.jobTitle && (
                            <p className="completion-job-title">{result.jobTitle}</p>
                        )}
                        {result?.candidateName && result.candidateName !== 'Unknown' && (
                            <p className="completion-candidate-name">Candidate: {result.candidateName}</p>
                        )}
                    </div>

                    {/* Score Ring */}
                    <div className="score-ring-container">
                        <div className="score-ring" style={{ '--score-percent': `${Math.min(matchScore, 100)}` }}>
                            <div className="score-ring-inner">
                                <span className="score-ring-value">{matchScore}</span>
                                <span className="score-ring-label">/ 100</span>
                            </div>
                        </div>
                        <p className="score-ring-caption">Match Score</p>
                    </div>

                    {/* Early Disqualification Alert */}
                    {earlyDisqualification && (
                        <div className="disqualification-alert">
                            <div className="disqualification-alert-icon">⚠️</div>
                            <div>
                                <strong>Early Disqualification</strong>
                                <p>Failed: {earlyDisqualification.failedRequirement}</p>
                                <p>{earlyDisqualification.reason}</p>
                            </div>
                        </div>
                    )}

                    {/* Mandatory Qualifications */}
                    <div className="qual-section">
                        <h3 className="qual-section-title">
                            <span className="qual-section-icon">📋</span>
                            Mandatory Requirements
                        </h3>
                        <div className="qual-table">
                            {mandatoryBreakdown.map((m, i) => (
                                <div key={m.key} className={`qual-row ${m.status === 'disqualified' ? 'qual-row-fail' : ''} ${m.status === 'qualified' ? 'qual-row-pass' : ''}`}>
                                    <span className="qual-row-icon">{getStatusIcon(m.status)}</span>
                                    <span className="qual-row-label">{m.label}</span>
                                    <span className={`qual-row-status qual-status-${m.status}`}>
                                        {m.status === 'qualified' ? 'PASS' : m.status === 'disqualified' ? 'FAIL' : 'N/A'}
                                    </span>
                                    {m.rawAnswer && (
                                        <span className="qual-row-answer" title={m.rawAnswer}>
                                            {m.rawAnswer.length > 40 ? m.rawAnswer.substring(0, 40) + '...' : m.rawAnswer}
                                        </span>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Preferred Qualifications (only show if not early disqualified) */}
                    {!earlyDisqualification && (
                        <div className="qual-section">
                            <h3 className="qual-section-title">
                                <span className="qual-section-icon">⭐</span>
                                Preferred Qualifications
                            </h3>
                            <div className="qual-table">
                                {preferredBreakdown.map(p => (
                                    <div key={p.key} className="qual-row">
                                        <span className="qual-row-icon">{p.score > 0 ? '✅' : '⬜'}</span>
                                        <span className="qual-row-label">{p.label}</span>
                                        <span className="qual-row-score">
                                            <strong>{p.score}</strong>/{p.maxScore} pts
                                        </span>
                                        {p.details && (
                                            <span className="qual-row-answer" title={p.details}>
                                                {p.details.length > 40 ? p.details.substring(0, 40) + '...' : p.details}
                                            </span>
                                        )}
                                    </div>
                                ))}
                                {/* Veteran Bonus */}
                                <div className="qual-row">
                                    <span className="qual-row-icon">{veteranBonus.isVeteran ? '🎖️' : '⬜'}</span>
                                    <span className="qual-row-label">Military/Veteran Bonus</span>
                                    <span className="qual-row-score">
                                        <strong>{veteranBonus.bonusPoints}</strong>/5 pts
                                    </span>
                                </div>
                            </div>
                            <div className="preferred-total">
                                Total Preferred: <strong>{totalPreferred}</strong> / 55 pts
                            </div>
                        </div>
                    )}

                    {/* Recruiter Summary */}
                    {result?.recruiterSummary && (
                        <div className="recruiter-summary">
                            <h3 className="qual-section-title">
                                <span className="qual-section-icon">📝</span>
                                Recruiter Summary
                            </h3>
                            <p className="recruiter-summary-text">{result.recruiterSummary}</p>
                        </div>
                    )}

                    {/* Disqualification reason */}
                    {result?.disqualificationReason && !earlyDisqualification && (
                        <div className="disqualification-reason">
                            <strong>Reason:</strong> {result.disqualificationReason}
                        </div>
                    )}

                    {/* Next Steps */}
                    {isQualified && (
                        <div className="next-steps">
                            <h3 className="qual-section-title">
                                <span className="qual-section-icon">🚀</span>
                                Next Steps
                            </h3>
                            <ol className="next-steps-list">
                                <li>A recruiter will contact you within 2 business days</li>
                                <li>Schedule an in-person interview</li>
                                <li>Complete background check & drug screening</li>
                                <li>Final hiring decision</li>
                            </ol>
                        </div>
                    )}

                    {/* Chat History Toggle */}
                    <div className="chat-history-section">
                        <button
                            className="chat-history-toggle"
                            onClick={() => setShowHistory(!showHistory)}
                        >
                            <span className="qual-section-icon">💬</span>
                            <span>{showHistory ? 'Hide' : 'View'} Chat History</span>
                            <span className={`toggle-arrow ${showHistory ? 'open' : ''}`}>▼</span>
                        </button>

                        {showHistory && (
                            <div className="chat-history-panel animate-fadeIn">
                                {messages.map((msg, i) => (
                                    <div key={i} className={`history-msg ${msg.role === 'agent' ? 'history-msg-agent' : 'history-msg-user'}`}>
                                        <div className="history-msg-role">
                                            {msg.role === 'agent' ? '🤖 Agent' : '👤 You'}
                                        </div>
                                        <div className="history-msg-text">{msg.text}</div>
                                        <div className="history-msg-time">
                                            {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </div>
                                    </div>
                                ))}
                                <div ref={historyEndRef} />
                            </div>
                        )}
                    </div>

                    {/* Follow-up Questions */}
                    <div className="followup-section">
                        <h3 className="qual-section-title">
                            <span className="qual-section-icon">❓</span>
                            Have Additional Questions?
                        </h3>
                        <p className="followup-hint">Ask about pay, benefits, schedule, or anything else about the position.</p>
                        <ChatInput
                            onSend={onSendFollowUp}
                            disabled={isTyping}
                        />
                    </div>

                    {/* Actions */}
                    <div className="completion-actions">
                        <button className="btn btn-secondary" onClick={onClose}>
                            ← Back to Chat
                        </button>
                        <button className="btn btn-primary" onClick={() => window.location.reload()}>
                            Start New Application
                        </button>
                    </div>

                    <p className="completion-note">
                        {isQualified
                            ? "📧 You should receive a follow-up email within 24-48 hours."
                            : "📞 Questions? Contact Tsavo West Inc at the terminal office."}
                    </p>
                </div>
            </div>
        </div>
    )
}

export default CompletionScreen
