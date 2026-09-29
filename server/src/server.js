import express from 'express';
import 'dotenv/config';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';

import connectDB from './config/db.js';
import itemRoutes from './routes/items.js';
import uploadRoutes from './routes/upload.js';
import AppError from './utils/AppError.js';

const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

if (process.env.NODE_ENV === 'production') {
  const missing = ['MONGODB_URI', 'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET']
    .filter((name) => !process.env[name]);

  if (missing.length > 0) {
    throw new Error(`Missing required production environment variables: ${missing.join(', ')}`);
  }
}

const app = express();

app.use(helmet());
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(morgan('dev'));

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { success: false, message: 'Too many requests, please try again later.' },
});

app.use('/api', generalLimiter);

app.get('/api/health', (req, res) => {
  const databaseConnected = mongoose.connection.readyState === 1;

  res.status(200).json({
    success: true,
    status: databaseConnected ? 'ok' : 'degraded',
    database: databaseConnected ? 'connected' : 'unavailable',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/items', itemRoutes);
app.use('/api/upload', uploadRoutes);

app.all('*', (req, res, next) => {
  next(new AppError(`Route ${req.originalUrl} not found`, 404));
});

app.use((err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  if (err.name === 'CastError') {
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
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

const PORT = process.env.PORT || 5000;

connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to connect to database:', err.message);

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT} (without database)`);
    });
  });
