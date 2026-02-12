import './ChatMessage.css'

function ChatMessage({ message, index }) {
    const isAgent = message.role === 'agent'

    return (
        <div
            className={`chat-msg ${isAgent ? 'chat-msg-agent' : 'chat-msg-user'} ${message.isError ? 'chat-msg-error' : ''}`}
            style={{ animationDelay: `${index * 0.05}s` }}
        >
            {isAgent && (
                <div className="msg-avatar">🚚</div>
            )}
            <div className={`msg-bubble ${isAgent ? 'msg-bubble-agent' : 'msg-bubble-user'}`}>
                <p className="msg-text">{message.text}</p>
                <span className="msg-time">
                    {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
            </div>
        </div>
    )
}

export default ChatMessage
