const { Logger } = require('./logger.service');

/**
 * Metrics Service
 * In-memory metrics tracking for Gemini model usage and fallback stats
 */
class MetricsService {
    constructor() {
        this.logger = new Logger('MetricsService');
        this.metrics = new Map();
        this.fallbackStats = {
            totalRequests: 0,
            successfulFallbacks: 0,
            completeFallbackFailures: 0
        };
    }

    recordModelUsage(modelName, duration, tokens, success) {
        const current = this.metrics.get(modelName) || {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            totalTokens: 0,
            totalDuration: 0,
            averageDuration: 0
        };

        current.totalRequests++;
        if (success) {
            current.successfulRequests++;
            current.totalTokens += tokens;
        } else {
            current.failedRequests++;
        }
        current.totalDuration += duration;
        current.averageDuration = Math.round(current.totalDuration / current.totalRequests);

        this.metrics.set(modelName, current);
    }

    recordFallbackSuccess(modelName, fallbacksUsed, totalDuration) {
        this.fallbackStats.totalRequests++;
        if (fallbacksUsed > 0) {
            this.fallbackStats.successfulFallbacks++;
        }
        this.logger.info(
            `Fallback success: ${modelName}, fallbacks: ${fallbacksUsed}, duration: ${totalDuration}ms`
        );
    }

    recordModelFailure(modelName, error) {
        this.logger.error(`Model failure: ${modelName}`, error?.message);
    }

    recordCompleteFallbackFailure(totalDuration) {
        this.fallbackStats.completeFallbackFailures++;
        this.logger.critical(`CRITICAL: All models failed after ${totalDuration}ms`);
    }

    getMetrics() {
        const result = {};
        this.metrics.forEach((value, key) => {
            result[key] = { ...value };
        });
        return { models: result, fallback: { ...this.fallbackStats } };
    }

    resetMetrics() {
        this.metrics.clear();
        this.fallbackStats = {
            totalRequests: 0,
            successfulFallbacks: 0,
            completeFallbackFailures: 0
        };
        this.logger.info('Metrics reset');
    }
}

// Singleton instance
const metricsInstance = new MetricsService();

module.exports = { MetricsService, metricsInstance };
