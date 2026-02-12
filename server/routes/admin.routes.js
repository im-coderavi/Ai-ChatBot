const { Router } = require('express');
const { ConversationStateService } = require('../services/conversation/conversation-state.service');
const { metricsInstance } = require('../services/metrics.service');
const { Logger } = require('../services/logger.service');
const Candidate = require('../models/Candidate');

const router = Router();
const logger = new Logger('AdminRoutes');
const stateService = new ConversationStateService();

/**
 * GET /api/v1/admin/stats
 * Dashboard statistics
 */
router.get('/stats', async (req, res) => {
    try {
        const stats = await stateService.getStats();
        const aiMetrics = metricsInstance.getMetrics();

        res.json({
            success: true,
            stats,
            aiMetrics
        });
    } catch (error) {
        logger.error('Stats error:', error.message);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

/**
 * GET /api/v1/admin/candidates
 * List candidates with filtering, sorting, and pagination
 */
router.get('/candidates', async (req, res) => {
    try {
        const { status, sortBy, limit, offset, search } = req.query;

        const result = await stateService.getCandidates({
            status: status || 'all',
            sortBy: sortBy || 'date',
            limit: parseInt(limit) || 20,
            offset: parseInt(offset) || 0,
            search
        });

        res.json({
            success: true,
            ...result
        });
    } catch (error) {
        logger.error('Candidates list error:', error.message);
        res.status(500).json({ error: 'Failed to fetch candidates' });
    }
});

/**
 * GET /api/v1/admin/candidates/:id
 * Get candidate detail with full transcript
 */
router.get('/candidates/:id', async (req, res) => {
    try {
        const candidate = await Candidate.findById(req.params.id);
        if (!candidate) {
            return res.status(404).json({ error: 'Candidate not found' });
        }

        res.json({
            success: true,
            candidate
        });
    } catch (error) {
        logger.error('Candidate detail error:', error.message);
        res.status(500).json({ error: 'Failed to fetch candidate details' });
    }
});

/**
 * DELETE /api/v1/admin/candidates/:id
 * Delete a candidate record
 */
router.delete('/candidates/:id', async (req, res) => {
    try {
        const candidate = await Candidate.findByIdAndDelete(req.params.id);
        if (!candidate) {
            return res.status(404).json({ error: 'Candidate not found' });
        }

        res.json({ success: true, message: 'Candidate deleted' });
    } catch (error) {
        logger.error('Delete candidate error:', error.message);
        res.status(500).json({ error: 'Failed to delete candidate' });
    }
});

module.exports = router;
