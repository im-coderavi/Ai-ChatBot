import './WelcomeScreen.css'

function WelcomeScreen({ onStart }) {
    return (
        <div className="welcome-screen animate-fadeIn">
            <div className="welcome-card glass-card">
                <div className="welcome-animation-container">
                    <div className="road-container">
                        <div className="road-line"></div>
                        <div className="truck-icon">🚚</div>
                        <div className="wind-effect">💨</div>
                    </div>
                </div>
                <h1 className="welcome-title">
                    FedEx Ground<br />
                    <span className="welcome-title-accent">Delivery Driver</span>
                </h1>
                <p className="welcome-subtitle">Tsavo West Inc — Tampa, FL</p>

                <div className="welcome-features">
                    <div className="welcome-feature">
                        <span className="feature-icon">💰</span>
                        <span>$18-$20/hr + Bonuses</span>
                    </div>
                    <div className="welcome-feature">
                        <span className="feature-icon">📅</span>
                        <span>4-Day Work Weeks</span>
                    </div>
                    <div className="welcome-feature">
                        <span className="feature-icon">🏥</span>
                        <span>Health Insurance</span>
                    </div>
                    <div className="welcome-feature">
                        <span className="feature-icon">⏱️</span>
                        <span>5-10 Min Interview</span>
                    </div>
                </div>

                <p className="welcome-desc">
                    Chat with our AI hiring assistant to quickly check if you're a good fit
                    for the position. Get instant feedback on your application!
                </p>

                <button className="btn btn-primary welcome-btn" onClick={onStart}>
                    <span>Start Application</span>
                    <span className="btn-arrow">→</span>
                </button>

                <p className="welcome-note">
                    No resume needed. Just answer a few questions!
                </p>

                <div className="welcome-credits">
                    Made by <a href="https://coderavi.in" target="_blank" rel="noopener noreferrer">Avishek Giri</a>
                </div>
            </div>
        </div>
    )
}

export default WelcomeScreen
