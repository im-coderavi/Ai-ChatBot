const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');
const { GENERATION_CONFIG } = require('../../config/gemini-models.config');
const { Logger } = require('../logger.service');
const { metricsInstance } = require('../metrics.service');

/**
 * Gemini Client Service
 * Wraps @google/generative-ai SDK for chat-based interactions
 * Compatible with Gemini 2.5 Pro, 2.5 Flash, and 2.0 Flash models
 */
class GeminiClientService {
    constructor(apiKey) {
        this.genAI = new GoogleGenerativeAI(apiKey);
        this.logger = new Logger('GeminiClient');
        this.metrics = metricsInstance;
        this.modelCache = new Map();
    }

    /**
     * Build safety settings using proper SDK enums
     */
    _getSafetySettings() {
        return [
            {
                category: HarmCategory.HARM_CATEGORY_HARASSMENT,
                threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE
            },
            {
                category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
                threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE
            },
            {
                category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
                threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE
            },
            {
                category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
                threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE
            }
        ];
    }

    /**
     * Get or create a generative model instance
     */
    _getModel(modelName) {
        if (!this.modelCache.has(modelName)) {
            this.logger.info(`Initializing model: ${modelName}`);
            const model = this.genAI.getGenerativeModel({
                model: modelName,
                safetySettings: this._getSafetySettings(),
                generationConfig: GENERATION_CONFIG
            });
            this.modelCache.set(modelName, model);
        }
        return this.modelCache.get(modelName);
    }

    /**
     * Generate content with a specific model using chat interface
     * Supports Gemini 2.5 Pro, 2.5 Flash, and 2.0 Flash
     */
    async generateWithModel(modelName, prompt, conversationHistory = []) {
        const startTime = Date.now();
        const model = this._getModel(modelName);

        try {
            this.logger.info(`Sending to ${modelName} | Prompt length: ${prompt.length} chars | History: ${conversationHistory.length} entries`);

            // Build the chat with history
            const chat = model.startChat({
                history: conversationHistory,
                generationConfig: GENERATION_CONFIG,
                safetySettings: this._getSafetySettings()
            });

            // Send the message
            const result = await chat.sendMessage(prompt);
            const response = await result.response;
            const text = response.text();

            // Extract metadata
            const tokensUsed = this._estimateTokenCount(prompt + text);
            const finishReason = response.candidates?.[0]?.finishReason || 'STOP';

            // Log metrics
            const duration = Date.now() - startTime;
            this.metrics.recordModelUsage(modelName, duration, tokensUsed, true);
            this.logger.info(`✅ Model ${modelName} responded in ${duration}ms (${tokensUsed} est. tokens, finish: ${finishReason})`);

            return {
                text,
                modelUsed: modelName,
                tokensUsed,
                finishReason
            };
        } catch (error) {
            const duration = Date.now() - startTime;
            this.metrics.recordModelUsage(modelName, duration, 0, false);
            this.logger.error(`❌ Model ${modelName} failed after ${duration}ms: ${error.message}`);

            // Log more details for debugging
            if (error.message?.includes('API_KEY')) {
                this.logger.error('API key issue detected - check GEMINI_API_KEY environment variable');
            }
            if (error.message?.includes('not found') || error.message?.includes('not supported')) {
                this.logger.error(`Model ${modelName} may not be available - will fallback to next model`);
            }

            throw error;
        }
    }

    /**
     * Rough token count estimate (~4 chars per token for English)
     */
    _estimateTokenCount(text) {
        return Math.ceil(text.length / 4);
    }
}

module.exports = { GeminiClientService };
