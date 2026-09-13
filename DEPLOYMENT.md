# Foundly deployment

## 1. Deploy the API

Deploy `server/` to Render, Railway, Fly.io, or another Node 20 host.

- Build command: `npm ci`
- Start command: `npm start`
- Health check: `/api/health`
- Port: use the host-provided `PORT` value

Set these server environment variables:

```env
NODE_ENV=production
PORT=5000
MONGODB_URI=mongodb+srv://...
JWT_SECRET=<long-random-secret>
JWT_EXPIRES_IN=7d
CLIENT_URL=https://your-frontend.example.com
CAMPUS_EMAIL_DOMAIN=university.edu
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-2.5-flash
```

`CLIENT_URL` supports comma-separated origins when staging and production both need access.

## 2. Deploy the client

Deploy `client/` to Vercel, Netlify, or any static host.

- Install command: `npm ci`
- Build command: `npm run build`
- Output directory: `dist`

Set this client variable when the API has a separate domain:

```env
VITE_API_URL=https://your-api.example.com/api
```

The included `vercel.json` and `netlify.toml` keep React routes working after refresh.

## 3. Production checks

After both deployments:

1. Open `https://your-api.example.com/api/health` and confirm `status: ok` and `database: connected`.
2. Open the client and register a real account.
3. Create a found item with an image and confirm it appears in MongoDB and Cloudinary.
4. Test a claim using a second account.
5. Confirm the notification, match, chat, and reward flows.
6. Restrict MongoDB Atlas Network Access to the API host's egress IPs when your provider supports stable addresses.

Never commit `.env` files or production secrets.
