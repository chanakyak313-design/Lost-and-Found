import { body } from 'express-validator';

export const createItemValidation = [
  body('type').isIn(['lost', 'found']).withMessage('Type must be lost or found'),
  body('title').trim().notEmpty().isLength({ max: 160 }).withMessage('Title is required and must be 160 characters or fewer'),
  body('description').trim().notEmpty().isLength({ max: 5000 }).withMessage('Description is required and must be 5000 characters or fewer'),
  body('category').trim().notEmpty().isLength({ max: 50 }).withMessage('Category is required and must be 50 characters or fewer'),
  body('dateOccurred').isISO8601().withMessage('Valid date is required'),
];
