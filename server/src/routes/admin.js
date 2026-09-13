import { Router } from 'express';
import {
  getStats, getUsers, updateUserRole, deleteUser,
  getAllItems, deleteItemModerate,
  getAllClaims, moderateClaim,
  getMatchStatsAdmin, getMatchesAdmin, verifyMatchAdmin,
  getTrustRankings,
} from '../controllers/adminController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = Router();

router.use(protect, authorize('admin'));

router.get('/stats', getStats);
router.get('/users', getUsers);
router.put('/users/:id/role', updateUserRole);
router.delete('/users/:id', deleteUser);
router.get('/items', getAllItems);
router.delete('/items/:id', deleteItemModerate);
router.get('/claims', getAllClaims);
router.put('/claims/:id', moderateClaim);
router.get('/match-stats', getMatchStatsAdmin);
router.get('/matches', getMatchesAdmin);
router.put('/matches/:id/verify', verifyMatchAdmin);
router.get('/trust-rankings', getTrustRankings);

export default router;
