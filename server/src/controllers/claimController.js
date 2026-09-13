import { validationResult } from 'express-validator';
import mongoose from 'mongoose';
import Claim from '../models/Claim.js';
import Item from '../models/Item.js';
import Notification from '../models/Notification.js';
import AppError from '../utils/AppError.js';
import catchAsync from '../utils/catchAsync.js';
import { awardPoints } from '../services/rewardService.js';
import { sendClaimNotification } from '../services/emailService.js';

export const createClaim = catchAsync(async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(new AppError(errors.array().map((e) => e.msg).join(', '), 400));
  }

  const { itemId, description, verificationAnswer } = req.body;

  const item = await Item.findById(itemId).populate('user', 'name email');
  if (!item) {
    return next(new AppError('Item not found', 404));
  }

  if (item.status !== 'open') {
    return next(new AppError('This item is no longer available for claims', 400));
  }

  if (item.user._id.toString() === req.user._id.toString()) {
    return next(new AppError('You cannot claim your own item', 400));
  }

  const existingClaim = await Claim.findOne({
    item: itemId,
    claimant: req.user._id,
    status: { $ne: 'rejected' },
  });
  if (existingClaim) {
    return next(new AppError('You have already claimed this item', 400));
  }

  const claim = await Claim.create({
    item: itemId,
    claimant: req.user._id,
    owner: item.user._id,
    description,
    verificationAnswer,
  });

  await Notification.create({
    user: item.user._id,
    type: 'claim',
    title: 'Item Found!',
    message: `Item "${item.title}" found by ${req.user.name}`,
    referenceId: item._id,
    referenceModel: 'Item',
  });

  try {
    await sendClaimNotification(item.user.email, item.title, req.user.name);
  } catch (err) {
    console.error('Claim notification email failed:', err.message);
  }

  const io = req.app.get('io');
  if (io) {
    io.to(item.user._id.toString()).emit('newClaim', { claimId: claim._id, itemTitle: item.title });
  }

  res.status(201).json({
    success: true,
    data: { claim },
  });
});

export const getItemClaims = catchAsync(async (req, res, next) => {
  const item = await Item.findById(req.params.itemId);
  if (!item) {
    return next(new AppError('Item not found', 404));
  }

  if (item.user.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    return next(new AppError('Only the item owner can view claims', 403));
  }

  const claims = await Claim.find({ item: req.params.itemId })
    .populate('claimant', 'name email profilePicture phone department')
    .sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    data: { claims },
  });
});

export const getMyClaims = catchAsync(async (req, res, next) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
  const skip = (page - 1) * limit;

  const [claims, total] = await Promise.all([
    Claim.find({ claimant: req.user._id })
      .populate('item', 'title images type status')
      .populate('owner', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Claim.countDocuments({ claimant: req.user._id }),
  ]);

  res.status(200).json({
    success: true,
    data: {
      claims,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    },
  });
});

export const updateClaimStatus = catchAsync(async (req, res, next) => {
  const { status } = req.body;
  if (!['approved', 'rejected'].includes(status)) {
    return next(new AppError('Status must be approved or rejected', 400));
  }

  const claim = await Claim.findById(req.params.id)
    .populate('item', 'title status user')
    .populate('claimant', 'name email');
  if (!claim) {
    return next(new AppError('Claim not found', 404));
  }

  if (claim.owner.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    return next(new AppError('Only the item owner can update claim status', 403));
  }

  let processedClaim;
  let resolvedItem;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      processedClaim = await Claim.findOneAndUpdate(
        { _id: claim._id, status: 'pending' },
        { $set: { status } },
        { new: true, session }
      )
        .populate('item', 'title status user')
        .populate('claimant', 'name email');

      if (!processedClaim) {
        throw new AppError('This claim has already been processed', 400);
      }

      claim.status = processedClaim.status;

      if (status === 'approved') {
        resolvedItem = await Item.findOneAndUpdate(
          { _id: claim.item._id, status: 'open' },
          { $set: { status: 'resolved' } },
          { new: true, session }
        );
        if (!resolvedItem) {
          throw new AppError('This item is no longer available', 400);
        }

        await awardPoints(claim.claimant._id, 'verified_return', `Item returned: ${resolvedItem.title}`, resolvedItem._id, 'Item', session);
        await awardPoints(claim.owner, 'successful_return', `Resolved item: ${resolvedItem.title}`, resolvedItem._id, 'Item', session);
      }
    });
  } catch (error) {
    return next(error instanceof AppError ? error : new AppError('Claim update failed', 500));
  } finally {
    await session.endSession();
  }

  await Notification.create({
    user: claim.claimant._id,
    type: 'claim_update',
    title: status === 'approved' ? 'Item Returned! 🎉' : 'Claim Rejected',
    message: status === 'approved'
      ? `You returned "${claim.item.title}" to its owner! +100 points earned!`
      : `Your claim for "${claim.item.title}" was rejected.`,
    referenceId: claim.item._id,
    referenceModel: 'Item',
  });

  await Notification.create({
    user: claim.owner,
    type: 'claim_update',
    title: status === 'approved' ? 'Item Found!' : 'Claim Rejected',
    message: status === 'approved'
      ? `"${claim.item.title}" was found by ${claim.claimant.name}! +50 points earned!`
      : `The claim by ${claim.claimant.name} for "${claim.item.title}" was rejected.`,
    referenceId: claim.item._id,
    referenceModel: 'Item',
  });

  const io = req.app.get('io');
  if (io) {
    io.to(claim.claimant._id.toString()).emit('claimUpdate', {
      claimId: claim._id,
      status,
      itemTitle: claim.item.title,
    });
    io.to(claim.owner.toString()).emit('claimUpdate', {
      claimId: claim._id,
      status,
      itemTitle: claim.item.title,
    });
  }

  res.status(200).json({
    success: true,
    data: { claim },
  });
});
