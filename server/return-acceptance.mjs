import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Item from './src/models/Item.js';

dotenv.config();
const api = process.env.ACCEPTANCE_API_URL || 'http://127.0.0.1:5001/api';
const suffix = Date.now().toString();
const titles = [`Return Flow Lost ${suffix}`, `Return Flow Found ${suffix}`];
const created = [];

async function call(path, options = {}) {
  const response = await fetch(api + path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

function expect(result, status, label) {
  if (result.status !== status) throw new Error(`${label}: expected ${status}, got ${result.status} ${JSON.stringify(result.body)}`);
}

try {
  const lost = await call('/items', { method: 'POST', body: JSON.stringify({ type: 'lost', title: titles[0], description: 'Black wireless headphones', category: 'Electronics', dateOccurred: '2026-09-13', location: { name: 'Library' } }) });
  const found = await call('/items', { method: 'POST', body: JSON.stringify({ type: 'found', title: titles[1], description: 'Headphones near library desk', category: 'Electronics', dateOccurred: '2026-09-13', location: { name: 'Library' } }) });
  expect(lost, 201, 'create lost');
  expect(found, 201, 'create found');
  created.push(lost.body.data.item._id, found.body.data.item._id);

  const electronics = await call('/items?category=Electronics&limit=100');
  expect(electronics, 200, 'filter by category');
  if (!electronics.body.data.items.some((item) => item._id === created[1])) throw new Error('filtered listing missing found item');

  const resolveLost = await call(`/items/${created[0]}/mark-resolved`, { method: 'PUT', body: '{}' });
  const resolveFound = await call(`/items/${created[1]}/mark-resolved`, { method: 'PUT', body: '{}' });
  expect(resolveLost, 200, 'resolve lost');
  expect(resolveFound, 200, 'resolve found');
  if (resolveFound.body.data.item.status !== 'resolved') throw new Error('found item not resolved');

  const duplicateResolve = await call(`/items/${created[1]}/mark-resolved`, { method: 'PUT', body: '{}' });
  expect(duplicateResolve, 400, 'duplicate resolve blocked');

  console.log('RETURN_HANDOVER=PASS');
} catch (error) {
  console.error(`RETURN_HANDOVER=FAIL: ${error.message}`);
  process.exitCode = 1;
} finally {
  await mongoose.connect(process.env.MONGODB_URI);
  await Item.deleteMany({ _id: { $in: created } });
  await mongoose.disconnect();
  console.log('return acceptance cleanup complete');
}
