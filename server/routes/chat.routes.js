const { Router } = require('express');
const { ConversationManager } = require('../services/conversation/conversation-manager.service');
const { Logger } = require('../services/logger.service');

const router = Router();
const logger = new Logger('ChatRoutes');

// Lazy initialize conversation manager (so env vars are loaded)
let conversationManager = null;
function getManager() {
    if (!conversationManager) {
        conversationManager = new ConversationManager();
    }
    return conversationManager;
}

/**
 * POST /api/v1/chat/start
 * Start a new candidate conversation
 */
router.post('/start', async (req, res) => {
    try {
        const { jobId } = req.body;
        const manager = getManager();
        const result = await manager.startConversation(jobId || 'fedex-driver-001');

        res.json({
            success: true,
            conversationId: result.conversationId,
            firstMessage: result.firstMessage
        });
    } catch (error) {
        logger.error('Error starting conversation:', error.message);
        res.status(500).json({
            error: 'Failed to start conversation',
            message: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * POST /api/v1/chat/message
 * Send a message in an ongoing conversation
 */
router.post('/message', async (req, res) => {
    try {
        const { conversationId, message } = req.body;

        if (!conversationId || !message) {
            return res.status(400).json({
                error: 'conversationId and message are required'
            });
        }

        const manager = getManager();
        const result = await manager.processCandidateMessage(conversationId, message);

        res.json({
            success: true,
            response: result.agentResponse,
            qualificationStatus: result.qualificationUpdate,
            conversationComplete: result.conversationComplete,
            status: result.status
        });
    } catch (error) {
        logger.error('Error processing message:', error.message);
        res.status(500).json({
            error: 'Failed to process message',
            message: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * GET /api/v1/chat/result/:conversationId
 * Get the evaluation result for a conversation
 */
router.get('/result/:conversationId', async (req, res) => {
    try {
        const { conversationId } = req.params;
        const manager = getManager();
        const result = await manager.getResult(conversationId);

        res.json({
            success: true,
            ...result
        });
    } catch (error) {
        logger.error('Error getting result:', error.message);
        res.status(404).json({
            error: 'Conversation not found',
            message: error.message
        });
    }
});

module.exports = router;
