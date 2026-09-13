import AppError from '../utils/AppError.js';
import catchAsync from '../utils/catchAsync.js';
import { sendMessage, getMessages } from '../services/chatService.js';

function serviceErrorStatus(error) {
  if (error.message === 'Match not found') return 404;
  if (error.message.includes('Not authorized')) return 403;
  return 400;
}

export const handleGetMessages = catchAsync(async (req, res, next) => {
  try {
    const result = await getMessages(req.params.matchId, req.user._id, req.query.page, req.query.limit);
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    return next(new AppError(err.message, serviceErrorStatus(err)));
  }
});

export const handleSendMessage = catchAsync(async (req, res, next) => {
  const { message } = req.body;
  if (!message || !message.trim()) {
    return next(new AppError('Message is required', 400));
  }
  if (message.trim().length > 2000) {
    return next(new AppError('Message must be 2000 characters or fewer', 400));
  }
  try {
    const chatMessage = await sendMessage(req.params.matchId, req.user._id, message.trim());

    const io = req.app.get('io');
    if (io) {
      io.to(`match_${req.params.matchId}`).emit('chatMessage', {
        matchId: req.params.matchId,
        message: chatMessage,
      });
    }

    res.status(201).json({
      success: true,
      data: { message: chatMessage },
    });
  } catch (err) {
    return next(new AppError(err.message, serviceErrorStatus(err)));
  }
});
