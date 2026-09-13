import { Router } from 'express';
import { createClaim, getItemClaims, getMyClaims, updateClaimStatus } from '../controllers/claimController.js';
import { protect } from '../middleware/auth.js';
import { createClaimValidation } from '../middleware/validate.js';

const router = Router();

router.post('/', protect, createClaimValidation, createClaim);
router.get('/item/:itemId', protect, getItemClaims);
router.get('/my', protect, getMyClaims);
router.put('/:id/status', protect, updateClaimStatus);

export default router;
