import mongoose from 'mongoose';

const matchSchema = new mongoose.Schema({
  lostItem: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Item',
    required: true,
  },
  foundItem: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Item',
    required: true,
  },
  lostUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  foundUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  score: {
    type: Number,
    required: true,
    min: 0,
    max: 100,
  },
  reasons: [String],
  status: {
    type: String,
    enum: [
      'pending',
      'confirmed_by_lost',
      'confirmed_by_found',
      'both_confirmed',
      'handover_scheduled',
      'returned',
      'rejected',
      'cancelled',
    ],
    default: 'pending',
  },
  lostUserConfirmed: {
    type: Boolean,
    default: false,
  },
  foundUserConfirmed: {
    type: Boolean,
    default: false,
  },
  returnedByLostUser: {
    type: Boolean,
    default: false,
  },
  returnedByFoundUser: {
    type: Boolean,
    default: false,
  },
  handoverLocation: String,
  adminReviewRequired: {
    type: Boolean,
    default: false,
  },
  adminReviewed: {
    type: Boolean,
    default: false,
  },
  adminApproved: {
    type: Boolean,
    default: false,
  },
  rejectedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
}, { timestamps: true });

matchSchema.index({ lostUser: 1, status: 1 });
matchSchema.index({ foundUser: 1, status: 1 });
matchSchema.index({ lostItem: 1 });
matchSchema.index({ foundItem: 1 });
matchSchema.index({ lostItem: 1, foundItem: 1 }, { unique: true });

const Match = mongoose.model('Match', matchSchema);
export default Match;
