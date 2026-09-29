import { validationResult } from 'express-validator';
import Item from '../models/Item.js';
import AppError from '../utils/AppError.js';
import catchAsync from '../utils/catchAsync.js';
import { analyzeImage } from '../services/geminiService.js';
import { cloudinary, uploadBuffer } from '../config/cloudinary.js';

export const getItems = catchAsync(async (req, res, next) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
  const skip = (page - 1) * limit;

  const filter = {};
  const [items, total] = await Promise.all([
    Item.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Item.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    data: {
      items,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    },
  });
});

export const createItem = catchAsync(async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(new AppError(errors.array().map((error) => error.msg).join(', '), 400));
  }

  const { type, title, description, category, dateOccurred, location, reward, images } = req.body;

  if (location && location.coordinates !== undefined) {
    const coordinates = location.coordinates;
    const validCoordinates = Array.isArray(coordinates) && coordinates.length === 2 && coordinates.every((coordinate) => Number.isFinite(Number(coordinate)));
    if (!validCoordinates || Number(coordinates[0]) < -180 || Number(coordinates[0]) > 180 || Number(coordinates[1]) < -90 || Number(coordinates[1]) > 90) {
      return next(new AppError('Location coordinates must be [longitude, latitude]', 400));
    }
  }

  const hasValidCoords = location?.coordinates?.length === 2
    && location.coordinates.every((coordinate) => coordinate !== null && coordinate !== undefined && Number.isFinite(Number(coordinate)));

  let uploadedImages = [];
  if (req.files?.length) {
    try {
      uploadedImages = await Promise.all(req.files.map(async (file) => {
        const result = await uploadBuffer(file.buffer);
        return { url: result.secure_url, publicId: result.public_id };
      }));
    } catch {
      return next(new AppError('Image storage is unavailable. Please try again.', 503));
    }
  }

  const item = await Item.create({
    type,
    title: title.trim(),
    description: description.trim(),
    category: category.trim(),
    dateOccurred,
    location: hasValidCoords ? location : undefined,
    reward: type === 'lost' ? reward : undefined,
    images: [...(Array.isArray(images) ? images : []), ...uploadedImages],
  });

  const imageUrls = item.images.map((image) => image?.url).filter(Boolean);
  try {
    const analysis = await analyzeImage(imageUrls);
    if (analysis) {
      item.aiAnalysis = analysis;
      if (analysis.category && analysis.category.toLowerCase() !== 'other') {
        item.category = analysis.category;
      }
      await item.save();
    }
  } catch (error) {
    console.error('AI image analysis failed:', error.message);
  }

  res.status(201).json({
    success: true,
    data: { item },
  });
});

export const getItem = catchAsync(async (req, res, next) => {
  const item = await Item.findById(req.params.id);
  if (!item) {
    return next(new AppError('Item not found', 404));
  }

  res.status(200).json({ success: true, data: { item } });
});

export const updateItem = catchAsync(async (req, res, next) => {
  const item = await Item.findById(req.params.id);
  if (!item) {
    return next(new AppError('Item not found', 404));
  }

  const allowedFields = ['type', 'title', 'description', 'category', 'location', 'reward', 'dateOccurred', 'status'];

  for (const field of allowedFields) {
    if (req.body[field] === undefined) continue;

    if (field === 'location' && typeof req.body.location === 'string') {
      try {
        item.location = JSON.parse(req.body.location);
      } catch {
        return next(new AppError('Invalid location format', 400));
      }
    } else {
      item[field] = req.body[field];
    }
  }

  if (req.files && req.files.length > 0) {
    let newImages = [];
    try {
      newImages = await Promise.all(req.files.map(async (file) => {
        const result = await uploadBuffer(file.buffer);
        return { url: result.secure_url, publicId: result.public_id };
      }));
    } catch {
      return next(new AppError('Image storage is unavailable. Please try again.', 503));
    }

    item.images = [...item.images, ...newImages];
  }

  await item.save();
  res.status(200).json({ success: true, data: { item } });
});

export const deleteItem = catchAsync(async (req, res, next) => {
  const item = await Item.findById(req.params.id);
  if (!item) {
    return next(new AppError('Item not found', 404));
  }

  if (item.images?.length) {
    for (const image of item.images) {
      if (image.publicId) {
        await cloudinary.uploader.destroy(image.publicId).catch(() => {});
      }
    }
  }

  await Item.findByIdAndDelete(req.params.id);
  res.status(200).json({ success: true, message: 'Item deleted successfully' });
});

export const markResolved = catchAsync(async (req, res, next) => {
  const item = await Item.findById(req.params.id);
  if (!item) {
    return next(new AppError('Item not found', 404));
  }

  if (item.status === 'resolved') {
    return next(new AppError('Item is already resolved', 400));
  }

  item.status = 'resolved';
  await item.save();

  res.status(200).json({ success: true, data: { item } });
});
