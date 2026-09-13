import AppError from '../utils/AppError.js';
import catchAsync from '../utils/catchAsync.js';
import {
  getMatchesForUser,
  getMatchById,
  confirmByLostUser,
  confirmByFoundUser,
  scheduleHandover,
  confirmReturnByLostUser,
  confirmReturnByFoundUser,
  rejectMatch,
} from '../services/matchService.js';

function serviceErrorStatus(error) {
  if (error.message === 'Match not found') return 404;
  if (error.message.includes('Not authorized')) return 403;
  return 400;
}

export const getMyMatches = catchAsync(async (req, res, next) => {
  const result = await getMatchesForUser(req.user._id, req.query);
  res.status(200).json({
    success: true,
    data: result,
  });
});

export const getMatch = catchAsync(async (req, res, next) => {
  const match = await getMatchById(req.params.id, req.user._id);
  res.status(200).json({
    success: true,
    data: { match },
  });
});

export const handleConfirmLost = catchAsync(async (req, res, next) => {
  try {
    const match = await confirmByLostUser(req.params.id, req.user._id);
    const io = req.app.get('io');
    if (io) {
      io.to(match.lostUser.toString()).emit('matchConfirmed', { matchId: match._id, status: match.status, confirmedBy: 'lost' });
      io.to(match.foundUser.toString()).emit('matchConfirmed', { matchId: match._id, status: match.status, confirmedBy: 'lost' });
      if (match.status === 'both_confirmed') {
        io.to(match.lostUser.toString()).emit('bothConfirmed', { matchId: match._id });
        io.to(match.foundUser.toString()).emit('bothConfirmed', { matchId: match._id });
      }
    }
    res.status(200).json({ success: true, data: { match } });
  } catch (err) {
    return next(new AppError(err.message, serviceErrorStatus(err)));
  }
});

export const handleConfirmFound = catchAsync(async (req, res, next) => {
  try {
    const match = await confirmByFoundUser(req.params.id, req.user._id);
    const io = req.app.get('io');
    if (io) {
      io.to(match.lostUser.toString()).emit('matchConfirmed', { matchId: match._id, status: match.status, confirmedBy: 'found' });
      io.to(match.foundUser.toString()).emit('matchConfirmed', { matchId: match._id, status: match.status, confirmedBy: 'found' });
      if (match.status === 'both_confirmed') {
        io.to(match.lostUser.toString()).emit('bothConfirmed', { matchId: match._id });
        io.to(match.foundUser.toString()).emit('bothConfirmed', { matchId: match._id });
      }
    }
    res.status(200).json({ success: true, data: { match } });
  } catch (err) {
    return next(new AppError(err.message, serviceErrorStatus(err)));
  }
});

export const handleScheduleHandover = catchAsync(async (req, res, next) => {
  const { location } = req.body;
  if (!location) return next(new AppError('Handover location is required', 400));
  try {
    const match = await scheduleHandover(req.params.id, req.user._id, location);
    const io = req.app.get('io');
    if (io) {
      io.to(match.lostUser.toString()).emit('handoverScheduled', { matchId: match._id, location });
      io.to(match.foundUser.toString()).emit('handoverScheduled', { matchId: match._id, location });
    }
    res.status(200).json({ success: true, data: { match } });
  } catch (err) {
    return next(new AppError(err.message, serviceErrorStatus(err)));
  }
});

export const handleReturnLost = catchAsync(async (req, res, next) => {
  try {
    const match = await confirmReturnByLostUser(req.params.id, req.user._id);
    const io = req.app.get('io');
    if (io) {
      io.to(match.lostUser.toString()).emit('itemReturned', { matchId: match._id });
      io.to(match.foundUser.toString()).emit('itemReturned', { matchId: match._id });
      if (match.status === 'returned') {
        io.to(match.lostUser.toString()).emit('trustScoreUpdated', { userId: match.lostUser });
        io.to(match.foundUser.toString()).emit('trustScoreUpdated', { userId: match.foundUser });
      }
    }
    res.status(200).json({ success: true, data: { match } });
  } catch (err) {
    return next(new AppError(err.message, serviceErrorStatus(err)));
  }
});

export const handleReturnFound = catchAsync(async (req, res, next) => {
  try {
    const match = await confirmReturnByFoundUser(req.params.id, req.user._id);
    const io = req.app.get('io');
    if (io) {
      io.to(match.lostUser.toString()).emit('itemReturned', { matchId: match._id });
      io.to(match.foundUser.toString()).emit('itemReturned', { matchId: match._id });
      if (match.status === 'returned') {
        io.to(match.lostUser.toString()).emit('trustScoreUpdated', { userId: match.lostUser });
        io.to(match.foundUser.toString()).emit('trustScoreUpdated', { userId: match.foundUser });
      }
    }
    res.status(200).json({ success: true, data: { match } });
  } catch (err) {
    return next(new AppError(err.message, serviceErrorStatus(err)));
  }
});

export const handleRejectMatch = catchAsync(async (req, res, next) => {
  try {
    const match = await rejectMatch(req.params.id, req.user._id);
    const io = req.app.get('io');
    if (io) {
      io.to(match.lostUser.toString()).emit('matchRejected', { matchId: match._id });
      io.to(match.foundUser.toString()).emit('matchRejected', { matchId: match._id });
    }
    res.status(200).json({ success: true, data: { match } });
  } catch (err) {
    return next(new AppError(err.message, serviceErrorStatus(err)));
  }
});
