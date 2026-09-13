import express from 'express';
import 'dotenv/config';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';

import connectDB from './config/db.js';
import authRoutes from './routes/auth.js';
import itemRoutes from './routes/items.js';
import claimRoutes from './routes/claims.js';
import notificationRoutes from './routes/notifications.js';
import rewardRoutes from './routes/rewards.js';
import adminRoutes from './routes/admin.js';
import uploadRoutes from './routes/upload.js';
import matchRoutes from './routes/matches.js';
import chatRoutes from './routes/chat.js';
import Match from './models/Match.js';
import AppError from './utils/AppError.js';

const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

if (process.env.NODE_ENV === 'production') {
  const missing = ['MONGODB_URI', 'JWT_SECRET', 'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET', 'CAMPUS_EMAIL_DOMAIN']
    .filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(`Missing required production environment variables: ${missing.join(', ')}`);
  }
}

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
  },
});

io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) return next(new Error('Authentication required'));
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.data.userId = decoded.id.toString();
    next();
  } catch {
    next(new Error('Invalid socket authentication'));
  }
});

// --------------------------------------------------
// MIDDLEWARE
// --------------------------------------------------

app.use(helmet());

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);

app.use(express.json({ limit: '10mb' }));

app.use(morgan('dev'));

// --------------------------------------------------
// RATE LIMITING
// --------------------------------------------------

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: {
    success: false,
    message: 'Too many requests, please try again later.',
  },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again later.',
  },
});

app.use('/api/auth', authLimiter);
app.use('/api', generalLimiter);

// --------------------------------------------------
// PUBLIC HEALTH CHECK
// IMPORTANT: Keep this BEFORE the generic /api router
// --------------------------------------------------

app.get('/api/health', (req, res) => {
  const databaseConnected = mongoose.connection.readyState === 1;
  res.status(200).json({
    success: true,
    status: databaseConnected ? 'ok' : 'degraded',
    database: databaseConnected ? 'connected' : 'unavailable',
    timestamp: new Date().toISOString(),
  });
});

// --------------------------------------------------
// API ROUTES
// --------------------------------------------------

app.use('/api/auth', authRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/claims', claimRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/rewards', rewardRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/matches', matchRoutes);

// Generic API router MUST come after /api/health
app.use('/api', chatRoutes);

// --------------------------------------------------
// SOCKET.IO
// --------------------------------------------------

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  let currentUserId = socket.data.userId;
  socket.join(currentUserId);

  // Join user's private notification room
  socket.on('join', (userId) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.query?.token;

      if (!token) {
        return;
      }

      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET
      );

      if (decoded.id.toString() === userId.toString()) {
        currentUserId = decoded.id.toString();

        socket.join(currentUserId);

        console.log(`User ${userId} joined their socket room`);
      }
    } catch (error) {
      console.log('Invalid socket authentication');
    }
  });

  // Join a match chat room
  socket.on('join-match', async (matchId) => {
    if (!currentUserId) {
      return;
    }

    try {
      const match = await Match.findById(matchId).select(
        'lostUser foundUser status'
      );

      if (!match) {
        return;
      }

      const userId = currentUserId.toString();

      const isParticipant =
        match.lostUser.toString() === userId ||
        match.foundUser.toString() === userId;

      if (isParticipant) {
        socket.join(`match_${matchId}`);

        console.log(
          `User ${userId} joined match ${matchId}`
        );
      }
    } catch (error) {
      console.log('Invalid match');
    }
  });

  // Leave match chat room
  socket.on('leave-match', (matchId) => {
    socket.leave(`match_${matchId}`);
  });

  // Disconnect
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);

    currentUserId = null;
  });
});

// Make Socket.IO available to controllers
app.set('io', io);

// --------------------------------------------------
// 404 HANDLER
// --------------------------------------------------

app.all('*', (req, res, next) => {
  next(
    new AppError(
      `Route ${req.originalUrl} not found`,
      404
    )
  );
});

// --------------------------------------------------
// GLOBAL ERROR HANDLER
// --------------------------------------------------

app.use((err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  if (err.name === 'JsonWebTokenError') {
    err.statusCode = 401;
    err.status = 'fail';
    err.message = 'Invalid token';
  } else if (err.name === 'TokenExpiredError') {
    err.statusCode = 401;
    err.status = 'fail';
    err.message = 'Token expired';
  } else if (err.name === 'CastError') {
    err.statusCode = 400;
    err.status = 'fail';
    err.message = 'Invalid resource identifier';
  } else if (err.name === 'ValidationError') {
    err.statusCode = 400;
    err.status = 'fail';
    err.message = Object.values(err.errors).map((validationError) => validationError.message).join(', ');
  } else if (err.code === 11000) {
    err.statusCode = 409;
    err.status = 'fail';
    err.message = 'A record with those values already exists';
  }

  if (process.env.NODE_ENV === 'development') {
    console.error(err);
  }

  res.status(err.statusCode).json({
    success: false,
    status: err.status,
    message: err.message,
    ...(process.env.NODE_ENV === 'development' && {
      stack: err.stack,
    }),
  });
});

// --------------------------------------------------
// SERVER START
// --------------------------------------------------

const PORT = process.env.PORT || 5000;

connectDB()
  .then(() => {
    httpServer.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error(
      'Failed to connect to database:',
      err.message
    );

    httpServer.listen(PORT, () => {
      console.log(
        `Server running on port ${PORT} (without database)`
      );
    });
  });