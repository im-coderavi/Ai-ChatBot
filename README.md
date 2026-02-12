# 🚚 AI Hiring Assistant (FedEx Ground Driver Recruitment)

**Made By Avishek Giri** | [Portfolio](https://coderavi.in)

This is an intelligent, conversational AI Hiring Agent designed to automate the initial screening and interview process for FedEx Ground Delivery Driver candidates. It engages candidates in a natural, 10-minute chat to assess mandatory requirements and score preferred qualifications, providing instant feedback.

---

## 🌟 Key Features

### 🤖 Intelligent Conversational AI
- **Natural Language Processing**: Uses Google Gemini 2.5 Pro (with fallback to Flash models) to understand context and intent.
- **4-Phase Interview Flow**:
  1.  **Introduction**: Welcomes candidate and collects contact info.
  2.  **Mandatory Screening**: Checks "Knock-out" criteria (Age, License, Clean Record, etc.).
  3.  **Preferred Scoring**: Evaluates soft skills (Experience, Independence) on a 0-100 scale.
  4.  **Wrap-Up**: Delivers an immediate "Qualified" or "Disqualified" decision with reasoning.
- **Early Disqualification**: Instantly ends the interview politely if a mandatory requirement is failed.

### 💻 Modern Frontend
- **Real-time Chat Interface**: WhatsApp-style UI with typing indicators and smooth message animations.
- **Animated Welcome Screen**: Features a custom CSS animation of a delivery truck driving on a road.
- **Responsive Design**: Fully optimized for mobile and desktop devices.

### 📊 Recruiter Dashboard
- **Candidate Management**: View all applications, filter by status (Qualified/Disqualified).
- **Detailed Transcripts**: Read full conversation histories.
- **Automated Summaries**: "Recruiter-Friendly" summaries highlighting key strengths or disqualification reasons.

---

## 🚀 Workflow Logic

The AI follows a strict state machine to ensure a consistent and compliant interview process.

```mermaid
graph TD
    A[Start Application] --> B[Introduction Phase]
    B --> C{Got Name & Email?}
    C -- No --> B
    C -- Yes --> D[Mandatory Screening]
    
    D --> E{Ask Next Requirement}
    E --> F[Analyze Response]
    
    F -- Requirement Failed --> G[Disqualification Flow]
    G --> H[End Interview (Status: Disqualified)]
    
    F -- Requirement Met --> I{All Mandatory Met?}
    I -- No --> E
    I -- Yes --> J[Preferred Scoring Phase]
    
    J --> K{Ask Soft Skill Qs}
    K --> L[Score Response (0-20 pts)]
    L --> M{All Scored?}
    M -- No --> K
    M -- Yes --> N[Wrap-Up Phase]
    
    N --> O[Calculate Final Score]
    O --> P[End Interview (Status: Qualified)]
```

---

## 📂 File Architecture

A high-level overview of the project structure to help developers navigate the codebase.

```text
ai-hiring-bot/
├── client/                     # Frontend (React + Vite)
│   ├── src/
│   │   ├── components/         # UI Components
│   │   │   ├── ChatInput.jsx   # User input field
│   │   │   ├── ChatMessage.jsx # Message bubbles
│   │   │   ├── WelcomeScreen.jsx # Animated landing page
│   │   │   └── ...
│   │   ├── pages/              # Main Pages
│   │   │   ├── ChatPage.jsx    # The interview interface
│   │   │   └── AdminDashboard.jsx # Recruiter panel
│   │   ├── services/           # Frontend API & Socket services
│   │   └── App.jsx             # Main Router
│   └── package.json
│
├── server/                     # Backend (Node + Express)
│   ├── models/                 # Mongoose Schemas
│   │   ├── Candidate.js        # Stores interview state & transcript
│   │   └── Job.js              # Stores job criteria (Dynamic Jobs)
│   ├── routes/                 # API Endpoints
│   │   ├── chat.routes.js      # Chat logic endpoints
│   │   └── admin.routes.js     # Dashboard data endpoints
│   ├── services/               # Business Logic
│   │   ├── conversation/       # Core AI Engine
│   │   │   ├── conversation-manager.service.js # Orchestrates the flow
│   │   │   └── conversation-state.service.js   # Manages DB state
│   │   └── gemini/             # AI Model Integration
│   ├── prompts/                # System Prompts
│   │   ├── system-prompt.md    # The AI's brain/instructions
│   │   └── knowledgebase.md    # Company facts & FAQs
│   └── server.js               # Entry point
│
└── README.md                   # Project Documentation
```

---

## 🚀 Future Roadmap & Upgrades

We are constantly evolving to make this the ultimate hiring tool. Here is what's coming next:

### Phase 1: Flexibility (In Progress)
- **Dynamic Multi-Job Support**: Currently optimized for FedEx. We are upgrading the system to load *any* job description from the database, allowing the AI to interview for Warehouse, Office, or Sales roles instantly.

### Phase 2: Automation & integration
- **📧 Automated Email Notifications**:
    - **Candidates**: Receive a "Thank You" email with next steps immediately after qualifying.
    - **Recruiters**: Get an instant alert for "High Match" candidates (Score > 90).
- **📅 Calendar Integration**: Qualified candidates can book their in-person interview directly within the chat interface (integrating with Calendly/Google Calendar).

### Phase 3: Advanced AI
- **🗣️ Voice Interface**: Candidates can speak their answers instead of typing (Speech-to-Text).
- **🧠 Resume Analysis**: Users can upload a resume, and the AI will auto-fill qualifications before asking questions.
- **🌍 Multi-Language Support**: Auto-detect language (Spanish/Hindi) and conduct the interview in the candidate's preferred language.

---

## 🏃‍♂️ Getting Started

### Prerequisites
- Node.js (v18+)
- MongoDB (Local or Atlas)
- Google Gemini API Key

### Installation

1.  **Clone the Repository**
    ```bash
    git clone https://github.com/im-coderavi/ai-hiring-bot.git
    cd ai-hiring-bot
    ```

2.  **Setup Backend**
    ```bash
    cd server
    npm install
    # Create .env file with PORT, MONGODB_URI, GEMINI_API_KEY
    npm run dev
    ```

3.  **Setup Frontend**
    ```bash
    cd client
    npm install
    npm run dev
    ```

4.  **Access App**
    - Client: `http://localhost:5173`
    - Admin Dashboard: `http://localhost:5173/admin`

---

## 👨‍💻 Developer & Credits

**Designed & Developed by [Avishek Giri](https://coderavi.in)**

This project showcases the potential of Agentic AI in automating complex human resources workflows while maintaining a high-quality candidate experience.
