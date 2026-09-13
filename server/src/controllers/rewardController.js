import User from '../models/User.js';
import catchAsync from '../utils/catchAsync.js';
import { getPointsHistory, getBadges } from '../services/rewardService.js';

export const getRewards = catchAsync(async (req, res, next) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);

  const result = await getPointsHistory(req.user._id, page, limit);

  res.status(200).json({
    success: true,
    data: result,
  });
});

export const getBadgesController = catchAsync(async (req, res, next) => {
  const badges = await getBadges(req.user._id);

  res.status(200).json({
    success: true,
    data: { badges },
  });
});

export const getLeaderboard = catchAsync(async (req, res, next) => {
  const users = await User.find({ role: { $ne: 'admin' } })
    .select('name email profilePicture rewardPoints badges department')
    .sort({ rewardPoints: -1 })
    .limit(20);

  res.status(200).json({
    success: true,
    data: { leaderboard: users },
  });
});
