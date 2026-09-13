import 'dotenv/config';
import mongoose from 'mongoose';

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log(`MongoDB connected: ${conn.connection.host}`);

    try {
      await mongoose.syncIndexes();
    } catch (indexErr) {
      console.warn('Index sync warning (non-fatal):', indexErr.message);
    }
  } catch (error) {
    console.error(`MongoDB connection error: ${error.message}`);
    throw error;
  }
};

export default connectDB;
