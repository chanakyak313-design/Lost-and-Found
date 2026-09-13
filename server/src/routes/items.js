import { Router } from 'express';
import { getItems, createItem, getItem, updateItem, deleteItem, markResolved } from '../controllers/itemController.js';
import { protect } from '../middleware/auth.js';
import upload from '../middleware/upload.js';
import { createItemValidation } from '../middleware/validate.js';

const router = Router();

router.get('/', getItems);
router.post('/', protect, upload.array('images', 5), createItemValidation, createItem);
router.get('/:id', getItem);
router.put('/:id', protect, updateItem);
router.delete('/:id', protect, deleteItem);
router.put('/:id/mark-resolved', protect, markResolved);

export default router;
