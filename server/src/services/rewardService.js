import Reward from '../models/Reward.js';
import User from '../models/User.js';

const POINTS_MAP = {
  create_item: 5,
  report_found: 10,
  confirmed_match: 20,
  recovered_item: 25,
  verified_return: 100,
  successful_return: 50,
};

const BADGE_DEFINITIONS = [
  {
    name: 'First Finder',
    icon: '🎯',
    description: 'Created your first lost/found item',
    check: (stats) => stats.totalItems >= 1,
  },
  {
    name: 'Campus Helper',
    icon: '⭐',
    description: 'Earned 50+ reward points',
    check: (stats) => stats.totalPoints >= 50,
  },
  {
    name: 'Recovery Expert',
    icon: '🏆',
    description: 'Earned 200+ reward points',
    check: (stats) => stats.totalPoints >= 200,
  },
  {
    name: 'Top Contributor',
    icon: '👑',
    description: 'Earned 500+ reward points',
    check: (stats) => stats.totalPoints >= 500,
  },
  {
    name: 'Trusted Finder',
    icon: '🤝',
    description: 'First successful return',
    check: (stats) => stats.successfulReturns >= 1,
  },
  {
    name: 'Campus Hero',
    icon: '🏅',
    description: '5 successful returns',
    check: (stats) => stats.successfulReturns >= 5,
  },
  {
    name: 'Recovery Expert II',
    icon: '🏆',
    description: '10 successful returns',
    check: (stats) => stats.successfulReturns >= 10,
  },
  {
    name: 'Legendary Helper',
    icon: '👑',
    description: '20 successful returns',
    check: (stats) => stats.successfulReturns >= 20,
  },
];

export async function awardPoints(
  userId,
  action,
  description,
  referenceId,
  referenceModel,
  session = null
) {
  const points = POINTS_MAP[action] || 0;

  if (points === 0) {
    console.warn(`No reward points configured for action: ${action}`);
    return null;
  }

  const existingRewardQuery = Reward.findOne({
    user: userId,
    action,
    referenceId,
    referenceModel,
  });
  if (session) existingRewardQuery.session(session);
  const existingReward = await existingRewardQuery;

  if (existingReward) {
    return existingReward;
  }

  let reward;
  try {
    const rewardData = {
      user: userId,
      points,
      action,
      description,
      referenceId,
      referenceModel,
    };
    if (session) {
      [reward] = await Reward.create([rewardData], { session });
    } else {
      reward = await Reward.create(rewardData);
    }
  } catch (error) {
    if (error?.code === 11000) {
      const duplicateQuery = Reward.findOne({ user: userId, action, referenceId, referenceModel });
      if (session) duplicateQuery.session(session);
      return duplicateQuery;
    }
    throw error;
  }

  const userQuery = User.findById(userId);
  if (session) userQuery.session(session);
  const user = await userQuery;

  if (!user) {
    console.warn(`User not found while awarding reward: ${userId}`);
    return reward;
  }

  user.rewardPoints += points;

  // Track successful returns for both sides of a completed return.
  if (action === 'verified_return' || action === 'successful_return') {
    user.successfulReturns = (user.successfulReturns || 0) + 1;
  }

  const existingBadgeNames = user.badges.map((badge) => badge.name);

  const rewardCountQuery = Reward.countDocuments({ user: userId });
  if (session) rewardCountQuery.session(session);
  const stats = {
    totalItems: await rewardCountQuery,
    totalPoints: user.rewardPoints,
    successfulReturns: user.successfulReturns || 0,
  };

  // Award any newly unlocked badges.
  for (const badgeDef of BADGE_DEFINITIONS) {
    if (
      !existingBadgeNames.includes(badgeDef.name) &&
      badgeDef.check(stats)
    ) {
      user.badges.push({
        name: badgeDef.name,
        icon: badgeDef.icon,
        description: badgeDef.description,
        earnedAt: new Date(),
      });
    }
  }

  await user.save(session ? { session } : undefined);

  return reward;
}

export async function updateTrustScore(userId) {
  const user = await User.findById(userId);

  if (!user) return;

  const baseScore = user.successfulReturns * 10;

  const rejectedCount = await Reward.countDocuments({
    user: userId,
    action: 'rejected_claim',
  });

  const penalty = rejectedCount * 5;

  const trustScore = Math.max(0, baseScore - penalty);

  user.trustScore = trustScore;

  await user.save();

  return trustScore;
}

export async function getPointsHistory(userId, page = 1, limit = 20) {
  const skip = (page - 1) * limit;

  const [rewards, total] = await Promise.all([
    Reward.find({ user: userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),

    Reward.countDocuments({ user: userId }),
  ]);

  return {
    rewards,
    total,
    page,
    pages: Math.ceil(total / limit),
  };
}

export async function getBadges(userId) {
  const user = await User.findById(userId).select('badges');

  return user?.badges || [];
}