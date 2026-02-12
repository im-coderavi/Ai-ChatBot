/**
 * Logger Service
 * Simple console-based logger with levels and context
 */
class Logger {
    constructor(context = 'App') {
        this.context = context;
    }

    _formatMessage(level, message, ...args) {
        const timestamp = new Date().toISOString();
        const prefix = `[${timestamp}] [${level}] [${this.context}]`;
        return { prefix, message, args };
    }

    debug(message, ...args) {
        if (process.env.NODE_ENV === 'production') return;
        const { prefix } = this._formatMessage('DEBUG', message);
        console.debug(`${prefix} ${message}`, ...args);
    }

    info(message, ...args) {
        const { prefix } = this._formatMessage('INFO', message);
        console.log(`${prefix} ${message}`, ...args);
    }

    warn(message, ...args) {
        const { prefix } = this._formatMessage('WARN', message);
        console.warn(`${prefix} ${message}`, ...args);
    }

    error(message, ...args) {
        const { prefix } = this._formatMessage('ERROR', message);
        console.error(`${prefix} ${message}`, ...args);
    }

    critical(message, ...args) {
        const { prefix } = this._formatMessage('CRITICAL', message);
        console.error(`🚨 ${prefix} ${message}`, ...args);
    }
}

module.exports = { Logger };
