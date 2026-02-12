const Candidate = require('../../models/Candidate');
const { Logger } = require('../logger.service');
const { v4: uuidv4 } = require('uuid');

/**
 * Conversation State Service
 * Manages conversation state persistence in MongoDB
 */
class ConversationStateService {
    constructor() {
        this.logger = new Logger('ConversationState');
    }

    /**
     * Create a new conversation state
     */
    async createState(jobId = 'fedex-driver-001') {
        const conversationId = uuidv4();

        const candidate = new Candidate({
            conversationId,
            jobId,
            status: 'in_progress',
            currentPhase: 'introduction',
            transcript: []
        });

        await candidate.save();
        this.logger.info(`Created new conversation: ${conversationId}`);

        return candidate;
    }

    /**
     * Get conversation state by ID
     */
    async getState(conversationId) {
        const candidate = await Candidate.findOne({ conversationId });

        if (!candidate) {
            throw new Error(`Conversation ${conversationId} not found`);
        }

        return candidate;
    }

    /**
     * Update conversation state
     */
    async updateState(conversationId, updates) {
        const candidate = await Candidate.findOneAndUpdate(
            { conversationId },
            { $set: updates },
            { new: true }
        );

        if (!candidate) {
            throw new Error(`Conversation ${conversationId} not found`);
        }

        this.logger.debug(`Updated state for conversation: ${conversationId}`);
        return candidate;
    }

    /**
     * Add transcript entries to conversation
     */
    async addToTranscript(conversationId, entries) {
        const candidate = await Candidate.findOneAndUpdate(
            { conversationId },
            { $push: { transcript: { $each: entries } } },
            { new: true }
        );

        return candidate;
    }

    /**
     * Get all candidates with pagination and filters
     */
    async getCandidates({ status, sortBy, limit = 20, offset = 0, search }) {
        const query = {};

        if (status && status !== 'all') {
            query.status = status;
        }

        if (search) {
            query['personalInfo.name'] = { $regex: search, $options: 'i' };
        }

        let sortOption = { createdAt: -1 };
        if (sortBy === 'score') sortOption = { overallScore: -1 };
        if (sortBy === 'name') sortOption = { 'personalInfo.name': 1 };

        const [candidates, total] = await Promise.all([
            Candidate.find(query)
                .sort(sortOption)
                .skip(offset)
                .limit(limit)
                .select('-transcript'),
            Candidate.countDocuments(query)
        ]);

        return { candidates, total, page: Math.floor(offset / limit) + 1, pageSize: limit };
    }

    /**
     * Get dashboard statistics
     */
    async getStats() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 7);

        const [
            totalCandidates,
            todayCount,
            weekCount,
            qualifiedCount,
            disqualifiedCount,
            inProgressCount,
            avgScoreResult
        ] = await Promise.all([
            Candidate.countDocuments(),
            Candidate.countDocuments({ createdAt: { $gte: today } }),
            Candidate.countDocuments({ createdAt: { $gte: weekAgo } }),
            Candidate.countDocuments({ status: 'qualified' }),
            Candidate.countDocuments({ status: 'disqualified' }),
            Candidate.countDocuments({ status: 'in_progress' }),
            Candidate.aggregate([
                { $match: { status: 'qualified' } },
                { $group: { _id: null, avgScore: { $avg: '$overallScore' } } }
            ])
        ]);

        return {
            total: totalCandidates,
            today: todayCount,
            thisWeek: weekCount,
            qualified: qualifiedCount,
            disqualified: disqualifiedCount,
            inProgress: inProgressCount,
            averageScore: avgScoreResult[0]?.avgScore ? Math.round(avgScoreResult[0].avgScore) : 0,
            qualificationRate: totalCandidates > 0
                ? Math.round((qualifiedCount / (qualifiedCount + disqualifiedCount)) * 100) || 0
                : 0
        };
    }
}

module.exports = { ConversationStateService };
