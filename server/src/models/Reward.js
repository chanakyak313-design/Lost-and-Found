import mongoose from 'mongoose';

const rewardSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  points: {
    type: Number,
    required: true,
  },
  action: {
    type: String,
    required: true,
  },
  description: String,
  referenceId: {
    type: mongoose.Schema.Types.ObjectId,
  },
  referenceModel: String,
}, { timestamps: true });

rewardSchema.index(
  { user: 1, action: 1, referenceId: 1, referenceModel: 1 },
  {
    unique: true,
    partialFilterExpression: {
      referenceId: { $exists: true },
      referenceModel: { $exists: true },
    },
  }
);

const Reward = mongoose.model('Reward', rewardSchema);
export default Reward;
