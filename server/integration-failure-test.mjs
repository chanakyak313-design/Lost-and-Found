import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from './src/models/User.js';
import Item from './src/models/Item.js';

dotenv.config();
const api = process.env.ACCEPTANCE_API_URL || 'http://127.0.0.1:5001/api';
const campusDomain = process.env.CAMPUS_EMAIL_DOMAIN.split(',')[0].trim().replace(/^@/, '');
const email = `integration-failure-${Date.now()}@${campusDomain}`;
let userId;
async function request(path, options = {}) {
  const response = await fetch(api + path, options);
  return { status: response.status, body: await response.json().catch(() => ({})) };
}
try {
  const register = await request('/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Integration Failure Test', email, password: 'strongpass123' }) });
  const token = register.body.data.token;
  userId = register.body.data.user.id;
  const unauth = await request('/upload', { method: 'POST' });
  const upload = new FormData();
  upload.append('images', new Blob([Buffer.from('not-an-image')], { type: 'text/plain' }), 'bad.txt');
  const invalidUpload = await request('/upload', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: upload });
  const oversized = new FormData();
  oversized.append('images', new Blob([Buffer.alloc(6 * 1024 * 1024)], { type: 'image/png' }), 'oversized.png');
  const oversizedUpload = await request('/upload', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: oversized });
  const validUpload = new FormData();
  validUpload.append('images', new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')], { type: 'image/png' }), 'valid.png');
  const unavailableCloudinary = await request('/upload', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: validUpload });
  const item = await request('/items', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ type: 'lost', title: 'AI unavailable test item', description: 'Text-only item must still be created when Gemini is unavailable', category: 'Accessories', dateOccurred: '2026-09-13', location: { name: 'Test campus' } }) });
  const analysis = item.body.data?.item?.aiAnalysis || {};
  console.log(JSON.stringify({ unauthUploadStatus: unauth.status, invalidUploadStatus: invalidUpload.status, oversizedUploadStatus: oversizedUpload.status, unavailableCloudinaryStatus: unavailableCloudinary.status, itemCreationStatus: item.status, aiFallbackCategory: analysis.category, aiFallbackConfidence: analysis.confidence }));
} finally {
  await mongoose.connect(process.env.MONGODB_URI);
  if (userId) { await Item.deleteMany({ user: userId }); await User.deleteOne({ _id: userId }); }
  await mongoose.disconnect();
  console.log('integration failure test cleanup complete');
}
