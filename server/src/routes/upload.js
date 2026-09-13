import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import upload from '../middleware/upload.js';
import { uploadBuffer } from '../config/cloudinary.js';
import AppError from '../utils/AppError.js';

const router = Router();

router.post('/', protect, (req, res, next) => {
  upload.array('images', 5)(req, res, async (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return next(new AppError('File too large. Max size is 5MB.', 400));
      }
      if (err.code === 'LIMIT_FILE_COUNT') {
        return next(new AppError('Too many files. Max 5 images allowed.', 400));
      }
      return next(new AppError(err.message || 'Upload failed', 400));
    }

    if (!req.files || req.files.length === 0) {
      return next(new AppError('No files uploaded', 400));
    }

    try {
      const files = await Promise.all(req.files.map(async (file) => {
        const result = await uploadBuffer(file.buffer);
        return { url: result.secure_url, publicId: result.public_id };
      }));

      res.status(200).json({
        success: true,
        data: { files },
      });
    } catch (error) {
      return next(new AppError('Image storage is unavailable. Please try again.', 503));
    }
  });
});

export default router;
