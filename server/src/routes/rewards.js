import { Router } from 'express';
import { getRewards, getBadgesController, getLeaderboard } from '../controllers/rewardController.js';
import { protect } from '../middleware/auth.js';

const router = Router();

router.get('/', protect, getRewards);
router.get('/badges', protect, getBadgesController);
router.get('/leaderboard', getLeaderboard);

export default router;
