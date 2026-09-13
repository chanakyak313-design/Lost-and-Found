import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import {
  getMyMatches,
  getMatch,
  handleConfirmLost,
  handleConfirmFound,
  handleScheduleHandover,
  handleReturnLost,
  handleReturnFound,
  handleRejectMatch,
} from '../controllers/matchController.js';

const router = Router();

router.use(protect);

router.get('/', getMyMatches);
router.get('/:id', getMatch);
router.put('/:id/confirm-lost', handleConfirmLost);
router.put('/:id/confirm-found', handleConfirmFound);
router.put('/:id/handover', handleScheduleHandover);
router.put('/:id/return-lost', handleReturnLost);
router.put('/:id/return-found', handleReturnFound);
router.put('/:id/reject', handleRejectMatch);

export default router;
