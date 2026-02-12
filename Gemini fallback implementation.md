# Gemini API Multi-Model Fallback Implementation Guide
# Dynamic Model Selection with Exponential Backoff Retry Logic

## Overview

This guide provides a production-ready implementation of Google Gemini API integration with automatic fallback across multiple models when failures occur. The system gracefully degrades from Gemini 1.5 Pro → Flash → Flash 8B with intelligent retry logic.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Request Entry Point                   │
│              (API Endpoint or WebSocket)                 │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│              AI Orchestration Service                    │
│  ┌───────────────────────────────────────────────────┐  │
│  │         Gemini Request Manager                    │  │
│  │  - Model selection logic                          │  │
│  │  - Retry coordination                             │  │
│  │  - Error classification                           │  │
│  └───────────────────────────────────────────────────┘  │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│               Model Fallback Chain                       │
│                                                          │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Priority 1: Gemini 1.5 Pro                     │   │
│  │  - Max retries: 2                               │   │
│  │  - Timeout: 30s                                 │   │
│  └─────────────────────────────────────────────────┘   │
│                     │ (on failure)                      │
│                     ▼                                   │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Priority 2: Gemini 1.5 Flash                   │   │
│  │  - Max retries: 2                               │   │
│  │  - Timeout: 20s                                 │   │
│  └─────────────────────────────────────────────────┘   │
│                     │ (on failure)                      │
│                     ▼                                   │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Priority 3: Gemini 1.5 Flash 8B                │   │
│  │  - Max retries: 3                               │   │
│  │  - Timeout: 15s                                 │   │
│  └─────────────────────────────────────────────────┘   │
│                     │ (on failure)                      │
│                     ▼                                   │
│                 ALL MODELS FAILED                       │
│              Return graceful error                      │
└─────────────────────────────────────────────────────────┘
```

---

## Model Configuration

### Model Specifications

```typescript
// config/gemini-models.config.ts

export interface GeminiModelConfig {
  name: string;
  priority: number;
  maxRetries: number;
  timeout: number; // milliseconds
  costPerRequest: number; // USD
  capabilities: 'full' | 'standard' | 'basic';
  rateLimit: {
    requestsPerMinute: number;
    tokensPerMinute: number;
  };
}

export const GEMINI_MODELS: GeminiModelConfig[] = [
  {
    name: 'gemini-1.5-pro-latest',
    priority: 1,
    maxRetries: 2,
    timeout: 30000,
    costPerRequest: 0.00125, // $1.25 per 1M input tokens (estimated)
    capabilities: 'full',
    rateLimit: {
      requestsPerMinute: 60,
      tokensPerMinute: 32000
    }
  },
  {
    name: 'gemini-1.5-flash-latest',
    priority: 2,
    maxRetries: 2,
    timeout: 20000,
    costPerRequest: 0.000075, // $0.075 per 1M input tokens (estimated)
    capabilities: 'standard',
    rateLimit: {
      requestsPerMinute: 100,
      tokensPerMinute: 64000
    }
  },
  {
    name: 'gemini-1.5-flash-8b-latest',
    priority: 3,
    maxRetries: 3,
    timeout: 15000,
    costPerRequest: 0.0000375, // $0.0375 per 1M input tokens (estimated)
    capabilities: 'basic',
    rateLimit: {
      requestsPerMinute: 150,
      tokensPerMinute: 128000
    }
  }
];

export const GEMINI_SAFETY_SETTINGS = [
  {
    category: 'HARM_CATEGORY_HARASSMENT',
    threshold: 'BLOCK_MEDIUM_AND_ABOVE'
  },
  {
    category: 'HARM_CATEGORY_HATE_SPEECH',
    threshold: 'BLOCK_MEDIUM_AND_ABOVE'
  },
  {
    category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
    threshold: 'BLOCK_MEDIUM_AND_ABOVE'
  },
  {
    category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
    threshold: 'BLOCK_MEDIUM_AND_ABOVE'
  }
];

export const GENERATION_CONFIG = {
  temperature: 0.7,
  topK: 40,
  topP: 0.95,
  maxOutputTokens: 2048,
  stopSequences: []
};
```

---

## Core Implementation

### 1. Gemini Client Wrapper

```typescript
// services/gemini/gemini-client.service.ts

import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { GEMINI_MODELS, GEMINI_SAFETY_SETTINGS, GENERATION_CONFIG } from '../../config/gemini-models.config';
import { Logger } from '../logger/logger.service';
import { MetricsService } from '../metrics/metrics.service';

export class GeminiClientService {
  private genAI: GoogleGenerativeAI;
  private logger: Logger;
  private metrics: MetricsService;
  private modelCache: Map<string, GenerativeModel> = new Map();

  constructor(apiKey: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.logger = new Logger('GeminiClientService');
    this.metrics = new MetricsService();
  }

  /**
   * Get or create a generative model instance
   */
  private getModel(modelName: string): GenerativeModel {
    if (!this.modelCache.has(modelName)) {
      this.logger.info(`Initializing model: ${modelName}`);
      const model = this.genAI.getGenerativeModel({
        model: modelName,
        safetySettings: GEMINI_SAFETY_SETTINGS,
        generationConfig: GENERATION_CONFIG
      });
      this.modelCache.set(modelName, model);
    }
    return this.modelCache.get(modelName)!;
  }

  /**
   * Generate content with a specific model
   */
  async generateWithModel(
    modelName: string,
    prompt: string,
    conversationHistory: any[] = []
  ): Promise<{
    text: string;
    modelUsed: string;
    tokensUsed: number;
    finishReason: string;
  }> {
    const startTime = Date.now();
    const model = this.getModel(modelName);

    try {
      // Build the conversation context
      const chat = model.startChat({
        history: conversationHistory,
        generationConfig: GENERATION_CONFIG,
        safetySettings: GEMINI_SAFETY_SETTINGS
      });

      // Send the message
      const result = await chat.sendMessage(prompt);
      const response = await result.response;
      const text = response.text();

      // Extract metadata
      const tokensUsed = this.estimateTokenCount(prompt + text);
      const finishReason = response.candidates?.[0]?.finishReason || 'STOP';

      // Log metrics
      const duration = Date.now() - startTime;
      this.metrics.recordModelUsage(modelName, duration, tokensUsed, true);

      this.logger.info(`Model ${modelName} succeeded in ${duration}ms`);

      return {
        text,
        modelUsed: modelName,
        tokensUsed,
        finishReason
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.metrics.recordModelUsage(modelName, duration, 0, false);
      
      this.logger.error(`Model ${modelName} failed:`, error);
      throw error;
    }
  }

  /**
   * Estimate token count (rough approximation)
   */
  private estimateTokenCount(text: string): number {
    // Rough estimate: ~4 characters per token for English
    return Math.ceil(text.length / 4);
  }
}
```

### 2. Retry Logic with Exponential Backoff

```typescript
// services/gemini/retry-handler.service.ts

import { Logger } from '../logger/logger.service';

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number; // milliseconds
  maxDelay: number; // milliseconds
  exponentialBase: number;
  jitter: boolean;
}

export class RetryHandler {
  private logger: Logger;

  constructor() {
    this.logger = new Logger('RetryHandler');
  }

  /**
   * Execute a function with exponential backoff retry logic
   */
  async executeWithRetry<T>(
    fn: () => Promise<T>,
    config: RetryConfig,
    context: string = 'operation'
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= config.maxRetries + 1; attempt++) {
      try {
        this.logger.debug(`${context} - Attempt ${attempt}/${config.maxRetries + 1}`);
        const result = await fn();
        
        if (attempt > 1) {
          this.logger.info(`${context} succeeded on attempt ${attempt}`);
        }
        
        return result;
      } catch (error) {
        lastError = error as Error;
        
        // Check if error is retryable
        if (!this.isRetryableError(error)) {
          this.logger.warn(`${context} - Non-retryable error encountered`);
          throw error;
        }

        // If this was the last attempt, throw
        if (attempt >= config.maxRetries + 1) {
          this.logger.error(`${context} - All ${config.maxRetries + 1} attempts failed`);
          break;
        }

        // Calculate delay with exponential backoff
        const delay = this.calculateDelay(attempt, config);
        
        this.logger.warn(
          `${context} - Attempt ${attempt} failed. Retrying in ${delay}ms...`,
          error
        );

        await this.sleep(delay);
      }
    }

    // All retries exhausted
    throw new Error(
      `${context} failed after ${config.maxRetries + 1} attempts: ${lastError?.message}`
    );
  }

  /**
   * Determine if an error should trigger a retry
   */
  private isRetryableError(error: any): boolean {
    // Retryable HTTP status codes
    const retryableStatusCodes = [408, 429, 500, 502, 503, 504];
    
    if (error.status && retryableStatusCodes.includes(error.status)) {
      return true;
    }

    // Network errors
    if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
      return true;
    }

    // Gemini-specific retryable errors
    const retryableMessages = [
      'rate limit',
      'quota exceeded',
      'temporarily unavailable',
      'internal error',
      'timeout',
      'service unavailable'
    ];

    const errorMessage = error.message?.toLowerCase() || '';
    return retryableMessages.some(msg => errorMessage.includes(msg));
  }

  /**
   * Calculate delay with exponential backoff and optional jitter
   */
  private calculateDelay(attempt: number, config: RetryConfig): number {
    const exponentialDelay = 
      config.baseDelay * Math.pow(config.exponentialBase, attempt - 1);
    
    let delay = Math.min(exponentialDelay, config.maxDelay);

    // Add jitter to prevent thundering herd
    if (config.jitter) {
      const jitterAmount = delay * 0.3; // ±30% jitter
      delay = delay + (Math.random() * 2 - 1) * jitterAmount;
    }

    return Math.round(delay);
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

### 3. Model Fallback Orchestrator

```typescript
// services/gemini/model-fallback.service.ts

import { GeminiClientService } from './gemini-client.service';
import { RetryHandler, RetryConfig } from './retry-handler.service';
import { GEMINI_MODELS, GeminiModelConfig } from '../../config/gemini-models.config';
import { Logger } from '../logger/logger.service';
import { MetricsService } from '../metrics/metrics.service';

export interface GenerateRequest {
  prompt: string;
  conversationHistory?: any[];
  preferredModel?: string; // Optional: force a specific model
}

export interface GenerateResponse {
  text: string;
  modelUsed: string;
  tokensUsed: number;
  finishReason: string;
  attemptsMade: number;
  fallbacksUsed: number;
  totalDuration: number;
}

export class ModelFallbackService {
  private geminiClient: GeminiClientService;
  private retryHandler: RetryHandler;
  private logger: Logger;
  private metrics: MetricsService;

  constructor(apiKey: string) {
    this.geminiClient = new GeminiClientService(apiKey);
    this.retryHandler = new RetryHandler();
    this.logger = new Logger('ModelFallbackService');
    this.metrics = new MetricsService();
  }

  /**
   * Generate response with automatic fallback across models
   */
  async generateResponse(request: GenerateRequest): Promise<GenerateResponse> {
    const startTime = Date.now();
    let attemptsMade = 0;
    let fallbacksUsed = 0;
    let lastError: Error | null = null;

    // Determine model order
    const models = request.preferredModel
      ? [GEMINI_MODELS.find(m => m.name === request.preferredModel)!]
      : GEMINI_MODELS.slice().sort((a, b) => a.priority - b.priority);

    this.logger.info(`Starting generation with ${models.length} model(s) in fallback chain`);

    // Try each model in order
    for (const modelConfig of models) {
      try {
        this.logger.info(
          `Attempting with model: ${modelConfig.name} (Priority ${modelConfig.priority})`
        );

        const result = await this.tryModelWithRetry(
          modelConfig,
          request.prompt,
          request.conversationHistory || []
        );

        attemptsMade += result.attemptsMade;
        const totalDuration = Date.now() - startTime;

        this.logger.info(
          `Successfully generated response using ${modelConfig.name} ` +
          `(${attemptsMade} total attempts, ${fallbacksUsed} fallbacks, ${totalDuration}ms)`
        );

        // Record success metrics
        this.metrics.recordFallbackSuccess(modelConfig.name, fallbacksUsed, totalDuration);

        return {
          ...result.response,
          attemptsMade,
          fallbacksUsed,
          totalDuration
        };
      } catch (error) {
        lastError = error as Error;
        fallbacksUsed++;
        
        this.logger.error(
          `Model ${modelConfig.name} exhausted all retries. ` +
          `Moving to next model in chain...`,
          error
        );

        // Record failure
        this.metrics.recordModelFailure(modelConfig.name, error);

        // Continue to next model
        continue;
      }
    }

    // All models failed
    const totalDuration = Date.now() - startTime;
    this.logger.error(
      `ALL MODELS FAILED after ${attemptsMade} total attempts ` +
      `and ${fallbacksUsed} fallbacks (${totalDuration}ms)`
    );

    this.metrics.recordCompleteFallbackFailure(totalDuration);

    throw new Error(
      `All Gemini models failed to generate a response. ` +
      `Last error: ${lastError?.message || 'Unknown error'}`
    );
  }

  /**
   * Try a specific model with retry logic
   */
  private async tryModelWithRetry(
    modelConfig: GeminiModelConfig,
    prompt: string,
    conversationHistory: any[]
  ): Promise<{
    response: {
      text: string;
      modelUsed: string;
      tokensUsed: number;
      finishReason: string;
    };
    attemptsMade: number;
  }> {
    let attemptsMade = 0;

    const retryConfig: RetryConfig = {
      maxRetries: modelConfig.maxRetries,
      baseDelay: 1000, // 1 second
      maxDelay: 30000, // 30 seconds
      exponentialBase: 2,
      jitter: true
    };

    const response = await this.retryHandler.executeWithRetry(
      async () => {
        attemptsMade++;
        
        // Create a promise that will timeout
        return Promise.race([
          this.geminiClient.generateWithModel(
            modelConfig.name,
            prompt,
            conversationHistory
          ),
          this.createTimeoutPromise(modelConfig.timeout, modelConfig.name)
        ]);
      },
      retryConfig,
      `Gemini ${modelConfig.name}`
    );

    return { response, attemptsMade };
  }

  /**
   * Create a promise that rejects after a timeout
   */
  private createTimeoutPromise(timeout: number, modelName: string): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Model ${modelName} timed out after ${timeout}ms`));
      }, timeout);
    });
  }
}
```

### 4. Conversation Manager (Business Logic Integration)

```typescript
// services/conversation/conversation-manager.service.ts

import { ModelFallbackService } from '../gemini/model-fallback.service';
import { Logger } from '../logger/logger.service';
import { ConversationStateService } from './conversation-state.service';

export interface ConversationMessage {
  role: 'user' | 'model';
  parts: Array<{ text: string }>;
}

export class ConversationManager {
  private modelFallback: ModelFallbackService;
  private stateService: ConversationStateService;
  private logger: Logger;
  private systemPrompt: string;

  constructor(apiKey: string, systemPrompt: string) {
    this.modelFallback = new ModelFallbackService(apiKey);
    this.stateService = new ConversationStateService();
    this.logger = new Logger('ConversationManager');
    this.systemPrompt = systemPrompt;
  }

  /**
   * Process a candidate's message and generate AI response
   */
  async processCandidateMessage(
    conversationId: string,
    userMessage: string
  ): Promise<{
    agentResponse: string;
    qualificationUpdate: any;
    conversationComplete: boolean;
  }> {
    try {
      // Load conversation state
      const state = await this.stateService.getState(conversationId);
      
      // Build conversation history for Gemini
      const history = this.buildConversationHistory(state);

      // Create the prompt
      const prompt = this.buildPrompt(userMessage, state);

      // Generate response with fallback
      const response = await this.modelFallback.generateResponse({
        prompt,
        conversationHistory: history
      });

      this.logger.info(
        `Generated response for conversation ${conversationId} ` +
        `using ${response.modelUsed} (${response.tokensUsed} tokens, ` +
        `${response.totalDuration}ms, ${response.fallbacksUsed} fallbacks)`
      );

      // Parse the response and update state
      const parsed = this.parseAIResponse(response.text);
      
      // Update conversation state
      await this.stateService.updateState(conversationId, {
        transcript: [
          ...state.transcript,
          { role: 'candidate', message: userMessage, timestamp: new Date() },
          { role: 'agent', message: parsed.agentMessage, timestamp: new Date() }
        ],
        qualifications: parsed.qualificationUpdate,
        aiModelUsed: response.modelUsed,
        currentPhase: parsed.nextPhase
      });

      return {
        agentResponse: parsed.agentMessage,
        qualificationUpdate: parsed.qualificationUpdate,
        conversationComplete: parsed.conversationComplete
      };
    } catch (error) {
      this.logger.error(`Failed to process message for ${conversationId}:`, error);
      
      // Return graceful error message
      return {
        agentResponse: 
          "I apologize, but I'm experiencing technical difficulties. " +
          "Please try again in a moment. Your progress has been saved.",
        qualificationUpdate: null,
        conversationComplete: false
      };
    }
  }

  /**
   * Build conversation history in Gemini format
   */
  private buildConversationHistory(state: any): ConversationMessage[] {
    const history: ConversationMessage[] = [];

    for (const entry of state.transcript) {
      history.push({
        role: entry.role === 'agent' ? 'model' : 'user',
        parts: [{ text: entry.message }]
      });
    }

    return history;
  }

  /**
   * Build the prompt with system instructions and context
   */
  private buildPrompt(userMessage: string, state: any): string {
    return `
${this.systemPrompt}

CURRENT CONVERSATION STATE:
${JSON.stringify(state.qualifications, null, 2)}

CANDIDATE'S LATEST MESSAGE:
${userMessage}

INSTRUCTIONS:
Respond naturally as the AI hiring agent. Update qualification status as needed.
Provide your response in the following JSON format:

{
  "agentMessage": "Your conversational response here",
  "qualificationUpdate": {
    // Updated qualification object
  },
  "nextPhase": "mandatory_screening" | "preferred_scoring" | "wrap_up",
  "conversationComplete": false
}
`;
  }

  /**
   * Parse AI response and extract structured data
   */
  private parseAIResponse(responseText: string): {
    agentMessage: string;
    qualificationUpdate: any;
    nextPhase: string;
    conversationComplete: boolean;
  } {
    try {
      // Extract JSON from response (handle markdown code blocks)
      const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/) || 
                       responseText.match(/\{[\s\S]*\}/);
      
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const jsonStr = jsonMatch[1] || jsonMatch[0];
      const parsed = JSON.parse(jsonStr);

      return {
        agentMessage: parsed.agentMessage,
        qualificationUpdate: parsed.qualificationUpdate,
        nextPhase: parsed.nextPhase || 'mandatory_screening',
        conversationComplete: parsed.conversationComplete || false
      };
    } catch (error) {
      this.logger.error('Failed to parse AI response:', error);
      
      // Fallback: use entire response as message
      return {
        agentMessage: responseText,
        qualificationUpdate: null,
        nextPhase: 'mandatory_screening',
        conversationComplete: false
      };
    }
  }
}
```

---

## Environment Configuration

```typescript
// config/environment.ts

import * as dotenv from 'dotenv';

dotenv.config();

export const config = {
  // Gemini API Configuration
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    enableFallback: process.env.GEMINI_ENABLE_FALLBACK !== 'false', // Default: true
    preferredModel: process.env.GEMINI_PREFERRED_MODEL, // Optional
  },

  // Application Configuration
  app: {
    port: parseInt(process.env.PORT || '3000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
  },

  // Database Configuration
  database: {
    mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/hiring-agent',
    redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  },

  // Security
  security: {
    jwtSecret: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
    jwtExpiry: '30m',
  },

  // Monitoring
  monitoring: {
    enableMetrics: process.env.ENABLE_METRICS !== 'false',
    sentryDsn: process.env.SENTRY_DSN,
  },
};

// Validate required configuration
export function validateConfig(): void {
  const required = ['GEMINI_API_KEY', 'MONGO_URI'];
  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`
    );
  }
}
```

### .env.example

```bash
# Gemini API Configuration
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_ENABLE_FALLBACK=true
GEMINI_PREFERRED_MODEL=gemini-1.5-pro-latest # Optional: force a specific model

# Application
PORT=3000
NODE_ENV=development

# Database
MONGO_URI=mongodb://localhost:27017/hiring-agent
REDIS_URL=redis://localhost:6379

# Security
JWT_SECRET=your-super-secret-jwt-key-change-this

# Monitoring
ENABLE_METRICS=true
SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id
```

---

## Usage Examples

### Basic Usage in Express Route

```typescript
// routes/chat.routes.ts

import { Router, Request, Response } from 'express';
import { ConversationManager } from '../services/conversation/conversation-manager.service';
import { config } from '../config/environment';
import { readFileSync } from 'fs';
import { join } from 'path';

const router = Router();

// Load system prompt
const systemPrompt = readFileSync(
  join(__dirname, '../prompts/system-prompt.md'),
  'utf-8'
);

// Initialize conversation manager
const conversationManager = new ConversationManager(
  config.gemini.apiKey,
  systemPrompt
);

/**
 * POST /api/v1/chat/message
 * Send a message in an ongoing conversation
 */
router.post('/message', async (req: Request, res: Response) => {
  try {
    const { conversationId, message } = req.body;

    if (!conversationId || !message) {
      return res.status(400).json({
        error: 'conversationId and message are required'
      });
    }

    const result = await conversationManager.processCandidateMessage(
      conversationId,
      message
    );

    res.json({
      success: true,
      response: result.agentResponse,
      qualificationStatus: result.qualificationUpdate,
      conversationComplete: result.conversationComplete
    });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({
      error: 'Failed to process message',
      message: error.message
    });
  }
});

export default router;
```

### WebSocket Integration

```typescript
// websocket/chat.handler.ts

import { Server as SocketIOServer, Socket } from 'socket.io';
import { ConversationManager } from '../services/conversation/conversation-manager.service';
import { config } from '../config/environment';
import { readFileSync } from 'fs';
import { join } from 'path';

const systemPrompt = readFileSync(
  join(__dirname, '../prompts/system-prompt.md'),
  'utf-8'
);

const conversationManager = new ConversationManager(
  config.gemini.apiKey,
  systemPrompt
);

export function setupChatWebSocket(io: SocketIOServer): void {
  io.on('connection', (socket: Socket) => {
    console.log(`Client connected: ${socket.id}`);

    // Handle incoming messages
    socket.on('message', async (data: {
      conversationId: string;
      message: string;
    }) => {
      try {
        // Emit typing indicator
        socket.emit('typing', { isTyping: true });

        const result = await conversationManager.processCandidateMessage(
          data.conversationId,
          data.message
        );

        // Emit response
        socket.emit('response', {
          message: result.agentResponse,
          qualificationUpdate: result.qualificationUpdate,
          conversationComplete: result.conversationComplete
        });

        socket.emit('typing', { isTyping: false });
      } catch (error) {
        socket.emit('error', {
          code: 'AI_ERROR',
          message: 'Temporary service issue. Please try again.'
        });

        socket.emit('typing', { isTyping: false });
      }
    });

    socket.on('disconnect', () => {
      console.log(`Client disconnected: ${socket.id}`);
    });
  });
}
```

---

## Metrics and Monitoring

```typescript
// services/metrics/metrics.service.ts

import { Logger } from '../logger/logger.service';

interface ModelMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  totalTokens: number;
  totalDuration: number;
  averageDuration: number;
}

export class MetricsService {
  private logger: Logger;
  private metrics: Map<string, ModelMetrics> = new Map();

  constructor() {
    this.logger = new Logger('MetricsService');
  }

  /**
   * Record model usage
   */
  recordModelUsage(
    modelName: string,
    duration: number,
    tokens: number,
    success: boolean
  ): void {
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
    current.averageDuration = current.totalDuration / current.totalRequests;

    this.metrics.set(modelName, current);
  }

  /**
   * Record fallback success
   */
  recordFallbackSuccess(
    modelName: string,
    fallbacksUsed: number,
    totalDuration: number
  ): void {
    this.logger.info(
      `Fallback success: ${modelName}, ` +
      `fallbacks: ${fallbacksUsed}, duration: ${totalDuration}ms`
    );

    // Send to external monitoring service (e.g., Datadog, New Relic)
    // this.externalMonitoring.track('fallback_success', { ... });
  }

  /**
   * Record model failure
   */
  recordModelFailure(modelName: string, error: any): void {
    this.logger.error(`Model failure: ${modelName}`, error);

    // Send to error tracking service (e.g., Sentry)
    // this.errorTracking.captureException(error, { modelName });
  }

  /**
   * Record complete fallback chain failure
   */
  recordCompleteFallbackFailure(totalDuration: number): void {
    this.logger.critical(
      `CRITICAL: All models failed after ${totalDuration}ms`
    );

    // Alert on-call engineer
    // this.alerting.sendCriticalAlert('All Gemini models failed');
  }

  /**
   * Get current metrics
   */
  getMetrics(): Record<string, ModelMetrics> {
    const result: Record<string, ModelMetrics> = {};
    this.metrics.forEach((value, key) => {
      result[key] = { ...value };
    });
    return result;
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics.clear();
    this.logger.info('Metrics reset');
  }
}
```

---

## Testing

### Unit Test Example

```typescript
// __tests__/services/gemini/model-fallback.service.test.ts

import { ModelFallbackService } from '../../../services/gemini/model-fallback.service';

describe('ModelFallbackService', () => {
  let service: ModelFallbackService;

  beforeEach(() => {
    service = new ModelFallbackService(process.env.GEMINI_API_KEY_TEST || '');
  });

  describe('generateResponse', () => {
    it('should successfully generate with primary model', async () => {
      const result = await service.generateResponse({
        prompt: 'Say hello'
      });

      expect(result.text).toBeDefined();
      expect(result.modelUsed).toBe('gemini-1.5-pro-latest');
      expect(result.fallbacksUsed).toBe(0);
    });

    it('should fallback to Flash when Pro fails', async () => {
      // Mock Pro to fail
      jest.spyOn(service['geminiClient'], 'generateWithModel')
        .mockImplementationOnce(() => {
          throw new Error('Rate limit exceeded');
        })
        .mockImplementationOnce(async () => ({
          text: 'Fallback response',
          modelUsed: 'gemini-1.5-flash-latest',
          tokensUsed: 10,
          finishReason: 'STOP'
        }));

      const result = await service.generateResponse({
        prompt: 'Test prompt'
      });

      expect(result.modelUsed).toBe('gemini-1.5-flash-latest');
      expect(result.fallbacksUsed).toBe(1);
    });

    it('should throw when all models fail', async () => {
      // Mock all models to fail
      jest.spyOn(service['geminiClient'], 'generateWithModel')
        .mockRejectedValue(new Error('All models unavailable'));

      await expect(
        service.generateResponse({ prompt: 'Test' })
      ).rejects.toThrow('All Gemini models failed');
    });
  });
});
```

---

## Production Deployment Checklist

- [ ] Environment variables properly configured
- [ ] API keys secured (use secrets manager)
- [ ] Monitoring and alerting configured
- [ ] Error tracking integrated (Sentry)
- [ ] Load testing completed
- [ ] Fallback chain tested under failure scenarios
- [ ] Rate limits configured appropriately
- [ ] Logging levels set for production
- [ ] Metrics dashboard created
- [ ] Cost monitoring alerts configured
- [ ] Database indexes created
- [ ] Redis caching implemented
- [ ] Horizontal scaling tested
- [ ] Health check endpoints implemented
- [ ] CI/CD pipeline validated

---

## Cost Optimization Tips

1. **Use Flash 8B for simple queries** - 30x cheaper than Pro
2. **Implement caching** - Cache common responses in Redis
3. **Optimize prompts** - Shorter prompts = fewer tokens
4. **Batch requests** - Where possible, batch similar queries
5. **Monitor token usage** - Set alerts for unusual spikes
6. **Use streaming** - For long responses, consider streaming
7. **Implement rate limiting** - Prevent abuse and cost overruns

---

## Troubleshooting

### Common Issues

**Issue: All models fail immediately**
- Check API key validity
- Verify network connectivity to api.google.dev
- Check rate limits on Gemini console

**Issue: Slow response times**
- Increase timeout values
- Check network latency
- Consider using Flash instead of Pro

**Issue: High token costs**
- Analyze prompt length
- Implement response caching
- Use Flash 8B for simple queries

---

## Additional Resources

- [Gemini API Documentation](https://ai.google.dev/docs)
- [Gemini Pricing](https://ai.google.dev/pricing)
- [Best Practices for Production](https://ai.google.dev/docs/best_practices)
- [Rate Limits and Quotas](https://ai.google.dev/docs/quota)

---

**Last Updated:** February 12, 2026  
**Version:** 1.0  
**Maintainer:** Development Team