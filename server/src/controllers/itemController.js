import { validationResult } from 'express-validator';
import Item from '../models/Item.js';
import Notification from '../models/Notification.js';
import AppError from '../utils/AppError.js';
import catchAsync from '../utils/catchAsync.js';
import { analyzeImage } from '../services/geminiService.js';
import { findMatches } from '../services/matchingService.js';
import { awardPoints } from '../services/rewardService.js';
import { cloudinary, uploadBuffer } from '../config/cloudinary.js';

/**
 * Get all items with pagination and optional filters.
 */
export const getItems = catchAsync(async (req, res, next) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(
    Math.max(parseInt(req.query.limit, 10) || 20, 1),
    100
  );

  const skip = (page - 1) * limit;

  const filter = {};

  if (req.query.type) {
    filter.type = req.query.type;
  }

  if (req.query.category) {
    filter.category = req.query.category;
  }

  if (req.query.status) {
    filter.status = req.query.status;
  }

  if (req.query.search) {
    const sanitized = req.query.search.replace(
      /[.*+?^${}()|[\]\\]/g,
      '\\$&'
    );

    filter.$or = [
      {
        title: {
          $regex: sanitized,
          $options: 'i',
        },
      },
      {
        description: {
          $regex: sanitized,
          $options: 'i',
        },
      },
    ];
  }

  const [items, total] = await Promise.all([
    Item.find(filter)
      .populate('user', 'name email profilePicture')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),

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

/**
 * Create a new lost/found item.
 *
 * Flow:
 * 1. Validate request.
 * 2. Create item.
 * 3. Analyze uploaded images with Gemini.
 * 4. Save AI analysis BEFORE matching.
 * 5. Run matching engine.
 * 6. Award points.
 */
export const createItem = catchAsync(async (req, res, next) => {
  // Validate request body.
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return next(
      new AppError(
        errors
          .array()
          .map((error) => error.msg)
          .join(', '),
        400
      )
    );
  }

  const {
    type,
    title,
    description,
    category,
    dateOccurred,
    location,
    reward,
    images,
  } = req.body;

  if (location && location.coordinates !== undefined) {
    const coordinates = location.coordinates;
    const validCoordinates = Array.isArray(coordinates) && coordinates.length === 2 && coordinates.every((coordinate) => Number.isFinite(Number(coordinate)));
    if (!validCoordinates || Number(coordinates[0]) < -180 || Number(coordinates[0]) > 180 || Number(coordinates[1]) < -90 || Number(coordinates[1]) > 90) {
      return next(new AppError('Location coordinates must be [longitude, latitude]', 400));
    }
  }

  // Validate GeoJSON coordinates.
  const hasValidCoords =
    location?.coordinates?.length === 2 &&
    location.coordinates.every(
      (coordinate) =>
        coordinate !== null &&
        coordinate !== undefined &&
        Number.isFinite(Number(coordinate))
    );

  let uploadedImages = [];
  if (req.files?.length) {
    try {
      uploadedImages = await Promise.all(req.files.map(async (file) => {
        const result = await uploadBuffer(file.buffer);
        return { url: result.secure_url, publicId: result.public_id };
      }));
    } catch (error) {
      return next(new AppError('Image storage is unavailable. Please try again.', 503));
    }
  }

  // Create the item first.
  const item = await Item.create({
    user: req.user._id,
    type,
    title: title.trim(),
    description: description.trim(),
    category: category.trim(),
    dateOccurred,
    location: hasValidCoords ? location : undefined,
    reward: type === 'lost' ? reward : undefined,
    images: [...(Array.isArray(images) ? images : []), ...uploadedImages],
  });

  /*
   * ---------------------------------------------------------
   * AI IMAGE ANALYSIS
   * ---------------------------------------------------------
   */

  const imageUrls = (Array.isArray(images) ? images : [])
    .map((image) => image?.url)
    .filter(Boolean);

  let analysis = null;

  try {
    analysis = await analyzeImage(imageUrls);
  } catch (error) {
    // AI analysis should never prevent item creation.
    console.error('AI image analysis failed:', error.message);
  }

  if (analysis) {
    item.aiAnalysis = analysis;

    /*
     * Only allow Gemini to replace the user's category when
     * it returned a meaningful category.
     *
     * "other" is treated as an unhelpful fallback.
     */
    if (
      analysis.category &&
      analysis.category.toLowerCase() !== 'other'
    ) {
      item.category = analysis.category;
    }
  }

  /*
   * IMPORTANT:
   *
   * Save the AI analysis BEFORE running findMatches().
   *
   * Otherwise MongoDB still contains the item without its
   * aiAnalysis data when another item tries to compare against it.
   */
  await item.save();

  /*
   * ---------------------------------------------------------
   * AUTOMATIC MATCHING
   * ---------------------------------------------------------
   */

  const io = req.app.get('io');

  let matches = [];

  try {
    matches = await findMatches(item, io);
  } catch (error) {
    // Matching failure should not make item creation fail.
    console.error('Automatic matching failed:', error.message);
  }

  /*
   * Notify the user that the item was created.
   */
  if (io) {
    io.to(item.user.toString()).emit('itemCreated', {
      itemId: item._id,
    });
  }

  /*
   * ---------------------------------------------------------
   * REWARDS
   * ---------------------------------------------------------
   */

  const action =
    type === 'found'
      ? 'report_found'
      : 'create_item';

  await awardPoints(
    req.user._id,
    action,
    `Created ${type} item: ${title}`,
    item._id,
    'Item'
  );

  /*
   * ---------------------------------------------------------
   * RESPONSE
   * ---------------------------------------------------------
   */

  res.status(201).json({
    success: true,
    data: {
      item,
      matches: matches.map((match) => ({
        item: match.item,
        score: match.score,
        reasons: match.reasons,
      })),
    },
  });
});

/**
 * Get a single item.
 */
export const getItem = catchAsync(async (req, res, next) => {
  const item = await Item.findById(req.params.id)
    .populate(
      'user',
      'name email profilePicture phone department'
    );

  if (!item) {
    return next(
      new AppError('Item not found', 404)
    );
  }

  res.status(200).json({
    success: true,
    data: {
      item,
    },
  });
});

/**
 * Update an item.
 */
export const updateItem = catchAsync(async (req, res, next) => {
  const item = await Item.findById(req.params.id);

  if (!item) {
    return next(
      new AppError('Item not found', 404)
    );
  }

  // Only the owner or an admin can update the item.
  if (
    item.user.toString() !== req.user._id.toString() &&
    req.user.role !== 'admin'
  ) {
    return next(
      new AppError(
        'You can only update your own items',
        403
      )
    );
  }

  const allowedFields = [
    'title',
    'description',
    'category',
    'location',
    'reward',
  ];

  for (const field of allowedFields) {
    if (req.body[field] === undefined) {
      continue;
    }

    if (
      field === 'location' &&
      typeof req.body.location === 'string'
    ) {
      try {
        item.location = JSON.parse(
          req.body.location
        );
      } catch {
        return next(
          new AppError(
            'Invalid location format',
            400
          )
        );
      }
    } else {
      item[field] = req.body[field];
    }
  }

  // Add newly uploaded images.
  if (req.files && req.files.length > 0) {
    const newImages = req.files.map((file) => ({
      url: file.path,
      publicId: file.filename,
    }));

    item.images = [
      ...item.images,
      ...newImages,
    ];
  }

  await item.save();

  res.status(200).json({
    success: true,
    data: {
      item,
    },
  });
});

/**
 * Delete an item.
 */
export const deleteItem = catchAsync(async (req, res, next) => {
  const item = await Item.findById(req.params.id);

  if (!item) {
    return next(
      new AppError('Item not found', 404)
    );
  }

  // Only owner or admin can delete.
  if (
    item.user.toString() !== req.user._id.toString() &&
    req.user.role !== 'admin'
  ) {
    return next(
      new AppError(
        'You can only delete your own items',
        403
      )
    );
  }

  /*
   * Remove uploaded images from Cloudinary.
   */
  if (item.images && item.images.length > 0) {
    for (const image of item.images) {
      if (image.publicId) {
        await cloudinary.uploader
          .destroy(image.publicId)
          .catch(() => {});
      }
    }
  }

  await Item.findByIdAndDelete(req.params.id);

  res.status(200).json({
    success: true,
    message: 'Item deleted successfully',
  });
});

/**
 * Mark an item as resolved.
 */
export const markResolved = catchAsync(
  async (req, res, next) => {
    const item = await Item.findById(
      req.params.id
    );

    if (!item) {
      return next(
        new AppError(
          'Item not found',
          404
        )
      );
    }

    if (
      item.user.toString() !==
      req.user._id.toString()
    ) {
      return next(
        new AppError(
          'You can only mark your own items as resolved',
          403
        )
      );
    }

    if (item.status === 'resolved') {
      return next(
        new AppError(
          'Item is already resolved',
          400
        )
      );
    }

    item.status = 'resolved';

    await item.save();

    /*
     * Notify owner.
     */
    await Notification.create({
      user: req.user._id,
      type: 'resolution',
      title: 'Item Found!',
      message: `You confirmed "${item.title}" as found! +50 points earned!`,
      referenceId: item._id,
      referenceModel: 'Item',
    });

    await awardPoints(
      req.user._id,
      'successful_return',
      `Resolved item: ${item.title}`,
      item._id,
      'Item'
    );

    /*
     * If this item has a matched item,
     * resolve the other item as well.
     */
    let otherUserId = null;

    if (item.matchedItem) {
      const matchedItem =
        await Item.findById(
          item.matchedItem
        ).select('user status');

      if (matchedItem) {
        matchedItem.status = 'resolved';

        await matchedItem.save();

        otherUserId =
          matchedItem.user;

        await Notification.create({
          user: matchedItem.user,
          type: 'resolution',
          title: 'Item Returned! 🎉',
          message: `Your found item "${item.title}" was claimed by the owner! +100 points earned!`,
          referenceId: item._id,
          referenceModel: 'Item',
        });

        await awardPoints(
          matchedItem.user,
          'verified_return',
          `Matched item resolved: ${item.title}`,
          item._id,
          'Item'
        );
      }
    }

    /*
     * Real-time notifications.
     */
    const io = req.app.get('io');

    if (io) {
      io.to(
        item.user.toString()
      ).emit('itemResolved', {
        itemId: item._id,
      });

      if (otherUserId) {
        io.to(
          otherUserId.toString()
        ).emit('itemResolved', {
          itemId: item._id,
        });
      }
    }

    res.status(200).json({
      success: true,
      data: {
        item,
      },
    });
  }
);