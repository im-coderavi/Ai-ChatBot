const mongoose = require('mongoose');

/**
 * Job Schema
 * Defines job positions with mandatory/preferred requirements
 */
const jobSchema = new mongoose.Schema({
    jobId: {
        type: String,
        required: true,
        unique: true
    },
    title: {
        type: String,
        required: true
    },
    company: {
        type: String,
        required: true
    },
    location: {
        type: String,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    mandatory: [{
        id: String,
        label: String,
        question: String,
        type: { type: String, enum: ['boolean', 'number', 'text', 'choice'] },
        disqualifyCondition: String
    }],
    preferred: [{
        id: String,
        label: String,
        question: String,
        maxScore: Number,
        scoringDescription: String
    }],
    compensation: {
        hourlyRate: { min: Number, max: Number },
        trainingRate: Number,
        bonuses: [String],
        payFrequency: String
    },
    schedule: {
        daysPerWeek: Number,
        hoursPerDay: Number,
        startTime: String,
        weekendRequired: Boolean,
        overtimeAvailable: Boolean
    },
    benefits: [String],
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

const Job = mongoose.model('Job', jobSchema);

module.exports = Job;
