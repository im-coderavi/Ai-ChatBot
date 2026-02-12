const { GeminiClientService } = require('./gemini-client.service');
const { RetryHandler } = require('./retry-handler.service');
const { GEMINI_MODELS } = require('../../config/gemini-models.config');
const { Logger } = require('../logger.service');
const { metricsInstance } = require('../metrics.service');

/**
 * Model Fallback Service
 * Orchestrates Gemini 2.5 Pro → 2.5 Flash → 2.0 Flash fallback chain
 * 
 * Fallback Logic:
 * 1. Try gemini-2.5-pro-preview-06-05 (best quality, 60s timeout, 2 retries)
 * 2. On failure → gemini-2.5-flash-preview-05-20 (fast + capable, 30s timeout, 2 retries)
 * 3. On failure → gemini-2.0-flash (reliable fallback, 20s timeout, 3 retries)
 * 4. All fail → throw error with details
 */
class ModelFallbackService {
    constructor(apiKey) {
        this.geminiClient = new GeminiClientService(apiKey);
        this.retryHandler = new RetryHandler();
        this.logger = new Logger('ModelFallback');
        this.metrics = metricsInstance;
    }

    /**
     * Generate response with automatic fallback across models
     * Flow: 2.5 Pro → 2.5 Flash → 2.0 Flash
     */
    async generateResponse({ prompt, conversationHistory = [], preferredModel = null }) {
        const startTime = Date.now();
        let attemptsMade = 0;
        let fallbacksUsed = 0;
        let lastError = null;

        // Determine model order (sorted by priority: 1=Pro, 2=Flash, 3=Flash2.0)
        let models;
        if (preferredModel) {
            const found = GEMINI_MODELS.find(m => m.name === preferredModel);
            models = found ? [found] : GEMINI_MODELS;
        } else {
            models = [...GEMINI_MODELS].sort((a, b) => a.priority - b.priority);
        }

        // Check if fallback is disabled (env var override)
        const enableFallback = process.env.GEMINI_ENABLE_FALLBACK !== 'false';
        if (!enableFallback) {
            models = [models[0]]; // Only use primary model
            this.logger.info('Fallback disabled - using primary model only');
        }

        this.logger.info(`🔗 Fallback chain: ${models.map(m => m.name).join(' → ')}`);

        // Try each model in order
        for (let i = 0; i < models.length; i++) {
            const modelConfig = models[i];
            try {
                this.logger.info(
                    `🎯 Attempting model ${i + 1}/${models.length}: ${modelConfig.name} (Priority ${modelConfig.priority})`
                );

                const result = await this._tryModelWithRetry(
                    modelConfig,
                    prompt,
                    conversationHistory
                );

                attemptsMade += result.attemptsMade;
                const totalDuration = Date.now() - startTime;

                this.logger.info(
                    `✅ Success with ${modelConfig.name} ` +
                    `(${attemptsMade} total attempts, ${fallbacksUsed} fallbacks, ${totalDuration}ms)`
                );

                this.metrics.recordFallbackSuccess(modelConfig.name, fallbacksUsed, totalDuration);

                return {
                    ...result.response,
                    attemptsMade,
                    fallbacksUsed,
                    totalDuration
                };
            } catch (error) {
                lastError = error;
                fallbacksUsed++;

                this.logger.error(
                    `❌ Model ${modelConfig.name} failed after all retries: ${error.message}`
                );

                this.metrics.recordModelFailure(modelConfig.name, error);

                if (i < models.length - 1) {
                    this.logger.info(`⬇️ Falling back to next model: ${models[i + 1].name}`);
                }
                continue;
            }
        }

        // All models failed
        const totalDuration = Date.now() - startTime;
        this.logger.critical(
            `🚨 ALL MODELS FAILED after ${attemptsMade} attempts and ${fallbacksUsed} fallbacks (${totalDuration}ms)`
        );
        this.metrics.recordCompleteFallbackFailure(totalDuration);

        throw new Error(
            `All Gemini models failed. Last error: ${lastError?.message || 'Unknown'}. ` +
            `Chain: ${models.map(m => m.name).join(' → ')}`
        );
    }

    /**
     * Try a specific model with retry logic (exponential backoff + jitter)
     */
    async _tryModelWithRetry(modelConfig, prompt, conversationHistory) {
        let attemptsMade = 0;

        const retryConfig = {
            maxRetries: modelConfig.maxRetries,
            baseDelay: 1000,
            maxDelay: 30000,
            exponentialBase: 2,
            jitter: true
        };

        const response = await this.retryHandler.executeWithRetry(
            async () => {
                attemptsMade++;

                // Race between API call and timeout
                return Promise.race([
                    this.geminiClient.generateWithModel(
                        modelConfig.name,
                        prompt,
                        conversationHistory
                    ),
                    this._createTimeoutPromise(modelConfig.timeout, modelConfig.name)
                ]);
            },
            retryConfig,
            `Gemini ${modelConfig.name}`
        );

        return { response, attemptsMade };
    }

    /**
     * Create a promise that rejects after timeout
     */
    _createTimeoutPromise(timeout, modelName) {
        return new Promise((_, reject) => {
            setTimeout(() => {
                reject(new Error(`Model ${modelName} timed out after ${timeout}ms`));
            }, timeout);
        });
    }
}

module.exports = { ModelFallbackService };
