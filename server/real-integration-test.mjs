import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { cloudinary } from './src/config/cloudinary.js';
import User from './src/models/User.js';
import Item from './src/models/Item.js';

dotenv.config();
const api = 'http://127.0.0.1:5001/api';
const suffix = Date.now();
const campusDomain = process.env.CAMPUS_EMAIL_DOMAIN.split(',')[0].trim().replace(/^@/, '');
const email = `real-integration-${suffix}@${campusDomain}`;
let userId;
let itemId;
let publicId;

async function request(path, options = {}) {
  const response = await fetch(api + path, options);
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

try {
  const register = await request('/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Real Integration Test', email, password: 'strongpass123' }),
  });
  if (register.status !== 201) throw new Error(`registration failed: ${register.status}`);
  const token = register.body.data.token;
  userId = register.body.data.user.id;

  const form = new FormData();
  const sampleImage = await fetch('https://res.cloudinary.com/demo/image/upload/sample.jpg');
  if (!sampleImage.ok) throw new Error(`sample image download failed: ${sampleImage.status}`);
  form.append('images', new Blob([await sampleImage.arrayBuffer()], { type: 'image/jpeg' }), 'real-integration.jpg');
  const upload = await request('/upload', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
  if (upload.status !== 200 || !upload.body.data?.files?.[0]?.url) throw new Error(`Cloudinary upload failed: ${upload.status}`);
  const image = upload.body.data.files[0];
  publicId = image.publicId;
  console.log('CLOUDINARY_UPLOAD=PASS');

  const item = await request('/items', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ type: 'lost', title: 'Real Gemini integration wallet', description: 'Black leather wallet tested with the real AI integration', category: 'Accessories', dateOccurred: '2026-09-13', location: { name: 'Campus library' }, images: [image] }),
  });
  if (item.status !== 201) throw new Error(`item creation failed: ${item.status}`);
  itemId = item.body.data.item._id;
  const analysis = item.body.data.item.aiAnalysis;
  console.log(`GEMINI_RESPONSE;category=${analysis?.category || 'none'};colors=${analysis?.dominantColors?.length || 0};keywords=${analysis?.keywords?.length || 0};brand=${analysis?.brand || 'none'};confidence=${analysis?.confidence ?? 'none'}`);
  if (!analysis || analysis.confidence === 0) throw new Error('Gemini returned fallback analysis instead of a real analysis');
  console.log(`GEMINI_ANALYSIS=PASS;category=${Boolean(analysis.category)};colors=${Array.isArray(analysis.dominantColors) && analysis.dominantColors.length > 0};keywords=${Array.isArray(analysis.keywords) && analysis.keywords.length > 0};confidence=${analysis.confidence}`);

  const detail = await request(`/items/${itemId}`);
  if (detail.status !== 200 || detail.body.data.item.images?.[0]?.url !== image.url) throw new Error('stored image reference does not match upload');
  console.log('IMAGE_REFERENCE=PASS');
} catch (error) {
  console.error(`REAL_INTEGRATION=FAIL: ${error.message}`);
  process.exitCode = 1;
} finally {
  await mongoose.connect(process.env.MONGODB_URI);
  if (itemId) await Item.deleteOne({ _id: itemId });
  if (userId) await User.deleteOne({ _id: userId });
  if (publicId) await cloudinary.uploader.destroy(publicId).catch(() => {});
  await mongoose.disconnect();
  console.log('real integration cleanup complete');
}
