const jwt = require('jsonwebtoken');
const { Logger } = require('../services/logger.service');

const logger = new Logger('AuthMiddleware');

/**
 * Verify JWT token for protected routes
 */
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        logger.warn('Invalid token attempt:', error.message);
        return res.status(403).json({ error: 'Invalid or expired token.' });
    }
}

/**
 * Check admin role
 */
function requireAdmin(req, res, next) {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required.' });
    }
    next();
}

module.exports = { authenticateToken, requireAdmin };
