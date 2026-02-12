require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Server: SocketIOServer } = require('socket.io');
const mongoose = require('mongoose');
const { Logger } = require('./services/logger.service');
const { setupChatWebSocket } = require('./websocket/chat.handler');
const chatRoutes = require('./routes/chat.routes');
const adminRoutes = require('./routes/admin.routes');

const logger = new Logger('Server');

// ===============================
// Express App Setup
// ===============================
const app = express();
const server = http.createServer(app);

// ===============================
// Socket.IO Setup
// ===============================
const io = new SocketIOServer(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// ===============================
// Middleware
// ===============================
app.use(helmet());
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100,
  message: { error: 'Too many requests, please try again later.' }
});
app.use('/api/', limiter);

// ===============================
// Routes
// ===============================
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

app.use('/api/v1/chat', chatRoutes);
app.use('/api/v1/admin', adminRoutes);

// ===============================
// WebSocket
// ===============================
setupChatWebSocket(io);

// ===============================
// MongoDB Connection
// ===============================
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/hiring-agent';

mongoose.connect(MONGO_URI)
  .then(() => {
    logger.info('✅ Connected to MongoDB');
    
    // Seed default job if needed
    const { seedDefaultJob } = require('./seeds/seed-job');
    seedDefaultJob();
  })
  .catch((err) => {
    logger.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
  });

// ===============================
// Error Handling
// ===============================
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// ===============================
// Start Server
// ===============================
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  logger.info(`🚀 AI Hiring Agent server running on port ${PORT}`);
  logger.info(`📡 WebSocket server ready`);
  logger.info(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = { app, server, io };
