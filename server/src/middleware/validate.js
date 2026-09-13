import { body } from 'express-validator';

export const registerValidation = [
  body('name').trim().notEmpty().isLength({ max: 100 }).withMessage('Name is required and must be 100 characters or fewer'),
  body('email').isEmail().withMessage('Please provide a valid email'),
  body('password').isLength({ min: 8, max: 128 }).withMessage('Password must be between 8 and 128 characters'),
];

export const loginValidation = [
  body('email').isEmail().withMessage('Please provide a valid email'),
  body('password').notEmpty().withMessage('Password is required'),
];

export const createItemValidation = [
  body('type').isIn(['lost', 'found']).withMessage('Type must be lost or found'),
  body('title').trim().notEmpty().isLength({ max: 160 }).withMessage('Title is required and must be 160 characters or fewer'),
  body('description').trim().notEmpty().isLength({ max: 5000 }).withMessage('Description is required and must be 5000 characters or fewer'),
  body('category').trim().notEmpty().isLength({ max: 50 }).withMessage('Category is required and must be 50 characters or fewer'),
  body('dateOccurred').isISO8601().withMessage('Valid date is required'),
];

export const createClaimValidation = [
  body('description').trim().notEmpty().isLength({ max: 2000 }).withMessage('Description is required and must be 2000 characters or fewer'),
  body('verificationAnswer').trim().notEmpty().isLength({ max: 500 }).withMessage('Verification answer is required and must be 500 characters or fewer'),
];
