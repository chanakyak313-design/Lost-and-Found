import Match from '../models/Match.js';
import Item from '../models/Item.js';
import Notification from '../models/Notification.js';
import User from '../models/User.js';
import { awardPoints, updateTrustScore } from './rewardService.js';

const HIGH_VALUE_CATEGORIES = ['electronics', 'id-cards', 'accessories'];

function needsAdminReview(category) {
  if (!category) return false;

  const normalizedCategory = category
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-');

  return HIGH_VALUE_CATEGORIES.includes(normalizedCategory);
}

function statusForConfirmations(match) {
  if (match.lostUserConfirmed && match.foundUserConfirmed) {
    return 'both_confirmed';
  }

  if (match.lostUserConfirmed) {
    return 'confirmed_by_lost';
  }

  if (match.foundUserConfirmed) {
    return 'confirmed_by_found';
  }

  return 'pending';
}

function canProcessReturn(match) {
  return (
    match.status === 'both_confirmed' ||
    match.status === 'handover_scheduled'
  );
}

async function finalizeReturn(matchId) {
  const match = await Match.findById(matchId)
    .populate('lostItem')
    .populate('foundItem');

  if (!match) return;

  if (match.status === 'returned') {
    return match;
  }

  match.status = 'returned';
  await match.save();

  const lostItem = await Item.findById(match.lostItem?._id);
  const foundItem = await Item.findById(match.foundItem?._id);

  if (lostItem) {
    lostItem.status = 'resolved';
    await lostItem.save();
  }

  if (foundItem) {
    foundItem.status = 'resolved';
    await foundItem.save();
  }

  // Reward the person who recovered their item.
  await awardPoints(
    match.lostUser,
    'recovered_item',
    `Recovered your item: ${lostItem?.title || 'item'}`,
    match._id,
    'Match'
  );

  // Reward the person who returned the found item.
  await awardPoints(
    match.foundUser,
    'successful_return',
    `Returned item: ${foundItem?.title || 'item'}`,
    match._id,
    'Match'
  );

  // Trust score is calculated from successful returns.
  // awardPoints() already updates successfulReturns.
  await updateTrustScore(match.lostUser);
  await updateTrustScore(match.foundUser);

  await Notification.create({
    user: match.lostUser,
    type: 'item_returned',
    title: 'Item Returned Successfully! 🎉',
    message: `Your ${lostItem?.title || 'item'} has been returned! +25 points earned.`,
    referenceId: match._id,
    referenceModel: 'Match',
  });

  await Notification.create({
    user: match.foundUser,
    type: 'item_returned',
    title: 'Item Returned Successfully! 🎉',
    message: `You successfully returned ${foundItem?.title || 'item'}! +50 points earned.`,
    referenceId: match._id,
    referenceModel: 'Match',
  });

  return match;
}

export async function createMatch(
  lostItem,
  foundItem,
  score,
  reasons,
  io
) {
  const lostUserId = lostItem.user?._id || lostItem.user;
  const foundUserId = foundItem.user?._id || foundItem.user;

  const category =
    lostItem.aiAnalysis?.category || lostItem.category;

  const highValue = needsAdminReview(category);

  let match;
  try {
    match = await Match.create({
      lostItem: lostItem._id,
      foundItem: foundItem._id,
      lostUser: lostUserId,
      foundUser: foundUserId,
      score,
      reasons: reasons || [],
      status: 'pending',
      adminReviewRequired: highValue,
    });
  } catch (error) {
    if (error?.code === 11000) {
      return Match.findOne({ lostItem: lostItem._id, foundItem: foundItem._id });
    }
    throw error;
  }

  await Notification.create({
    user: lostUserId,
    type: 'match',
    title: 'Potential Match Found!',
    message: `Found Item: ${foundItem.title}\nMatch Score: ${score}%\nReview this match.`,
    referenceId: match._id,
    referenceModel: 'Match',
  });

  await Notification.create({
    user: foundUserId,
    type: 'match',
    title: 'Someone may be looking for your found item',
    message: `Lost Item: ${lostItem.title}\nMatch Score: ${score}%\nReview this match.`,
    referenceId: match._id,
    referenceModel: 'Match',
  });

  return match;
}

export async function confirmByLostUser(matchId, userId) {
  const match = await Match.findById(matchId);

  if (!match) {
    throw new Error('Match not found');
  }

  if (match.lostUser.toString() !== userId.toString()) {
    throw new Error('Not authorized');
  }

  if (
    match.status === 'returned' ||
    match.status === 'rejected' ||
    match.status === 'cancelled'
  ) {
    throw new Error('Match is already closed');
  }

  // Prevent duplicate confirmation rewards.
  const alreadyConfirmed = match.lostUserConfirmed;
  const previousStatus = match.status;

  match.lostUserConfirmed = true;
  match.status = statusForConfirmations(match);

  await match.save();

  if (!alreadyConfirmed) {
    await awardPoints(
      userId,
      'confirmed_match',
      'Confirmed match for your lost item',
      match._id,
      'Match'
    );
  }

  if (match.status === 'both_confirmed' && previousStatus !== 'both_confirmed') {
    if (!match.foundUserConfirmed) {
      throw new Error('Invalid match confirmation state');
    }

    // Only award the other user's confirmation reward here.
    // This prevents duplicate rewards when the endpoint is called again.
    if (!alreadyConfirmed) {
      await awardPoints(
        match.foundUser,
        'confirmed_match',
        'Confirmed match for found item',
        match._id,
        'Match'
      );
    }

    await onBothConfirmed(match);
  }

  return match;
}

export async function confirmByFoundUser(matchId, userId) {
  const match = await Match.findById(matchId);

  if (!match) {
    throw new Error('Match not found');
  }

  if (match.foundUser.toString() !== userId.toString()) {
    throw new Error('Not authorized');
  }

  if (
    match.status === 'returned' ||
    match.status === 'rejected' ||
    match.status === 'cancelled'
  ) {
    throw new Error('Match is already closed');
  }

  // Prevent duplicate confirmation rewards.
  const alreadyConfirmed = match.foundUserConfirmed;
  const previousStatus = match.status;

  match.foundUserConfirmed = true;
  match.status = statusForConfirmations(match);

  await match.save();

  if (!alreadyConfirmed) {
    await awardPoints(
      userId,
      'confirmed_match',
      'Confirmed match for found item',
      match._id,
      'Match'
    );
  }

  if (match.status === 'both_confirmed' && previousStatus !== 'both_confirmed') {
    if (!match.lostUserConfirmed) {
      throw new Error('Invalid match confirmation state');
    }

    // Only award the other user's confirmation reward here.
    if (!alreadyConfirmed) {
      await awardPoints(
        match.lostUser,
        'confirmed_match',
        'Confirmed match for your lost item',
        match._id,
        'Match'
      );
    }

    await onBothConfirmed(match);
  }

  return match;
}

async function onBothConfirmed(match) {
  await Notification.create({
    user: match.lostUser,
    type: 'match_confirmed',
    title: 'Match Confirmed!',
    message:
      'Both parties confirmed the match. You may now arrange item handover.',
    referenceId: match._id,
    referenceModel: 'Match',
  });

  await Notification.create({
    user: match.foundUser,
    type: 'match_confirmed',
    title: 'Match Confirmed!',
    message:
      'Both parties confirmed the match. You may now arrange item handover.',
    referenceId: match._id,
    referenceModel: 'Match',
  });
}

export async function scheduleHandover(matchId, userId, location) {
  const match = await Match.findById(matchId);

  if (!match) {
    throw new Error('Match not found');
  }

  const uid = userId.toString();

  if (
    match.lostUser.toString() !== uid &&
    match.foundUser.toString() !== uid
  ) {
    throw new Error('Not authorized');
  }

  if (!canProcessReturn(match)) {
    throw new Error(
      'Match must be confirmed before scheduling handover'
    );
  }

  if (!location || !location.toString().trim()) {
    throw new Error('Handover location is required');
  }

  match.handoverLocation = location.toString().trim();
  match.status = 'handover_scheduled';

  await match.save();

  await Notification.create({
    user: match.lostUser,
    type: 'handover',
    title: 'Handover Scheduled!',
    message: `Handover location set to: ${match.handoverLocation}`,
    referenceId: match._id,
    referenceModel: 'Match',
  });

  await Notification.create({
    user: match.foundUser,
    type: 'handover',
    title: 'Handover Scheduled!',
    message: `Handover location set to: ${match.handoverLocation}`,
    referenceId: match._id,
    referenceModel: 'Match',
  });

  return match;
}

export async function confirmReturnByLostUser(matchId, userId) {
  const match = await Match.findById(matchId);

  if (!match) {
    throw new Error('Match not found');
  }

  if (match.lostUser.toString() !== userId.toString()) {
    throw new Error('Not authorized');
  }

  if (match.status === 'returned') {
    throw new Error('Already returned');
  }

  if (!canProcessReturn(match)) {
    throw new Error(
      'Match must be confirmed before confirming the return'
    );
  }

  if (match.returnedByLostUser) {
    throw new Error('You have already confirmed the return');
  }

  match.returnedByLostUser = true;

  if (match.returnedByFoundUser) {
    return finalizeReturn(matchId);
  }

  await match.save();

  return match;
}

export async function confirmReturnByFoundUser(matchId, userId) {
  const match = await Match.findById(matchId);

  if (!match) {
    throw new Error('Match not found');
  }

  if (match.foundUser.toString() !== userId.toString()) {
    throw new Error('Not authorized');
  }

  if (match.status === 'returned') {
    throw new Error('Already returned');
  }

  if (!canProcessReturn(match)) {
    throw new Error(
      'Match must be confirmed before confirming the return'
    );
  }

  if (match.returnedByFoundUser) {
    throw new Error('You have already confirmed the return');
  }

  match.returnedByFoundUser = true;

  if (match.returnedByLostUser) {
    return finalizeReturn(matchId);
  }

  await match.save();

  return match;
}

export async function rejectMatch(matchId, userId) {
  const match = await Match.findById(matchId);

  if (!match) {
    throw new Error('Match not found');
  }

  const uid = userId.toString();

  if (
    match.lostUser.toString() !== uid &&
    match.foundUser.toString() !== uid
  ) {
    throw new Error('Not authorized');
  }

  if (match.status === 'returned') {
    throw new Error('Match already completed');
  }

  if (match.status === 'rejected') {
    throw new Error('Match is already rejected');
  }

  match.status = 'rejected';
  match.rejectedBy = userId;

  await match.save();

  const otherUserId =
    match.lostUser.toString() === uid
      ? match.foundUser
      : match.lostUser;

  await Notification.create({
    user: otherUserId,
    type: 'system',
    title: 'Match Rejected',
    message: 'The other user did not confirm this match.',
    referenceId: match._id,
    referenceModel: 'Match',
  });

  return match;
}

export async function getMatchesForUser(userId, filters = {}) {
  const page = Math.max(parseInt(filters.page, 10) || 1, 1);
  const limit = Math.min(
    Math.max(parseInt(filters.limit, 10) || 20, 1),
    100
  );

  const skip = (page - 1) * limit;

  const query = {
    $or: [
      { lostUser: userId },
      { foundUser: userId },
    ],
  };

  if (filters.status) {
    query.status = filters.status;
  }

  const [matches, total] = await Promise.all([
    Match.find(query)
      .populate(
        'lostItem',
        'title images category status type'
      )
      .populate(
        'foundItem',
        'title images category status type'
      )
      .populate(
        'lostUser',
        'name email profilePicture'
      )
      .populate(
        'foundUser',
        'name email profilePicture'
      )
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),

    Match.countDocuments(query),
  ]);

  return {
    matches,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
}

export async function getMatchById(matchId, userId) {
  const match = await Match.findById(matchId)
    .populate('lostItem')
    .populate('foundItem')
    .populate(
      'lostUser',
      'name email profilePicture phone department'
    )
    .populate(
      'foundUser',
      'name email profilePicture phone department'
    );

  if (!match) {
    throw new Error('Match not found');
  }

  const uid = userId.toString();

  if (
    match.lostUser._id.toString() !== uid &&
    match.foundUser._id.toString() !== uid
  ) {
    throw new Error('Not authorized');
  }

  return match;
}

export async function getAllMatchesForAdmin(filters = {}) {
  const page = Math.max(parseInt(filters.page, 10) || 1, 1);
  const limit = Math.min(
    Math.max(parseInt(filters.limit, 10) || 20, 1),
    100
  );

  const skip = (page - 1) * limit;

  const query = {};

  if (filters.status) {
    query.status = filters.status;
  }

  if (filters.adminReviewRequired !== undefined) {
    query.adminReviewRequired = filters.adminReviewRequired;
  }

  const [matches, total] = await Promise.all([
    Match.find(query)
      .populate('lostItem', 'title images category')
      .populate('foundItem', 'title images category')
      .populate('lostUser', 'name email')
      .populate('foundUser', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),

    Match.countDocuments(query),
  ]);

  return {
    matches,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
}

export async function adminVerifyMatch(matchId, approved) {
  const match = await Match.findById(matchId);

  if (!match) {
    throw new Error('Match not found');
  }

  match.adminReviewed = true;
  match.adminApproved = approved;

  await match.save();

  if (approved) {
    await awardPoints(
      match.lostUser,
      'confirmed_match',
      'Match verified by admin',
      match._id,
      'Match'
    );

    await awardPoints(
      match.foundUser,
      'confirmed_match',
      'Match verified by admin',
      match._id,
      'Match'
    );
  }

  await Notification.create({
    user: match.lostUser,
    type: 'system',
    title: approved
      ? 'Match Verified by Admin ✅'
      : 'Match Rejected by Admin ❌',
    message: approved
      ? 'Your match has been verified by an admin. You can now arrange handover.'
      : 'The match was not approved by admin review.',
    referenceId: match._id,
    referenceModel: 'Match',
  });

  await Notification.create({
    user: match.foundUser,
    type: 'system',
    title: approved
      ? 'Match Verified by Admin ✅'
      : 'Match Rejected by Admin ❌',
    message: approved
      ? 'Your match has been verified by an admin. You can now arrange handover.'
      : 'The match was not approved by admin review.',
    referenceId: match._id,
    referenceModel: 'Match',
  });

  return match;
}

export async function getMatchStats() {
  const [
    totalMatches,
    confirmedMatches,
    successfulReturns,
    rejectedMatches,
  ] = await Promise.all([
    Match.countDocuments(),
    Match.countDocuments({ status: 'both_confirmed' }),
    Match.countDocuments({ status: 'returned' }),
    Match.countDocuments({ status: 'rejected' }),
  ]);

  const avgScore = await Match.aggregate([
    {
      $group: {
        _id: null,
        avgScore: { $avg: '$score' },
      },
    },
  ]);

  const returnRate =
    totalMatches > 0
      ? Math.round(
          (successfulReturns / totalMatches) * 100
        )
      : 0;

  return {
    totalMatches,
    confirmedMatches,
    successfulReturns,
    rejectedMatches,
    returnRate,
    averageMatchAccuracy:
      avgScore.length > 0
        ? Math.round(avgScore[0].avgScore)
        : 0,
  };
}