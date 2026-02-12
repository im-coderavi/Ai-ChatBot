/**
 * Gemini Model Configuration
 * Fallback chain: Gemini 3 Pro → 2.5 Flash → 2.0 Flash
 * Model names verified via ListModels API
 */

const GEMINI_MODELS = [
    {
        name: 'gemini-3-pro-preview',
        priority: 1,
        maxRetries: 2,
        timeout: 60000,
        costPerRequest: 0.003,
        capabilities: 'full',
        rateLimit: {
            requestsPerMinute: 60,
            tokensPerMinute: 32000
        }
    },
    {
        name: 'gemini-2.5-flash',
        priority: 2,
        maxRetries: 2,
        timeout: 30000,
        costPerRequest: 0.0005,
        capabilities: 'standard',
        rateLimit: {
            requestsPerMinute: 100,
            tokensPerMinute: 64000
        }
    },
    {
        name: 'gemini-2.0-flash',
        priority: 3,
        maxRetries: 3,
        timeout: 20000,
        costPerRequest: 0.0001,
        capabilities: 'basic',
        rateLimit: {
            requestsPerMinute: 150,
            tokensPerMinute: 128000
        }
    }
];

const GEMINI_SAFETY_SETTINGS = [
    { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' }
];

const GENERATION_CONFIG = {
    temperature: 0.7,
    topK: 40,
    topP: 0.95,
    maxOutputTokens: 4096
};

module.exports = { GEMINI_MODELS, GEMINI_SAFETY_SETTINGS, GENERATION_CONFIG };
