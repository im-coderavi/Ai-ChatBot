import './TypingIndicator.css'

function TypingIndicator() {
    return (
        <div className="typing-indicator animate-fadeIn">
            <div className="typing-avatar">🚚</div>
            <div className="typing-dots">
                <span className="typing-dot"></span>
                <span className="typing-dot"></span>
                <span className="typing-dot"></span>
            </div>
        </div>
    )
}

export default TypingIndicator
