const { ModelFallbackService } = require('../gemini/model-fallback.service');
const { ConversationStateService } = require('./conversation-state.service');
const { Logger } = require('../logger.service');
const fs = require('fs');
const path = require('path');

/**
 * Conversation Manager Service
 * 
 * Core business logic orchestrating the AI Hiring Agent interview flow.
 * Enforces the 4-phase workflow from systemprompt.md:
 *   Phase 1: Introduction (get name, set expectations)
 *   Phase 2: Mandatory Screening (8 disqualifying checks)
 *   Phase 3: Preferred Scoring (3 scored areas + veteran bonus)
 *   Phase 4: Wrap-Up (decision, score, next steps)
 *
 * Uses Gemini 2.5 Pro → 2.5 Flash → 2.0 Flash fallback chain.
 * Integrates knowledgebase.md for factual answers.
 */
class ConversationManager {
    constructor() {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            throw new Error('GEMINI_API_KEY environment variable is required');
        }

        this.modelFallback = new ModelFallbackService(apiKey);
        this.stateService = new ConversationStateService();
        this.logger = new Logger('ConversationManager');

        // Load system prompt and knowledgebase
        this.systemPrompt = this._loadFile('system-prompt.md');
        this.knowledgebase = this._loadFile('knowledgebase.md');

        this.logger.info(`System prompt loaded: ${this.systemPrompt ? this.systemPrompt.length : 0} chars`);
        this.logger.info(`Knowledgebase loaded: ${this.knowledgebase ? this.knowledgebase.length : 0} chars`);

        if (!this.systemPrompt) {
            this.logger.warn('⚠️ System prompt not found! AI recruiter will have limited behavior.');
        }
        if (!this.knowledgebase) {
            this.logger.warn('⚠️ Knowledgebase not found! AI will not have company-specific facts.');
        }
    }

    /**
     * Load a file from multiple possible locations:
     * 1. server/prompts/ directory
     * 2. Project root directory (with various casing)
     */
    _loadFile(filename) {
        const searchPaths = [
            // Prompts directory (relative to this file: services/conversation/ → ../../prompts)
            path.join(__dirname, '..', '..', 'prompts', filename),
            // Project root (relative to this file: services/conversation/ → ../../../)
            path.join(__dirname, '..', '..', '..', filename),
            // Try capitalized version at root
            path.join(__dirname, '..', '..', '..', filename.charAt(0).toUpperCase() + filename.slice(1)),
        ];

        // Also try Knowledgebase.md specifically
        if (filename.toLowerCase().includes('knowledge')) {
            searchPaths.push(path.join(__dirname, '..', '..', '..', 'Knowledgebase.md'));
            searchPaths.push(path.join(__dirname, '..', '..', '..', 'knowledgebase.md'));
        }

        for (const filePath of searchPaths) {
            try {
                if (fs.existsSync(filePath)) {
                    const content = fs.readFileSync(filePath, 'utf-8');
                    this.logger.info(`✅ Loaded ${filename} from: ${filePath}`);
                    return content;
                }
            } catch (err) {
                this.logger.debug(`Could not load from ${filePath}: ${err.message}`);
            }
        }

        this.logger.error(`❌ Failed to find ${filename} in any location`);
        return '';
    }

    /**
     * Start a new conversation - sends the opening greeting
     */
    async startConversation(jobId = 'fedex-driver-001') {
        const state = await this.stateService.createState(jobId);

        // Opening message from systemprompt.md conversation start template
        const openingMessage =
            `Hi there! 👋 I'm an AI assistant helping Tsavo West Inc with applications ` +
            `for the FedEx Ground Delivery Driver position here in Tampa, Florida.\n\n` +
            `This should only take about 5-10 minutes. I'll ask you some questions to see ` +
            `if the role is a good fit, and then I'll give you immediate feedback on your application.\n\n` +
            `Ready to get started? First, what's your name?`;

        // Save the opening message to the transcript
        await this.stateService.addToTranscript(state.conversationId, [{
            role: 'agent',
            message: openingMessage,
            timestamp: new Date()
        }]);

        this.logger.info(`🆕 Conversation started: ${state.conversationId} (Phase: introduction)`);

        return {
            conversationId: state.conversationId,
            firstMessage: openingMessage
        };
    }

    /**
     * Process a candidate's message through the AI pipeline
     * 
     * Flow:
     * 1. Load conversation state from DB
     * 2. Build full prompt (system prompt + knowledgebase + state + workflow rules)
     * 3. Send to Gemini via fallback chain
     * 4. Parse structured JSON response
     * 5. Update state (qualifications, phase, score)
     * 6. Save transcript
     */
    async processCandidateMessage(conversationId, userMessage) {
        const startTime = Date.now();

        try {
            // 1. Load conversation state
            const state = await this.stateService.getState(conversationId);

            // Handle follow-up questions after conversation is complete
            if (state.status !== 'in_progress') {
                return await this._handleFollowUpQuestion(conversationId, userMessage, state);
            }

            // 2. Build conversation history for Gemini chat format
            const history = this._buildConversationHistory(state);

            // 3. Build the full prompt with workflow enforcement
            const prompt = this._buildPrompt(userMessage, state);

            // 4. Generate response through fallback chain (2.5 Pro → 2.5 Flash → 2.0 Flash)
            this.logger.info(`📤 Sending to Gemini | Conv: ${conversationId} | Phase: ${state.currentPhase}`);

            const response = await this.modelFallback.generateResponse({
                prompt,
                conversationHistory: history
            });

            this.logger.info(
                `📥 Got response | Model: ${response.modelUsed} | ` +
                `Tokens: ${response.tokensUsed} | Duration: ${response.totalDuration}ms | ` +
                `Fallbacks: ${response.fallbacksUsed}`
            );

            // 5. Parse the AI response
            const parsed = this._parseAIResponse(response.text);

            // 6. Build state updates
            const updates = {
                aiModelUsed: response.modelUsed,
                processingTime: Date.now() - startTime
            };

            // Update candidate name
            if (parsed.candidateName) {
                updates['personalInfo.name'] = parsed.candidateName;
            }

            // Update qualifications from AI assessment
            if (parsed.qualificationUpdate) {
                if (parsed.qualificationUpdate.mandatory) {
                    for (const [key, val] of Object.entries(parsed.qualificationUpdate.mandatory)) {
                        if (val && typeof val === 'object') {
                            for (const [field, value] of Object.entries(val)) {
                                updates[`qualifications.mandatory.${key}.${field}`] = value;
                            }
                        }
                    }
                }
                if (parsed.qualificationUpdate.preferred) {
                    for (const [key, val] of Object.entries(parsed.qualificationUpdate.preferred)) {
                        if (val && typeof val === 'object') {
                            for (const [field, value] of Object.entries(val)) {
                                updates[`qualifications.preferred.${key}.${field}`] = value;
                            }
                        }
                    }
                }
            }

            // Update phase
            if (parsed.nextPhase) {
                updates.currentPhase = parsed.nextPhase;
            }

            // Update overall score
            if (parsed.overallScore !== undefined && parsed.overallScore !== null) {
                updates.overallScore = parsed.overallScore;
            }

            if (parsed.conversationComplete) {
                if (parsed.finalStatus === 'disqualified') {
                    updates.status = 'disqualified';
                    updates.disqualificationReason = parsed.disqualificationReason || 'Did not meet mandatory requirements';
                } else {
                    updates.status = parsed.finalStatus || 'qualified';
                }
                updates.currentPhase = 'completed';
            }

            // Update personal info (name & email)
            if (parsed.candidateName) {
                updates['personalInfo.name'] = parsed.candidateName;
            }
            if (parsed.candidateEmail) {
                updates['personalInfo.email'] = parsed.candidateEmail;
            }

            // 7. Save state updates
            await this.stateService.updateState(conversationId, updates);

            // 8. Save transcript (candidate message + agent response)
            await this.stateService.addToTranscript(conversationId, [
                { role: 'candidate', message: userMessage, timestamp: new Date() },
                { role: 'agent', message: parsed.agentMessage, timestamp: new Date() }
            ]);

            this.logger.info(
                `✅ Processed | Conv: ${conversationId} | Phase: ${parsed.nextPhase || state.currentPhase} | ` +
                `Complete: ${parsed.conversationComplete} | Status: ${parsed.conversationComplete ? parsed.finalStatus : 'in_progress'}`
            );

            return {
                agentResponse: parsed.agentMessage,
                qualificationUpdate: parsed.qualificationUpdate,
                conversationComplete: parsed.conversationComplete || false,
                status: parsed.conversationComplete ? (parsed.finalStatus || 'qualified') : 'in_progress'
            };

        } catch (error) {
            this.logger.error(`❌ Failed to process message for ${conversationId}: ${error.message}`);

            // Save the candidate's message even on error
            try {
                await this.stateService.addToTranscript(conversationId, [
                    { role: 'candidate', message: userMessage, timestamp: new Date() }
                ]);
            } catch (e) {
                // Ignore transcript save errors
            }

            return {
                agentResponse:
                    "I apologize, but I'm experiencing a brief technical issue. " +
                    "Please wait a moment and try sending your message again. " +
                    "Your progress has been saved!",
                qualificationUpdate: null,
                conversationComplete: false,
                status: 'in_progress'
            };
        }
    }

    /**
     * Build conversation history in Gemini chat format
     * 
     * IMPORTANT: Gemini requires history to start with role 'user' and alternate.
     * The opening agent greeting is NOT included in history (it's part of the
     * system prompt context). We only include exchanges after the first user message.
     */
    _buildConversationHistory(state) {
        const history = [];
        const transcript = state.transcript || [];

        // Skip leading agent messages (like the opening greeting)
        // Find the first user/candidate message
        let startIdx = 0;
        for (let i = 0; i < transcript.length; i++) {
            if (transcript[i].role === 'candidate') {
                startIdx = i;
                break;
            }
        }

        // If no candidate messages yet, return empty history
        if (transcript.length === 0 || !transcript.some(e => e.role === 'candidate')) {
            return [];
        }

        // Build history from the first candidate message onward
        // Ensure proper user/model alternation
        for (let i = startIdx; i < transcript.length; i++) {
            const entry = transcript[i];
            const role = entry.role === 'agent' ? 'model' : 'user';

            // Ensure alternation: skip consecutive same-role entries
            if (history.length > 0 && history[history.length - 1].role === role) {
                // Merge with previous entry of same role
                history[history.length - 1].parts[0].text += '\n' + entry.message;
            } else {
                history.push({
                    role,
                    parts: [{ text: entry.message }]
                });
            }
        }

        // Gemini requires history to end with 'model' if there are entries
        // and the current turn is a new 'user' message (which we send as prompt)
        // Remove the last entry if it's 'user' since the new message is the current user turn
        if (history.length > 0 && history[history.length - 1].role === 'user') {
            history.pop();
        }

        return history;
    }

    /**
     * Build the complete prompt for Gemini
     * 
     * This is the CORE of the AI recruiter - it enforces:
     * - The full system prompt behavior
     * - Knowledgebase facts for answers
     * - Current conversation state and phase tracking
     * - Strict 4-phase workflow logic
     * - Proper JSON response format
     */
    _buildPrompt(userMessage, state) {
        // Determine which mandatory qualifications are still pending
        const mandatoryStatus = state.qualifications?.mandatory || {};
        const pendingMandatory = [];
        const completedMandatory = [];
        const failedMandatory = [];

        const mandatoryOrder = [
            'age', 'validLicense', 'drivingRecord', 'backgroundCheck',
            'drugScreening', 'liftingCapability', 'weekendAvailability', 'longShiftFlexibility'
        ];

        for (const key of mandatoryOrder) {
            const qual = mandatoryStatus[key];
            if (!qual || qual.status === 'pending') {
                pendingMandatory.push(key);
            } else if (qual.status === 'qualified') {
                completedMandatory.push(key);
            } else if (qual.status === 'disqualified') {
                failedMandatory.push(key);
            }
        }

        // Determine preferred qualifications status
        const preferredStatus = state.qualifications?.preferred || {};
        const pendingPreferred = [];
        const completedPreferred = [];

        for (const key of ['deliveryExperience', 'timeManagement', 'independence']) {
            const qual = preferredStatus[key];
            if (!qual || qual.score === 0) {
                pendingPreferred.push(key);
            } else {
                completedPreferred.push(key);
            }
        }

        // Check veteran status
        const veteranChecked = preferredStatus.militaryVeteran?.isVeteran !== undefined &&
            preferredStatus.militaryVeteran?.isVeteran !== false;

        return `
${this.systemPrompt || ''}

======================================================================
COMPANY KNOWLEDGE BASE - USE FOR ALL FACTUAL ANSWERS
======================================================================
${this.knowledgebase || ''}

======================================================================
CURRENT CONVERSATION STATE (CRITICAL - READ CAREFULLY)
======================================================================
Conversation ID: ${state.conversationId}
Current Phase: ${state.currentPhase}
Candidate Name: ${state.personalInfo?.name || 'NOT YET PROVIDED'}
Candidate Email: ${state.personalInfo?.email || 'NOT YET PROVIDED'}
Status: ${state.status}

--- MANDATORY QUALIFICATIONS PROGRESS ---
${mandatoryOrder.map(key => {
            const qual = mandatoryStatus[key];
            const status = qual?.status || 'pending';
            const icon = status === 'qualified' ? '✅' : status === 'disqualified' ? '❌' : '⬜';
            return `${icon} ${key}: ${status}${qual?.rawAnswer ? ` (answered: "${qual.rawAnswer}")` : ''}`;
        }).join('\n')}

Completed: ${completedMandatory.length}/8 | Pending: ${pendingMandatory.length} | Failed: ${failedMandatory.length}
Next mandatory to ask: ${pendingMandatory[0] || 'ALL DONE'}

--- PREFERRED QUALIFICATIONS PROGRESS ---
${['deliveryExperience', 'timeManagement', 'independence'].map(key => {
            const qual = preferredStatus[key];
            const score = qual?.score || 0;
            const maxScore = key === 'deliveryExperience' ? 20 : 15;
            return `${score > 0 ? '✅' : '⬜'} ${key}: ${score}/${maxScore} pts${qual?.rawAnswer ? ` (answered: "${qual.rawAnswer}")` : ''}`;
        }).join('\n')}
${'⬜'} militaryVeteran: ${veteranChecked ? '✅ checked' : 'NOT YET ASKED'} (bonus: +5 pts if veteran)

--- CURRENT SCORE ---
Mandatory base: ${failedMandatory.length > 0 ? '0 (DISQUALIFIED)' : completedMandatory.length === 8 ? '50' : 'TBD'} / 50
Preferred: ${(preferredStatus.deliveryExperience?.score || 0) + (preferredStatus.timeManagement?.score || 0) + (preferredStatus.independence?.score || 0)} / 50
Veteran bonus: ${preferredStatus.militaryVeteran?.bonusPoints || 0} / 5
Current total: ${state.overallScore || 0} / 105

======================================================================
CANDIDATE'S LATEST MESSAGE
======================================================================
${userMessage}

======================================================================
WORKFLOW RULES (YOU MUST FOLLOW THESE EXACTLY)
======================================================================

PHASE LOGIC:
PHASE LOGIC:
1. "introduction" phase: 
   - First, get the candidate's NAME.
   - Once you have the name, ask for their EMAIL ADDRESS.
   - Only move to "mandatory_screening" once you have BOTH name and email.
2. "mandatory_screening" phase: Ask about EACH mandatory qualification ONE AT A TIME in this order:
   age → validLicense → drivingRecord → backgroundCheck → drugScreening → liftingCapability → weekendAvailability → longShiftFlexibility
   
   IMPORTANT: 
   - Ask ONLY ONE question per response
   - If ANY mandatory fails → IMMEDIATELY disqualify (set conversationComplete:true, finalStatus:"disqualified")
   - Do NOT skip ahead - ask them IN ORDER
   - Next to ask: ${pendingMandatory[0] || 'NONE - all done, move to preferred_scoring'}
   
3. "preferred_scoring" phase: Only enter this phase when ALL 8 mandatory qualifications are QUALIFIED.
   Ask about: deliveryExperience → timeManagement → independence → militaryVeteran status
   Score each based on the rubric in the system prompt.
   
4. "wrap_up" phase: Calculate final score and deliver the evaluation report.
   - All mandatory met = 50 base points
   - Add preferred scores (up to 50 pts)
   - Add veteran bonus (+5 if applicable)
   - Provide the CANDIDATE EVALUATION REPORT format from the system prompt
   - Set conversationComplete:true, finalStatus:"qualified"

ANSWERING CANDIDATE QUESTIONS:
- If the candidate asks about pay: "$18-20/hour based on experience, plus stop and safety bonuses. Weekly pay every Friday. Training is $15/hour for 1-2 weeks."
- If the candidate asks about schedule: "4-day work week with 10-hour shifts starting at 7:30 AM. One weekend day required. Overtime available 1-2 days/week."
- If the candidate asks about benefits: "Comprehensive health insurance, Aflac supplemental (dental, vision, disability, accident, critical illness). 5 days PTO after 90 days."
- If the candidate asks about location: "Terminal at 6708 Harney Road, Tampa, FL 33610. Local Tampa area deliveries, about 150 miles daily."
- If the candidate asks about CDL: "No CDL required! Just a valid driver's license with clean record."
- ALWAYS answer their question FIRST, then continue with the next qualification question.

======================================================================
RESPONSE FORMAT (YOU MUST RETURN ONLY THIS JSON)
======================================================================
Respond with ONLY a valid JSON object. No markdown code blocks. No extra text. Just raw JSON:

{
  "agentMessage": "Your conversational response. Be warm, professional. ONE question at a time. 1-3 sentences max.",
  "candidateName": "Their name if just provided, otherwise null",
  "candidateEmail": "Their email if just provided, otherwise null",
  "qualificationUpdate": {
    "mandatory": {
      "FIELD_NAME": { "status": "qualified|disqualified", "value": "extracted value", "rawAnswer": "what they said" }
    },
    "preferred": {
      "FIELD_NAME": { "score": NUMBER, "details": "why this score", "rawAnswer": "what they said" }
    }
  },
  "nextPhase": "introduction|mandatory_screening|preferred_scoring|wrap_up",
  "overallScore": null,
  "conversationComplete": false,
  "finalStatus": null,
  "disqualificationReason": null
}

RULES FOR THE JSON:
- Only include fields in qualificationUpdate that were ASSESSED in THIS exchange
- Set conversationComplete:true ONLY when interview is fully done OR candidate is disqualified
- For disqualification: set finalStatus:"disqualified" and provide disqualificationReason
- For qualification: calculate overallScore (50 mandatory + preferred scores + veteran bonus)
- agentMessage must be conversational, NOT robotic. Follow the tone in the system prompt.
- NEVER return anything outside the JSON object
`;
    }

    /**
     * Parse AI response - handles raw JSON, markdown-wrapped JSON, and fallback to raw text
     */
    _parseAIResponse(responseText) {
        try {
            let jsonStr = responseText.trim();

            // Strip markdown code blocks: ```json ... ``` or ``` ... ```
            const codeBlockMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
            if (codeBlockMatch) {
                jsonStr = codeBlockMatch[1].trim();
            }

            // Find the JSON object in the response
            const objectMatch = jsonStr.match(/\{[\s\S]*\}/);
            if (objectMatch) {
                jsonStr = objectMatch[0];
            }

            const parsed = JSON.parse(jsonStr);

            // Validate required field
            if (!parsed.agentMessage) {
                this.logger.warn('Parsed JSON missing agentMessage, using raw text');
                return this._fallbackResponse(responseText);
            }

            return {
                agentMessage: parsed.agentMessage,
                candidateName: parsed.candidateName || null,
                qualificationUpdate: parsed.qualificationUpdate || null,
                nextPhase: parsed.nextPhase || null,
                overallScore: parsed.overallScore,
                conversationComplete: parsed.conversationComplete || false,
                finalStatus: parsed.finalStatus || null,
                disqualificationReason: parsed.disqualificationReason || null
            };
        } catch (error) {
            this.logger.warn(`JSON parse failed: ${error.message}`);
            this.logger.warn(`Raw response (first 300 chars): ${responseText.substring(0, 300)}`);
            return this._fallbackResponse(responseText);
        }
    }

    /**
     * Fallback when JSON parsing fails - use raw text as the agent message
     */
    _fallbackResponse(rawText) {
        // Try to clean up the text - remove any JSON artifacts
        let cleanText = rawText.trim();
        // If text starts with { and contains agentMessage, try to extract just that
        const messageMatch = cleanText.match(/"agentMessage"\s*:\s*"([^"]*(?:\\.[^"]*)*)"/);
        if (messageMatch) {
            cleanText = messageMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
        }

        return {
            agentMessage: cleanText,
            candidateName: null,
            qualificationUpdate: null,
            nextPhase: null,
            overallScore: undefined,
            conversationComplete: false,
            finalStatus: null,
            disqualificationReason: null
        };
    }

    /**
     * Handle follow-up questions after conversation is already complete.
     * Uses Gemini with the knowledge base to answer candidate questions.
     */
    async _handleFollowUpQuestion(conversationId, userMessage, state) {
        try {
            const prompt = `
You are an AI Hiring Agent for Tsavo West Inc. The interview for this candidate is already complete.
Their status: ${state.status}
Their score: ${state.overallScore || 'N/A'}

KNOWLEDGE BASE:
${this.knowledgebase || ''}

The candidate is asking a follow-up question after their interview. Answer their question using ONLY information from the knowledge base above. Be friendly, professional, and concise (1-3 sentences).
If they ask about something not in the knowledge base, politely say you don't have that information and suggest they contact the hiring team.

Candidate's question: ${userMessage}

Respond with ONLY a valid JSON object:
{
  "agentMessage": "Your helpful answer here"
}
`;

            const response = await this.modelFallback.generateResponse({
                prompt,
                conversationHistory: []
            });

            const parsed = this._parseAIResponse(response.text);

            // Save follow-up exchange to transcript
            await this.stateService.addToTranscript(conversationId, [
                { role: 'candidate', message: userMessage, timestamp: new Date() },
                { role: 'agent', message: parsed.agentMessage, timestamp: new Date() }
            ]);

            return {
                agentResponse: parsed.agentMessage,
                qualificationUpdate: null,
                conversationComplete: true,
                status: state.status,
                isFollowUp: true
            };
        } catch (error) {
            this.logger.error(`Follow-up question error: ${error.message}`);
            return {
                agentResponse: "I'm sorry, I had trouble processing your question. Feel free to ask again or contact the hiring team directly.",
                qualificationUpdate: null,
                conversationComplete: true,
                status: state.status,
                isFollowUp: true
            };
        }
    }

    /**
     * Get conversation result with structured breakdown for the enhanced UI
     */
    async getResult(conversationId) {
        const state = await this.stateService.getState(conversationId);
        const mandatory = state.qualifications?.mandatory || {};
        const preferred = state.qualifications?.preferred || {};

        // Job title mapping
        const jobTitles = {
            'fedex-driver-001': 'FedEx Ground ISP Delivery Driver (Non-CDL)'
        };

        // Build mandatory breakdown array
        const mandatoryLabels = {
            age: 'Age (21+)',
            validLicense: 'Valid Driver\'s License',
            drivingRecord: 'Clean Driving Record',
            backgroundCheck: 'Background Check Willingness',
            drugScreening: 'Drug Screening Willingness',
            liftingCapability: 'Lifting Capability (150 lbs)',
            weekendAvailability: 'Weekend Availability',
            longShiftFlexibility: 'Long Shift Flexibility (10-12 hrs)'
        };

        const mandatoryOrder = [
            'age', 'validLicense', 'drivingRecord', 'backgroundCheck',
            'drugScreening', 'liftingCapability', 'weekendAvailability', 'longShiftFlexibility'
        ];

        const mandatoryBreakdown = mandatoryOrder.map(key => {
            const qual = mandatory[key] || {};
            return {
                key,
                label: mandatoryLabels[key] || key,
                status: qual.status || 'pending',
                value: qual.value || qual.state || qual.details || (qual.willing !== null && qual.willing !== undefined ? (qual.willing ? 'Yes' : 'No') : null) || (qual.canLift !== null && qual.canLift !== undefined ? (qual.canLift ? 'Yes' : 'No') : null) || (qual.available !== null && qual.available !== undefined ? (qual.available ? 'Yes' : 'No') : null) || (qual.canWork !== null && qual.canWork !== undefined ? (qual.canWork ? 'Yes' : 'No') : null) || null,
                rawAnswer: qual.rawAnswer || null
            };
        });

        // Build preferred breakdown array
        const preferredLabels = {
            deliveryExperience: { label: 'Prior Delivery/Courier Experience', maxScore: 20 },
            timeManagement: { label: 'Time Management Skills', maxScore: 15 },
            independence: { label: 'Ability to Work Independently', maxScore: 15 }
        };

        const preferredBreakdown = ['deliveryExperience', 'timeManagement', 'independence'].map(key => {
            const qual = preferred[key] || {};
            const meta = preferredLabels[key];
            return {
                key,
                label: meta.label,
                score: qual.score || 0,
                maxScore: meta.maxScore,
                details: qual.details || null,
                rawAnswer: qual.rawAnswer || null
            };
        });

        // Veteran bonus
        const veteranBonus = {
            isVeteran: preferred.militaryVeteran?.isVeteran || false,
            bonusPoints: preferred.militaryVeteran?.bonusPoints || 0
        };

        // Early disqualification detection
        const disqualifiedItem = mandatoryBreakdown.find(m => m.status === 'disqualified');
        const earlyDisqualification = state.status === 'disqualified' && disqualifiedItem ? {
            isEarly: true,
            failedRequirement: disqualifiedItem.label,
            failedKey: disqualifiedItem.key,
            reason: state.disqualificationReason
        } : null;

        // Generate recruiter summary
        const candidateName = state.personalInfo?.name || 'Unknown';
        const passedCount = mandatoryBreakdown.filter(m => m.status === 'qualified').length;
        const totalPreferred = preferredBreakdown.reduce((sum, p) => sum + p.score, 0) + veteranBonus.bonusPoints;

        let recruiterSummary;
        if (state.status === 'disqualified') {
            recruiterSummary = `${candidateName} was disqualified during screening. Reason: ${state.disqualificationReason || 'Did not meet mandatory requirements'}. Passed ${passedCount}/8 mandatory checks before disqualification.`;
        } else if (state.status === 'qualified') {
            const strengths = [];
            if (preferredBreakdown[0].score >= 15) strengths.push('strong delivery experience');
            if (preferredBreakdown[1].score >= 10) strengths.push('good time management');
            if (preferredBreakdown[2].score >= 10) strengths.push('comfortable working independently');
            if (veteranBonus.isVeteran) strengths.push('military veteran');
            recruiterSummary = `${candidateName} passed all mandatory requirements with a score of ${state.overallScore || 0}/100. ${strengths.length > 0 ? 'Key strengths: ' + strengths.join(', ') + '.' : ''} Recommended for in-person interview.`;
        } else {
            recruiterSummary = `${candidateName}'s interview is still in progress (Phase: ${state.currentPhase}).`;
        }

        return {
            conversationId: state.conversationId,
            jobId: state.jobId,
            jobTitle: jobTitles[state.jobId] || state.jobId,
            candidateName,
            status: state.status,
            currentPhase: state.currentPhase,
            matchScore: state.overallScore || 0,
            mandatoryBreakdown,
            preferredBreakdown,
            veteranBonus,
            earlyDisqualification,
            recruiterSummary,
            disqualificationReason: state.disqualificationReason,
            transcript: state.transcript,
            aiModelUsed: state.aiModelUsed,
            processingTime: state.processingTime,
            createdAt: state.createdAt,
            updatedAt: state.updatedAt
        };
    }
}

module.exports = { ConversationManager };
