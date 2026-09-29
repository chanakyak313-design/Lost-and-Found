import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Item from './src/models/Item.js';

dotenv.config();
const api = process.env.ACCEPTANCE_API_URL || 'http://127.0.0.1:5001/api';
const title = `AI unavailable test item ${Date.now()}`;
let itemId;

async function request(path, options = {}) {
  const response = await fetch(api + path, options);
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

try {
  const unauth = await request('/upload', { method: 'POST' });

  const upload = new FormData();
  upload.append('images', new Blob([Buffer.from('not-an-image')], { type: 'text/plain' }), 'bad.txt');
  const invalidUpload = await request('/upload', { method: 'POST', body: upload });

  const oversized = new FormData();
  oversized.append('images', new Blob([Buffer.alloc(6 * 1024 * 1024)], { type: 'image/png' }), 'oversized.png');
  const oversizedUpload = await request('/upload', { method: 'POST', body: oversized });

  const item = await request('/items', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'lost',
      title,
      description: 'Text-only item must still be created when Gemini is unavailable',
      category: 'Accessories',
      dateOccurred: '2026-09-13',
      location: { name: 'Test campus' },
    }),
  });

  itemId = item.body.data?.item?._id;
  const analysis = item.body.data?.item?.aiAnalysis || {};

  console.log(JSON.stringify({
    emptyUploadStatus: unauth.status,
    invalidUploadStatus: invalidUpload.status,
    oversizedUploadStatus: oversizedUpload.status,
    itemCreationStatus: item.status,
    aiFallbackCategory: analysis.category,
    aiFallbackConfidence: analysis.confidence,
  }));
} finally {
  await mongoose.connect(process.env.MONGODB_URI);
  if (itemId) await Item.deleteOne({ _id: itemId });
  await mongoose.disconnect();
  console.log('integration failure test cleanup complete');
}
