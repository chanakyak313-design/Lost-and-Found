import { Router } from 'express';
import { getItems, createItem, getItem, updateItem, deleteItem, markResolved } from '../controllers/itemController.js';
import upload from '../middleware/upload.js';
import { createItemValidation } from '../middleware/validate.js';

const router = Router();

router.get('/', getItems);
router.post('/', upload.array('images', 5), createItemValidation, createItem);
router.get('/:id', getItem);
router.put('/:id', upload.array('images', 5), updateItem);
router.delete('/:id', deleteItem);
router.put('/:id/mark-resolved', markResolved);

export default router;
