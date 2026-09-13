import { validationResult } from 'express-validator';
import User from '../models/User.js';
import AppError from '../utils/AppError.js';
import catchAsync from '../utils/catchAsync.js';

function signToken(user) {
  return user.generateAuthToken();
}

function isAllowedCampusEmail(email) {
  const configuredDomains = (process.env.CAMPUS_EMAIL_DOMAIN || '')
    .split(',')
    .map((domain) => domain.trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean);

  if (configuredDomains.length === 0) {
    return process.env.NODE_ENV !== 'production';
  }

  const domain = email.toLowerCase().split('@')[1];
  return Boolean(domain && configuredDomains.includes(domain));
}

export const register = catchAsync(async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(new AppError(errors.array().map((e) => e.msg).join(', '), 400));
  }

  const { name, email, password } = req.body;

  if (!isAllowedCampusEmail(email)) {
    return next(new AppError('Registration is limited to approved campus email domains', 403));
  }

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return next(new AppError('User with this email already exists', 400));
  }

  const user = await User.create({ name, email, password, isVerified: true });

  const token = signToken(user);

  res.status(201).json({
    success: true,
    data: {
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isVerified: user.isVerified,
      },
    },
  });
});

export const login = catchAsync(async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(new AppError(errors.array().map((e) => e.msg).join(', '), 400));
  }

  const { email, password } = req.body;

  const user = await User.findOne({ email }).select('+password');
  if (!user || !(await user.comparePassword(password))) {
    return next(new AppError('Invalid email or password', 401));
  }

  const token = signToken(user);

  res.status(200).json({
    success: true,
    data: {
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isVerified: user.isVerified,
        profilePicture: user.profilePicture,
        rewardPoints: user.rewardPoints,
        badges: user.badges,
      },
    },
  });
});

export const getMe = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.user._id);

  res.status(200).json({
    success: true,
    data: {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isVerified: user.isVerified,
        profilePicture: user.profilePicture,
        phone: user.phone,
        department: user.department,
        rewardPoints: user.rewardPoints,
        badges: user.badges,
      },
    },
  });
});

export const updateProfile = catchAsync(async (req, res, next) => {
  const { name, phone, department, profilePicture } = req.body;

  const user = await User.findById(req.user._id);
  if (name) user.name = name;
  if (phone !== undefined) user.phone = phone;
  if (department !== undefined) user.department = department;
  if (profilePicture) user.profilePicture = profilePicture;
  await user.save();

  res.status(200).json({
    success: true,
    data: {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isVerified: user.isVerified,
        profilePicture: user.profilePicture,
        phone: user.phone,
        department: user.department,
        rewardPoints: user.rewardPoints,
        badges: user.badges,
      },
    },
  });
});
