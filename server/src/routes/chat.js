import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import {
  handleGetMessages,
  handleSendMessage,
} from '../controllers/chatController.js';

const router = Router();

router.use(protect);

router.get('/matches/:matchId/messages', handleGetMessages);
router.post('/matches/:matchId/messages', handleSendMessage);

export default router;
