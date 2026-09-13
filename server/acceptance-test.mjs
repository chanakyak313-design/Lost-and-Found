import dotenv from 'dotenv';
import mongoose from 'mongoose';
import User from './src/models/User.js';
import Item from './src/models/Item.js';
import Claim from './src/models/Claim.js';
import Match from './src/models/Match.js';
import Reward from './src/models/Reward.js';
import Notification from './src/models/Notification.js';
import ChatMessage from './src/models/ChatMessage.js';

dotenv.config();
const api = process.env.ACCEPTANCE_API_URL || 'http://127.0.0.1:5001/api';
const suffix = Date.now().toString();
const users = {
  a: { name: 'Staging Lost User', email: `staging-a-${suffix}@${process.env.CAMPUS_EMAIL_DOMAIN.split(',')[0].trim().replace(/^@/, '')}`, password: 'strongpass123' },
  b: { name: 'Staging Found User', email: `staging-b-${suffix}@${process.env.CAMPUS_EMAIL_DOMAIN.split(',')[0].trim().replace(/^@/, '')}`, password: 'strongpass123' },
  c: { name: 'Staging Unrelated User', email: `staging-c-${suffix}@${process.env.CAMPUS_EMAIL_DOMAIN.split(',')[0].trim().replace(/^@/, '')}`, password: 'strongpass123' },
};
const createdIds = { users: [], items: [], claims: [], matches: [] };

async function call(path, options = {}) {
  const response = await fetch(api + path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}) },
  });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}
function expect(result, status, label) {
  if (result.status !== status) throw new Error(`${label}: expected ${status}, got ${result.status} ${JSON.stringify(result.body)}`);
}
function body(value) { return JSON.stringify(value); }
function log(label, result) { console.log(`${label}: ${result.status}`); }

try {
  const registered = {};
  for (const [key, user] of Object.entries(users)) {
    const result = await call('/auth/register', { method: 'POST', body: body(user) });
    expect(result, 201, `register ${key}`);
    registered[key] = result.body.data;
    createdIds.users.push(result.body.data.user.id);
  }
  const duplicate = await call('/auth/register', { method: 'POST', body: body(users.a) });
  expect(duplicate, 400, 'duplicate registration');
  log('registration and duplicate rejection', duplicate);

  const headers = { a: registered.a.token, b: registered.b.token, c: registered.c.token };
  const lost = await call('/items', { method: 'POST', token: headers.a, body: body({
    type: 'lost', title: 'Black leather wallet', description: 'Black leather wallet with a silver campus card near the college library', category: 'Accessories', dateOccurred: '2026-09-12', location: { name: 'College library' },
  }) });
  expect(lost, 201, 'lost item');
  const lostId = lost.body.data.item._id;
  createdIds.items.push(lostId);
  log('lost item creation', lost);

  const found = await call('/items', { method: 'POST', token: headers.b, body: body({
    type: 'found', title: 'Black leather wallet', description: 'Black leather wallet with a silver campus card found near the college library', category: 'Accessories', dateOccurred: '2026-09-12', location: { name: 'College library' },
  }) });
  expect(found, 201, 'found item');
  const foundId = found.body.data.item._id;
  createdIds.items.push(foundId);
  log('found item creation and matching attempt', found);

  const listed = await call('/items?limit=100');
  expect(listed, 200, 'public listing');
  if (!listed.body.data.items.some((item) => item._id === lostId) || !listed.body.data.items.some((item) => item._id === foundId)) throw new Error('created items missing from public listing');

  const matches = await call('/matches', { token: headers.a });
  expect(matches, 200, 'matches for user A');
  const match = matches.body.data.matches.find((entry) => String(entry.lostItem?._id || entry.lostItem) === lostId && String(entry.foundItem?._id || entry.foundItem) === foundId);
  if (!match) throw new Error('expected lost/found match was not created');
  createdIds.matches.push(match._id);
  console.log(`match score: ${match.score}`);

  const notificationsA = await call('/notifications', { token: headers.a });
  const notificationsB = await call('/notifications', { token: headers.b });
  expect(notificationsA, 200, 'notifications A');
  expect(notificationsB, 200, 'notifications B');
  if (!notificationsA.body.data.notifications.some((entry) => entry.referenceId === match._id)) throw new Error('user A missing match notification');
  if (!notificationsB.body.data.notifications.some((entry) => entry.referenceId === match._id)) throw new Error('user B missing match notification');

  const beforeRewards = await call('/rewards?limit=100', { token: headers.a });
  const confirmA = await call(`/matches/${match._id}/confirm-lost`, { method: 'PUT', token: headers.a, body: '{}' });
  expect(confirmA, 200, 'confirm lost');
  const confirmB = await call(`/matches/${match._id}/confirm-found`, { method: 'PUT', token: headers.b, body: '{}' });
  expect(confirmB, 200, 'confirm found');
  if (confirmB.body.data.match.status !== 'both_confirmed') throw new Error(`unexpected confirmed status ${confirmB.body.data.match.status}`);
  const repeatA = await call(`/matches/${match._id}/confirm-lost`, { method: 'PUT', token: headers.a, body: '{}' });
  expect(repeatA, 200, 'repeat confirm lost');
  const afterRewards = await call('/rewards?limit=100', { token: headers.a });
  const confirmedRewards = afterRewards.body.data.rewards.filter((entry) => entry.action === 'confirmed_match' && String(entry.referenceId) === match._id);
  if (confirmedRewards.length !== 1) throw new Error(`expected one confirmation reward, got ${confirmedRewards.length}`);
  console.log('confirmation status and idempotent reward: passed');

  const chatA = await call(`/matches/${match._id}/messages`, { method: 'POST', token: headers.a, body: body({ message: 'I can meet at the library desk.' }) });
  expect(chatA, 201, 'chat send A');
  const chatB = await call(`/matches/${match._id}/messages`, { token: headers.b });
  expect(chatB, 200, 'chat read B');
  if (!chatB.body.data.messages.some((entry) => entry.message === 'I can meet at the library desk.')) throw new Error('user B did not receive chat message');
  const chatC = await call(`/matches/${match._id}/messages`, { token: headers.c });
  expect(chatC, 403, 'unrelated chat access');
  console.log('private chat authorization: passed');

  const claim = await call('/claims', { method: 'POST', token: headers.a, body: body({ itemId: foundId, description: 'The wallet has my campus card inside.', verificationAnswer: 'Silver campus card' }) });
  expect(claim, 201, 'create claim');
  const claimId = claim.body.data.claim._id;
  createdIds.claims.push(claimId);
  const claimAgain = await call('/claims', { method: 'POST', token: headers.a, body: body({ itemId: foundId, description: 'Duplicate claim', verificationAnswer: 'Silver campus card' }) });
  expect(claimAgain, 400, 'duplicate claim');
  const unauthorizedApproval = await call(`/claims/${claimId}/status`, { method: 'PUT', token: headers.c, body: body({ status: 'approved' }) });
  expect(unauthorizedApproval, 403, 'unauthorized claim approval');
  const approval = await call(`/claims/${claimId}/status`, { method: 'PUT', token: headers.b, body: body({ status: 'approved' }) });
  expect(approval, 200, 'owner claim approval');
  const repeatApproval = await call(`/claims/${claimId}/status`, { method: 'PUT', token: headers.b, body: body({ status: 'approved' }) });
  expect(repeatApproval, 400, 'repeat claim approval');
  const claimAfter = await call('/claims', { method: 'POST', token: headers.a, body: body({ itemId: foundId, description: 'Claim after resolution', verificationAnswer: 'Silver campus card' }) });
  expect(claimAfter, 400, 'claim resolved item');
  console.log('claim authorization, approval, duplicate prevention: passed');

  const finalFound = await call(`/items/${foundId}`);
  expect(finalFound, 200, 'resolved found item');
  if (finalFound.body.data.item.status !== 'resolved') throw new Error('approved claim did not resolve found item');
  const ownerNotifications = await call('/notifications?limit=100', { token: headers.b });
  if (ownerNotifications.body.data.notifications.filter((entry) => entry.referenceId === foundId && entry.type === 'claim_update').length !== 1) throw new Error('unexpected owner claim notification count');
  const claimantNotifications = await call('/notifications?limit=100', { token: headers.a });
  if (claimantNotifications.body.data.notifications.filter((entry) => entry.referenceId === foundId && entry.type === 'claim_update').length !== 1) throw new Error('unexpected claimant claim notification count');

  console.log('ACCEPTANCE_CORE=PASS');
} catch (error) {
  console.error(`ACCEPTANCE_CORE=FAIL: ${error.message}`);
  process.exitCode = 1;
} finally {
  await mongoose.connect(process.env.MONGODB_URI);
  const userDocs = await User.find({ email: { $in: Object.values(users).map((user) => user.email) } }).select('_id');
  const userIds = userDocs.map((user) => user._id);
  await ChatMessage.deleteMany({ match: { $in: createdIds.matches } });
  await Notification.deleteMany({ user: { $in: userIds } });
  await Reward.deleteMany({ user: { $in: userIds } });
  await Claim.deleteMany({ _id: { $in: createdIds.claims } });
  await Match.deleteMany({ _id: { $in: createdIds.matches } });
  await Item.deleteMany({ _id: { $in: createdIds.items } });
  await User.deleteMany({ _id: { $in: userIds } });
  await mongoose.disconnect();
  console.log('acceptance cleanup complete');
}
