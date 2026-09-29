import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Item from './src/models/Item.js';

dotenv.config();
const api = process.env.ACCEPTANCE_API_URL || 'http://127.0.0.1:5001/api';
const suffix = Date.now().toString();
const titles = {
  lost: `Acceptance Lost ${suffix}`,
  found: `Acceptance Found ${suffix}`,
};
const createdIds = [];

async function call(path, options = {}) {
  const response = await fetch(api + path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

function expect(result, status, label) {
  if (result.status !== status) {
    throw new Error(`${label}: expected ${status}, got ${result.status} ${JSON.stringify(result.body)}`);
  }
}

try {
  const lost = await call('/items', {
    method: 'POST',
    body: JSON.stringify({
      type: 'lost',
      title: titles.lost,
      description: 'Black leather wallet with a silver campus card',
      category: 'Accessories',
      dateOccurred: '2026-09-12',
      location: { name: 'College library' },
    }),
  });
  expect(lost, 201, 'create lost item');
  createdIds.push(lost.body.data.item._id);

  const found = await call('/items', {
    method: 'POST',
    body: JSON.stringify({
      type: 'found',
      title: titles.found,
      description: 'Found near lecture hall A',
      category: 'Accessories',
      dateOccurred: '2026-09-13',
      location: { name: 'Lecture hall A' },
    }),
  });
  expect(found, 201, 'create found item');
  createdIds.push(found.body.data.item._id);

  const listed = await call('/items?limit=100&search=Acceptance');
  expect(listed, 200, 'list items');
  if (!listed.body.data.items.some((item) => item._id === createdIds[0])) {
    throw new Error('created lost item missing from listing');
  }

  const updated = await call(`/items/${createdIds[0]}`, {
    method: 'PUT',
    body: JSON.stringify({ description: 'Updated acceptance description', status: 'open' }),
  });
  expect(updated, 200, 'update item');

  const resolved = await call(`/items/${createdIds[0]}/mark-resolved`, { method: 'PUT', body: '{}' });
  expect(resolved, 200, 'mark resolved');
  if (resolved.body.data.item.status !== 'resolved') {
    throw new Error('item was not marked resolved');
  }

  const deleted = await call(`/items/${createdIds[1]}`, { method: 'DELETE' });
  expect(deleted, 200, 'delete item');

  console.log('ACCEPTANCE_CORE=PASS');
} catch (error) {
  console.error(`ACCEPTANCE_CORE=FAIL: ${error.message}`);
  process.exitCode = 1;
} finally {
  await mongoose.connect(process.env.MONGODB_URI);
  await Item.deleteMany({ _id: { $in: createdIds } });
  await mongoose.disconnect();
  console.log('acceptance cleanup complete');
}
