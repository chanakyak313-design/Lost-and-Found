import mongoose from 'mongoose';

const locationSchema = new mongoose.Schema({
  name: String,
  type: {
    type: String,
    enum: ['Point'],
    default: 'Point',
  },
  coordinates: {
    type: [Number],
    validate: {
      validator: (coordinates) => !coordinates || (coordinates.length === 2 && coordinates.every(Number.isFinite)),
      message: 'Location coordinates must contain longitude and latitude',
    },
  },
}, { _id: false });

const itemSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  type: {
    type: String,
    enum: ['lost', 'found'],
    required: [true, 'Type is required'],
  },
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
    maxlength: [160, 'Title must be 160 characters or fewer'],
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
    maxlength: [5000, 'Description must be 5000 characters or fewer'],
  },
  category: {
    type: String,
    required: [true, 'Category is required'],
    maxlength: [50, 'Category must be 50 characters or fewer'],
  },
  status: {
    type: String,
    enum: ['open', 'resolved', 'closed'],
    default: 'open',
  },
  images: [
    {
      url: String,
      publicId: String,
    },
  ],
  dateOccurred: {
    type: Date,
    required: [true, 'Date occurred is required'],
  },
  location: {
    type: locationSchema,
    default: undefined,
  },
  reward: {
    type: Number,
  },
  verificationQuestion: String,
  aiAnalysis: {
    description: String,
    category: String,
    dominantColors: [String],
    brand: String,
    uniqueFeatures: [String],
    keywords: [String],
    confidence: Number,
  },
}, { timestamps: true });

itemSchema.index({ location: '2dsphere' }, { sparse: true });
itemSchema.index({ type: 1, status: 1, category: 1 });

const Item = mongoose.model('Item', itemSchema);
export default Item;
