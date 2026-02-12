const { ConversationManager } = require('../services/conversation/conversation-manager.service');
const { Logger } = require('../services/logger.service');

const logger = new Logger('WebSocket');

let conversationManager = null;
function getManager() {
    if (!conversationManager) {
        conversationManager = new ConversationManager();
    }
    return conversationManager;
}

/**
 * Setup WebSocket handlers for real-time chat
 */
function setupChatWebSocket(io) {
    io.on('connection', (socket) => {
        logger.info(`Client connected: ${socket.id}`);

        /**
         * Start a new conversation via WebSocket
         */
        socket.on('start_conversation', async (data) => {
            try {
                const manager = getManager();
                const result = await manager.startConversation(data?.jobId || 'fedex-driver-001');

                // Join a room for this conversation
                socket.join(result.conversationId);

                socket.emit('conversation_started', {
                    conversationId: result.conversationId,
                    message: result.firstMessage
                });

                logger.info(`Conversation started: ${result.conversationId}`);
            } catch (error) {
                logger.error('Error starting conversation via WebSocket:', error.message);
                socket.emit('error', {
                    code: 'START_ERROR',
                    message: 'Failed to start conversation. Please try again.'
                });
            }
        });

        /**
         * Handle incoming chat messages
         */
        socket.on('message', async (data) => {
            try {
                const { conversationId, message } = data;

                if (!conversationId || !message) {
                    socket.emit('error', {
                        code: 'INVALID_INPUT',
                        message: 'conversationId and message are required'
                    });
                    return;
                }

                // Emit typing indicator
                socket.emit('typing', { isTyping: true });

                const manager = getManager();
                const result = await manager.processCandidateMessage(conversationId, message);

                // Stop typing
                socket.emit('typing', { isTyping: false });

                // Send response
                socket.emit('response', {
                    message: result.agentResponse,
                    qualificationUpdate: result.qualificationUpdate,
                    conversationComplete: result.conversationComplete,
                    status: result.status,
                    isFollowUp: result.isFollowUp || false
                });

                logger.info(
                    `Message processed for ${conversationId} - ` +
                    `Complete: ${result.conversationComplete}, Status: ${result.status}`
                );
            } catch (error) {
                // Stop typing on error
                socket.emit('typing', { isTyping: false });

                logger.error('Error processing WebSocket message:', error.message);
                socket.emit('error', {
                    code: 'AI_ERROR',
                    message: 'Temporary service issue. Please try again.'
                });
            }
        });

        /**
         * Handle disconnect
         */
        socket.on('disconnect', () => {
            logger.info(`Client disconnected: ${socket.id}`);
        });
    });
}

module.exports = { setupChatWebSocket };
