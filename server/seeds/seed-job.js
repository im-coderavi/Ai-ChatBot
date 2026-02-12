const Job = require('../models/Job');
const { Logger } = require('../services/logger.service');

const logger = new Logger('Seed');

/**
 * Seed the default FedEx Ground ISP Delivery Driver job
 */
async function seedDefaultJob() {
    try {
        const exists = await Job.findOne({ jobId: 'fedex-driver-001' });
        if (exists) {
            logger.info('Default job already exists, skipping seed');
            return;
        }

        const job = new Job({
            jobId: 'fedex-driver-001',
            title: 'FedEx Ground ISP Delivery Driver (Non-CDL)',
            company: 'Tsavo West Inc',
            location: 'Tampa, Florida 33610',
            description: 'Delivery Driver for FedEx Ground packages in the Tampa Bay area. Operate company-provided delivery vehicle, lift packages up to 150 lbs, and deliver to homes and businesses.',
            mandatory: [
                { id: 'age', label: 'Age 21+', question: 'Are you at least 21 years old?', type: 'number', disqualifyCondition: 'Under 21' },
                { id: 'validLicense', label: 'Valid Driver\'s License', question: 'Do you have a valid driver\'s license?', type: 'boolean', disqualifyCondition: 'No license or suspended' },
                { id: 'drivingRecord', label: 'Clean Driving Record', question: 'Any major violations in past 3 years?', type: 'text', disqualifyCondition: 'Multiple violations, DUI, suspended' },
                { id: 'backgroundCheck', label: 'Background Check', question: 'Willing to undergo background check?', type: 'boolean', disqualifyCondition: 'Unwilling' },
                { id: 'drugScreening', label: 'Drug Screening', question: 'Willing to pass drug screening?', type: 'boolean', disqualifyCondition: 'Unwilling' },
                { id: 'liftingCapability', label: 'Lift 150 lbs', question: 'Can you lift packages up to 150 pounds?', type: 'boolean', disqualifyCondition: 'Cannot lift' },
                { id: 'weekendAvailability', label: 'Weekend Availability', question: 'Available to work one weekend day?', type: 'boolean', disqualifyCondition: 'Not available' },
                { id: 'longShiftFlexibility', label: '10-Hour Shifts', question: 'Can you work 10-hour shifts starting 7:30 AM?', type: 'boolean', disqualifyCondition: 'Cannot work' }
            ],
            preferred: [
                { id: 'deliveryExperience', label: 'Delivery Experience', question: 'Prior delivery/courier experience?', maxScore: 20, scoringDescription: '0pts=none, 10pts=some, 15pts=6mo-1yr, 20pts=1yr+' },
                { id: 'timeManagement', label: 'Time Management', question: 'Time management skills?', maxScore: 15, scoringDescription: '0pts=poor, 7pts=average, 15pts=excellent with examples' },
                { id: 'independence', label: 'Independent Work', question: 'Comfortable working independently?', maxScore: 15, scoringDescription: '0pts=not comfortable, 7pts=somewhat, 15pts=very with examples' }
            ],
            compensation: {
                hourlyRate: { min: 18, max: 20 },
                trainingRate: 15,
                bonuses: ['Stop Bonus', 'Safety Bonus'],
                payFrequency: 'Weekly (every Friday)'
            },
            schedule: {
                daysPerWeek: 4,
                hoursPerDay: 10,
                startTime: '7:30 AM',
                weekendRequired: true,
                overtimeAvailable: true
            },
            benefits: [
                'Comprehensive Health Insurance',
                'Aflac Supplemental (Dental, Vision, Disability)',
                '5 days PTO after 90 days',
                'Weekly Pay (direct deposit)',
                'Paid Training (1-2 weeks)',
                'Stop Bonus + Safety Bonus',
                'Overtime opportunities'
            ]
        });

        await job.save();
        logger.info('✅ Default job seeded: FedEx Ground ISP Delivery Driver');
    } catch (error) {
        logger.error('Failed to seed default job:', error.message);
    }
}

module.exports = { seedDefaultJob };
