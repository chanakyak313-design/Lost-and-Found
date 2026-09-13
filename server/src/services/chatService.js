import ChatMessage from '../models/ChatMessage.js';
import Match from '../models/Match.js';

export async function sendMessage(matchId, senderId, message) {
  const match = await Match.findById(matchId);
  if (!match) throw new Error('Match not found');

  const uid = senderId.toString();
  if (match.lostUser.toString() !== uid && match.foundUser.toString() !== uid) {
    throw new Error('Not authorized to send messages in this match');
  }

  if (match.status === 'returned' || match.status === 'rejected' || match.status === 'cancelled') {
    throw new Error('Match is closed. Cannot send messages.');
  }

  if (match.status !== 'both_confirmed' && match.status !== 'handover_scheduled') {
    throw new Error('Chat is only available after both parties confirm the match.');
  }

  const chatMessage = await ChatMessage.create({
    match: matchId,
    sender: senderId,
    message,
  });

  const populated = await ChatMessage.findById(chatMessage._id)
    .populate('sender', 'name profilePicture');

  return populated;
}

export async function getMessages(matchId, userId, page = 1, limit = 50) {
  const match = await Match.findById(matchId);
  if (!match) throw new Error('Match not found');

  const uid = userId.toString();
  if (match.lostUser.toString() !== uid && match.foundUser.toString() !== uid) {
    throw new Error('Not authorized to view these messages');
  }

  const safePage = Math.max(parseInt(page, 10) || 1, 1);
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
  const skip = (safePage - 1) * safeLimit;

  const [messages, total] = await Promise.all([
    ChatMessage.find({ match: matchId })
      .populate('sender', 'name profilePicture')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit),
    ChatMessage.countDocuments({ match: matchId }),
  ]);

  return {
    messages: messages.reverse(),
    pagination: { page: safePage, limit: safeLimit, total, pages: Math.ceil(total / safeLimit) },
  };
}
