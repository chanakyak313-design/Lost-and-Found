import dotenv from 'dotenv';
import mongoose from 'mongoose';
import User from './src/models/User.js';
import Item from './src/models/Item.js';
import Match from './src/models/Match.js';
import Reward from './src/models/Reward.js';
import Notification from './src/models/Notification.js';
import Claim from './src/models/Claim.js';
import ChatMessage from './src/models/ChatMessage.js';

dotenv.config();
const api = process.env.ACCEPTANCE_API_URL || 'http://127.0.0.1:5001/api';
const suffix = Date.now().toString();
const campusDomain = process.env.CAMPUS_EMAIL_DOMAIN.split(',')[0].trim().replace(/^@/, '');
const emails = [`return-a-${suffix}@${campusDomain}`, `return-b-${suffix}@${campusDomain}`];
const created = { users: [], items: [], matches: [] };
async function call(path, options = {}) { const response = await fetch(api + path, { ...options, headers: { 'Content-Type': 'application/json', ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}) } }); return { status: response.status, body: await response.json().catch(() => ({})) }; }
function expect(result, status, label) { if (result.status !== status) throw new Error(`${label}: expected ${status}, got ${result.status} ${JSON.stringify(result.body)}`); }
try {
  const accounts = [];
  for (let index = 0; index < emails.length; index += 1) {
    const result = await call('/auth/register', { method: 'POST', body: JSON.stringify({ name: `Return User ${index}`, email: emails[index], password: 'strongpass123' }) });
    expect(result, 201, 'return registration'); accounts.push(result.body.data); created.users.push(result.body.data.user.id);
  }
  const lost = await call('/items', { method: 'POST', token: accounts[0].token, body: JSON.stringify({ type: 'lost', title: 'Return test headphones', description: 'Black wireless headphones with a silver case', category: 'Electronics', dateOccurred: '2026-09-13', location: { name: 'Return test library' } }) });
  const found = await call('/items', { method: 'POST', token: accounts[1].token, body: JSON.stringify({ type: 'found', title: 'Return test headphones', description: 'Black wireless headphones with a silver case', category: 'Electronics', dateOccurred: '2026-09-13', location: { name: 'Return test library' } }) });
  expect(lost, 201, 'return lost item'); expect(found, 201, 'return found item');
  created.items.push(lost.body.data.item._id, found.body.data.item._id);
  const matches = await call('/matches', { token: accounts[0].token }); expect(matches, 200, 'return matches');
  const match = matches.body.data.matches.find((entry) => String(entry.lostItem._id) === created.items[0] && String(entry.foundItem._id) === created.items[1]);
  if (!match) throw new Error('return match missing'); created.matches.push(match._id);
  expect(await call(`/matches/${match._id}/confirm-lost`, { method: 'PUT', token: accounts[0].token, body: '{}' }), 200, 'confirm return lost');
  expect(await call(`/matches/${match._id}/confirm-found`, { method: 'PUT', token: accounts[1].token, body: '{}' }), 200, 'confirm return found');
  const handover = await call(`/matches/${match._id}/handover`, { method: 'PUT', token: accounts[0].token, body: JSON.stringify({ location: 'Library service desk' }) });
  expect(handover, 200, 'schedule handover');
  const firstReturn = await call(`/matches/${match._id}/return-lost`, { method: 'PUT', token: accounts[0].token, body: '{}' }); expect(firstReturn, 200, 'lost user return confirmation');
  const finalReturn = await call(`/matches/${match._id}/return-found`, { method: 'PUT', token: accounts[1].token, body: '{}' }); expect(finalReturn, 200, 'found user return confirmation');
  if (finalReturn.body.data.match.status !== 'returned') throw new Error('match did not enter returned state');
  const repeatReturn = await call(`/matches/${match._id}/return-found`, { method: 'PUT', token: accounts[1].token, body: '{}' }); expect(repeatReturn, 400, 'duplicate return confirmation');
  const lostAfter = await call(`/items/${created.items[0]}`); const foundAfter = await call(`/items/${created.items[1]}`); expect(lostAfter, 200, 'lost item after return'); expect(foundAfter, 200, 'found item after return');
  if (lostAfter.body.data.item.status !== 'resolved' || foundAfter.body.data.item.status !== 'resolved') throw new Error('returned items were not resolved');
  const rewards = await call('/rewards?limit=100', { token: accounts[1].token }); expect(rewards, 200, 'return rewards');
  if (rewards.body.data.rewards.filter((entry) => entry.action === 'successful_return' && String(entry.referenceId) === match._id).length !== 1) throw new Error('return reward duplicated or missing');
  console.log('RETURN_HANDOVER=PASS');
} catch (error) { console.error(`RETURN_HANDOVER=FAIL: ${error.message}`); process.exitCode = 1; }
finally {
  await mongoose.connect(process.env.MONGODB_URI); const userDocs = await User.find({ email: { $in: emails } }).select('_id'); const ids = userDocs.map((user) => user._id);
  await ChatMessage.deleteMany({ match: { $in: created.matches } }); await Notification.deleteMany({ user: { $in: ids } }); await Reward.deleteMany({ user: { $in: ids } }); await Claim.deleteMany({ item: { $in: created.items } }); await Match.deleteMany({ _id: { $in: created.matches } }); await Item.deleteMany({ _id: { $in: created.items } }); await User.deleteMany({ _id: { $in: ids } }); await mongoose.disconnect(); console.log('return acceptance cleanup complete');
}
