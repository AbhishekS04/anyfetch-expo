# AnyFetch Architecture & Development Plan

## Tech Stack & Versions
- Mobile App: React Native `0.86.3` / Expo SDK `57.0.27` / React `19.2.3`
- Cloud API Engine: Node.js `20.x` / Express `4.21.2` / `ffmpeg-static` `5.2.0` / TypeScript `5.7.2`
- Deployment Targets: Voroa (`https://app.getvoroa.com/`) / Render / Docker

## Project Phases & Status

- [x] **Phase 1: Native Liquid Glass Carousel & Downloads**
  - Three.js scene graph, dual-pass FBO, momentum layout
  - Downloads management screen and floating navigation dock

- [x] **Phase 2: AnyFetch Cloud API Engine (`server/`)**
  - [x] Zero-disk streaming multiplexer (`server/src/muxer.ts`) with in-memory FFmpeg pipes (`pipe:1`)
  - [x] YouTube InnerTube Android extractor with 1080p HD muxed streams and MP3 320k audio
  - [x] Instagram high-res Reels, Posts, and Carousels extractor
  - [x] Watermark-free TikTok HD video and photo carousel extractor
  - [x] Twitter / X high-bitrate video variants and multi-photo extractor
  - [x] Reddit video + DASH audio muxing and gallery carousel extractor
  - [x] Pinterest shortlink and high-res video extractor
  - [x] Production Dockerfile and `.env.example`

- [x] **Phase 3: Automated Keep-Alive Bots (24/7 Zero Sleep)**
  - [x] Server-side heartbeat worker (`server/src/keepAlive.ts`) pinging `/health` every 10 min
  - [x] External GitHub Actions ping workflow (`.github/workflows/keepalive.yml`) scheduled every 10 min (`*/10 * * * *`)

- [x] **Phase 4: Mobile App Hybrid Integration (`anyfetch-expo`)**
  - [x] Cloud API service client (`src/services/anyfetchApi.ts`) with latency measurement & health checking
  - [x] Smart Hybrid dispatcher (`src/extractors/index.ts`) prioritizing Cloud Engine with instant on-device fallback
  - [x] Expanded platform detection for TikTok and Reddit (`src/utils/url.ts`, `src/theme/platformColors.ts`)
  - [x] Settings screen UI drawer (`src/screens/SettingsScreen.tsx`) with live status badge, test button, and endpoint switcher

- [x] **Phase 5: Pre-Flight Audit & Verification**
  - [x] Mobile app typecheck: `npm run typecheck` (0 errors)
  - [x] Server build: `npm run build` in `server/` (0 errors)
  - [x] Verified local server boot and `/health` response (66MB RAM, 200 OK)

---

## How to Deploy to Voroa (`https://app.getvoroa.com/`)

1. **Connect GitHub**:
   - Go to [app.getvoroa.com](https://app.getvoroa.com/) and create a new **Web Service**.
   - Select repository: `AbhishekS04/anyfetch-expo`.

2. **Configure Service**:
   - **Root Directory**: `server`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - *(Or select Docker and use the provided `server/Dockerfile`)*

3. **Set Environment Variables**:
   - `PORT`: `3000` (or Voroa default)
   - `EXTERNAL_URL`: `https://your-app-name.getvoroa.com`

4. **Activate Keep-Alive**:
   - In GitHub repository settings: `Settings` ➔ `Secrets and variables` ➔ `Actions` ➔ `New repository secret`.
   - Name: `ANYFETCH_API_URL`
   - Value: `https://your-app-name.getvoroa.com`
   - The keep-alive bot will automatically ping your service every 10 minutes to prevent sleep!

5. **Connect Mobile App**:
   - Open AnyFetch on your phone.
   - Go to **Settings (⚙️)** ➔ **Downloader Engine & Cloud Accelerator**.
   - Tap **Service Endpoint**, paste your URL (`https://your-app-name.getvoroa.com`), and tap **Save**.
