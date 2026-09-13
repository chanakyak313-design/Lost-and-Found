import Notification from '../models/Notification.js';
import catchAsync from '../utils/catchAsync.js';

export const getNotifications = catchAsync(async (req, res, next) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
  const skip = (page - 1) * limit;

  const [notifications, total] = await Promise.all([
    Notification.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Notification.countDocuments({ user: req.user._id }),
  ]);

  res.status(200).json({
    success: true,
    data: {
      notifications,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    },
  });
});

export const markAsRead = catchAsync(async (req, res, next) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id },
    { read: true },
    { new: true }
  );

  if (!notification) {
    return res.status(200).json({ success: true, data: null });
  }

  res.status(200).json({
    success: true,
    data: { notification },
  });
});

export const markAllAsRead = catchAsync(async (req, res, next) => {
  await Notification.updateMany(
    { user: req.user._id, read: false },
    { read: true }
  );

  res.status(200).json({
    success: true,
    message: 'All notifications marked as read',
  });
});

export const getUnreadCount = catchAsync(async (req, res, next) => {
  const count = await Notification.countDocuments({ user: req.user._id, read: false });

  res.status(200).json({
    success: true,
    data: { count },
  });
});
