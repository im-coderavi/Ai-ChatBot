import { useState, useEffect, useRef, useCallback } from 'react'
import { connectSocket, disconnectSocket } from '../services/socket'
import WelcomeScreen from '../components/WelcomeScreen'
import ChatMessage from '../components/ChatMessage'
import ChatInput from '../components/ChatInput'
import TypingIndicator from '../components/TypingIndicator'
import CompletionScreen from '../components/CompletionScreen'
import './ChatPage.css'

function ChatPage() {
    const [phase, setPhase] = useState('welcome') // welcome | chatting | complete
    const [conversationId, setConversationId] = useState(null)
    const [messages, setMessages] = useState([])
    const [isTyping, setIsTyping] = useState(false)
    const [isConnected, setIsConnected] = useState(false)
    const [finalStatus, setFinalStatus] = useState(null)
    const [showCompletion, setShowCompletion] = useState(false)
    const messagesEndRef = useRef(null)
    const socketRef = useRef(null)

    // Auto-scroll
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages, isTyping])

    // Cleanup on unmount
    useEffect(() => {
        return () => disconnectSocket()
    }, [])

    const handleStart = useCallback(() => {
        // Always disconnect old socket first to prevent listener stacking
        disconnectSocket()

        const socket = connectSocket()
        socketRef.current = socket

        socket.on('connect', () => setIsConnected(true))
        socket.on('disconnect', () => setIsConnected(false))

        socket.on('conversation_started', (data) => {
            setConversationId(data.conversationId)
            setMessages([{ role: 'agent', text: data.message, timestamp: new Date() }])
            setPhase('chatting')
        })

        socket.on('response', (data) => {
            setIsTyping(false)
            setMessages(prev => [...prev, {
                role: 'agent',
                text: data.message,
                timestamp: new Date()
            }])

            if (data.conversationComplete && !data.isFollowUp) {
                setFinalStatus(data.status)
                setTimeout(() => {
                    setPhase('complete')
                    setShowCompletion(true)
                }, 2000)
            }
        })

        socket.on('typing', (data) => {
            setIsTyping(data.isTyping)
        })

        socket.on('error', (data) => {
            setIsTyping(false)
            setMessages(prev => [...prev, {
                role: 'agent',
                text: data.message || 'Something went wrong. Please try again.',
                timestamp: new Date(),
                isError: true
            }])
        })

        // Start conversation
        socket.emit('start_conversation', { jobId: 'fedex-driver-001' })
    }, [])

    const handleSendMessage = useCallback((text) => {
        if (!socketRef.current || !conversationId) return

        setMessages(prev => [...prev, {
            role: 'candidate',
            text,
            timestamp: new Date()
        }])

        socketRef.current.emit('message', {
            conversationId,
            message: text
        })
    }, [conversationId])

    // Follow-up questions after completion -- uses the same send flow
    const handleSendFollowUp = useCallback((text) => {
        if (!socketRef.current || !conversationId) return

        setMessages(prev => [...prev, {
            role: 'candidate',
            text,
            timestamp: new Date()
        }])

        setIsTyping(true)

        socketRef.current.emit('message', {
            conversationId,
            message: text
        })
    }, [conversationId])

    const handleCloseCompletion = useCallback(() => {
        setShowCompletion(false)
    }, [])

    const handleRestart = useCallback(() => {
        disconnectSocket()
        socketRef.current = null
        setPhase('welcome')
        setConversationId(null)
        setMessages([])
        setIsTyping(false)
        setFinalStatus(null)
        setShowCompletion(false)
    }, [])

    return (
        <div className="chat-page">
            {/* Background decoration */}
            <div className="chat-bg-orb chat-bg-orb-1"></div>
            <div className="chat-bg-orb chat-bg-orb-2"></div>

            {phase === 'welcome' && (
                <WelcomeScreen onStart={handleStart} />
            )}

            {(phase === 'chatting' || phase === 'complete') && (
                <div className="chat-container animate-fadeIn">
                    {/* Header */}
                    <div className="chat-header">
                        <div className="chat-header-left">
                            <div className="chat-avatar">
                                <span>🤖</span>
                            </div>
                            <div>
                                <h2 className="chat-title">Tsavo West Hiring Agent</h2>
                                <div className="chat-status">
                                    <span className={`status-dot ${isConnected ? 'online' : 'offline'}`}></span>
                                    <span>{isConnected ? 'Online' : 'Reconnecting...'}</span>
                                </div>
                            </div>
                        </div>
                        {phase === 'complete' && !showCompletion && (
                            <button
                                className="btn btn-secondary view-results-btn"
                                onClick={() => setShowCompletion(true)}
                            >
                                📊 View Results
                            </button>
                        )}
                    </div>

                    {/* Messages Area */}
                    <div className="chat-messages">
                        {messages.map((msg, i) => (
                            <ChatMessage key={i} message={msg} index={i} />
                        ))}
                        {isTyping && <TypingIndicator />}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input - show during chatting, or during complete phase when overlay is closed */}
                    {phase === 'chatting' && (
                        <ChatInput
                            onSend={handleSendMessage}
                            disabled={isTyping || !isConnected}
                        />
                    )}
                    {phase === 'complete' && !showCompletion && (
                        <ChatInput
                            onSend={handleSendFollowUp}
                            disabled={isTyping || !isConnected}
                        />
                    )}
                </div>
            )}

            {/* CompletionScreen Overlay */}
            {phase === 'complete' && showCompletion && (
                <CompletionScreen
                    conversationId={conversationId}
                    status={finalStatus}
                    onClose={handleCloseCompletion}
                    onRestart={handleRestart}
                    messages={messages}
                    onSendFollowUp={handleSendFollowUp}
                    isTyping={isTyping}
                />
            )}
        </div>
    )
}

export default ChatPage
