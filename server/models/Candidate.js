const mongoose = require('mongoose');

/**
 * Candidate Schema
 * Stores candidate information, qualifications, conversation transcript, and evaluation results
 */
const candidateSchema = new mongoose.Schema({
    conversationId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    jobId: {
        type: String,
        default: 'fedex-driver-001'
    },
    personalInfo: {
        name: { type: String, default: '' },
        email: { type: String, default: '' },
        phone: { type: String, default: '' }
    },
    qualifications: {
        mandatory: {
            age: {
                status: { type: String, enum: ['pending', 'qualified', 'disqualified'], default: 'pending' },
                value: { type: Number, default: null },
                rawAnswer: { type: String, default: null }
            },
            validLicense: {
                status: { type: String, enum: ['pending', 'qualified', 'disqualified'], default: 'pending' },
                state: { type: String, default: null },
                rawAnswer: { type: String, default: null }
            },
            drivingRecord: {
                status: { type: String, enum: ['pending', 'qualified', 'disqualified'], default: 'pending' },
                details: { type: String, default: null },
                rawAnswer: { type: String, default: null }
            },
            backgroundCheck: {
                status: { type: String, enum: ['pending', 'qualified', 'disqualified'], default: 'pending' },
                willing: { type: Boolean, default: null },
                rawAnswer: { type: String, default: null }
            },
            drugScreening: {
                status: { type: String, enum: ['pending', 'qualified', 'disqualified'], default: 'pending' },
                willing: { type: Boolean, default: null },
                rawAnswer: { type: String, default: null }
            },
            liftingCapability: {
                status: { type: String, enum: ['pending', 'qualified', 'disqualified'], default: 'pending' },
                canLift: { type: Boolean, default: null },
                rawAnswer: { type: String, default: null }
            },
            weekendAvailability: {
                status: { type: String, enum: ['pending', 'qualified', 'disqualified'], default: 'pending' },
                available: { type: Boolean, default: null },
                rawAnswer: { type: String, default: null }
            },
            longShiftFlexibility: {
                status: { type: String, enum: ['pending', 'qualified', 'disqualified'], default: 'pending' },
                canWork: { type: Boolean, default: null },
                rawAnswer: { type: String, default: null }
            }
        },
        preferred: {
            deliveryExperience: {
                score: { type: Number, default: 0 },
                details: { type: String, default: null },
                rawAnswer: { type: String, default: null }
            },
            timeManagement: {
                score: { type: Number, default: 0 },
                details: { type: String, default: null },
                rawAnswer: { type: String, default: null }
            },
            independence: {
                score: { type: Number, default: 0 },
                details: { type: String, default: null },
                rawAnswer: { type: String, default: null }
            },
            militaryVeteran: {
                isVeteran: { type: Boolean, default: false },
                bonusPoints: { type: Number, default: 0 }
            }
        }
    },
    overallScore: {
        type: Number,
        default: 0
    },
    status: {
        type: String,
        enum: ['in_progress', 'qualified', 'disqualified'],
        default: 'in_progress'
    },
    currentPhase: {
        type: String,
        enum: ['introduction', 'mandatory_screening', 'preferred_scoring', 'wrap_up', 'completed'],
        default: 'introduction'
    },
    disqualificationReason: {
        type: String,
        default: null
    },
    transcript: [{
        role: {
            type: String,
            enum: ['agent', 'candidate'],
            required: true
        },
        message: {
            type: String,
            required: true
        },
        timestamp: {
            type: Date,
            default: Date.now
        }
    }],
    aiModelUsed: {
        type: String,
        default: null
    },
    processingTime: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true
});

// Indexes for efficient querying
candidateSchema.index({ status: 1, createdAt: -1 });
candidateSchema.index({ overallScore: -1 });
candidateSchema.index({ 'personalInfo.name': 'text' });

const Candidate = mongoose.model('Candidate', candidateSchema);

module.exports = Candidate;
