const { Logger } = require('../logger.service');

/**
 * Retry Handler
 * Exponential backoff retry logic with jitter and retryable error detection
 */
class RetryHandler {
    constructor() {
        this.logger = new Logger('RetryHandler');
    }

    /**
     * Execute a function with exponential backoff retry logic
     */
    async executeWithRetry(fn, config, context = 'operation') {
        let lastError = null;
        const totalAttempts = config.maxRetries + 1;

        for (let attempt = 1; attempt <= totalAttempts; attempt++) {
            try {
                this.logger.debug(`${context} - Attempt ${attempt}/${totalAttempts}`);
                const result = await fn();

                if (attempt > 1) {
                    this.logger.info(`${context} succeeded on attempt ${attempt}`);
                }

                return result;
            } catch (error) {
                lastError = error;

                // Check if error is retryable
                if (!this._isRetryableError(error)) {
                    this.logger.warn(`${context} - Non-retryable error: ${error.message}`);
                    throw error;
                }

                // If this was the last attempt, break
                if (attempt >= totalAttempts) {
                    this.logger.error(`${context} - All ${totalAttempts} attempts failed`);
                    break;
                }

                // Calculate delay with exponential backoff
                const delay = this._calculateDelay(attempt, config);
                this.logger.warn(
                    `${context} - Attempt ${attempt} failed: ${error.message}. Retrying in ${delay}ms...`
                );

                await this._sleep(delay);
            }
        }

        throw new Error(
            `${context} failed after ${totalAttempts} attempts: ${lastError?.message}`
        );
    }

    /**
     * Determine if an error should trigger a retry
     */
    _isRetryableError(error) {
        // Retryable HTTP status codes
        const retryableStatusCodes = [408, 429, 500, 502, 503, 504];

        if (error.status && retryableStatusCodes.includes(error.status)) {
            return true;
        }

        // Network errors
        if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
            return true;
        }

        // Gemini-specific retryable errors
        const retryableMessages = [
            'rate limit',
            'quota exceeded',
            'temporarily unavailable',
            'internal error',
            'timeout',
            'service unavailable',
            'resource exhausted',
            'deadline exceeded'
        ];

        const errorMessage = (error.message || '').toLowerCase();
        return retryableMessages.some(msg => errorMessage.includes(msg));
    }

    /**
     * Calculate delay with exponential backoff and optional jitter
     */
    _calculateDelay(attempt, config) {
        const baseDelay = config.baseDelay || 1000;
        const maxDelay = config.maxDelay || 30000;
        const base = config.exponentialBase || 2;

        const exponentialDelay = baseDelay * Math.pow(base, attempt - 1);
        let delay = Math.min(exponentialDelay, maxDelay);

        // Add jitter to prevent thundering herd (±30%)
        if (config.jitter !== false) {
            const jitterAmount = delay * 0.3;
            delay = delay + (Math.random() * 2 - 1) * jitterAmount;
        }

        return Math.round(Math.max(delay, 0));
    }

    /**
     * Sleep for specified milliseconds
     */
    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = { RetryHandler };
