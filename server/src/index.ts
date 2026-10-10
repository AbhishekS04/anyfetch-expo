import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { extractYouTubeServer } from './extractors/youtube';
import { extractInstagramServer } from './extractors/instagram';
import { extractTikTokServer } from './extractors/tiktok';
import { extractTwitterServer } from './extractors/twitter';
import { extractRedditServer } from './extractors/reddit';
import { extractPinterestServer } from './extractors/pinterest';
import { streamMux } from './muxer';
import { startKeepAlive } from './keepAlive';
import { ExtractedMediaResponse } from './types';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const EXTERNAL_URL = process.env.EXTERNAL_URL || '';

app.set('trust proxy', 1);
app.use(cors());
app.use(express.json());

// In-memory cache for ultra-fast repeated requests (TTL: 30 minutes)
interface CacheEntry {
  data: ExtractedMediaResponse;
  expiresAt: number;
}
const cache = new Map<string, CacheEntry>();

function getCached(url: string): ExtractedMediaResponse | null {
  const entry = cache.get(url);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(url);
    return null;
  }
  return entry.data;
}

function setCache(url: string, data: ExtractedMediaResponse, ttlMinutes = 30) {
  // Cap cache size to 1000 items to prevent memory bloat
  if (cache.size > 1000) {
    const firstKey = cache.keys().next().value;
    if (firstKey) cache.delete(firstKey);
  }
  cache.set(url, {
    data,
    expiresAt: Date.now() + ttlMinutes * 60 * 1000,
  });
}

/**
 * Health check & Keep-alive endpoint
 */
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'anyfetch-api',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
  });
});

/**
 * Primary Media Resolution Endpoint
 * POST /api/resolve
 * Body: { "url": "https://..." }
 */
app.post('/api/resolve', async (req: Request, res: Response) => {
  const { url } = req.body;

  if (!url || typeof url !== 'string') {
    res.status(400).json({ success: false, error: 'A valid "url" parameter is required' });
    return;
  }

  const cleanUrl = url.trim();

  // Check cache
  const cached = getCached(cleanUrl);
  if (cached) {
    res.json({ ...cached, cached: true });
    return;
  }

  // Derive hostUrl for streaming endpoints (always force HTTPS in cloud/production)
  let hostUrl = EXTERNAL_URL?.replace(/\/+$/, '');
  if (!hostUrl) {
    const host = req.get('x-forwarded-host') || req.get('host') || `localhost:${PORT}`;
    const proto = host.includes('localhost') || host.includes('127.0.0.1') ? 'http' : 'https';
    hostUrl = `${proto}://${host}`;
  }

  try {
    let result: ExtractedMediaResponse;

    if (/(?:youtube\.com|youtu\.be)/i.test(cleanUrl)) {
      result = await extractYouTubeServer(cleanUrl, hostUrl);
    } else if (/(?:instagram\.com|instagr\.am)/i.test(cleanUrl)) {
      result = await extractInstagramServer(cleanUrl);
    } else if (/(?:tiktok\.com)/i.test(cleanUrl)) {
      result = await extractTikTokServer(cleanUrl);
    } else if (/(?:twitter\.com|x\.com|t\.co)/i.test(cleanUrl)) {
      result = await extractTwitterServer(cleanUrl);
    } else if (/(?:reddit\.com|redd\.it)/i.test(cleanUrl)) {
      result = await extractRedditServer(cleanUrl, hostUrl);
    } else if (/(?:pinterest\.com|pin\.it)/i.test(cleanUrl)) {
      result = await extractPinterestServer(cleanUrl);
    } else {
      res.status(400).json({
        success: false,
        error: 'Unsupported platform. Supported: YouTube, Instagram, TikTok, Twitter/X, Reddit, Pinterest.',
      });
      return;
    }

    setCache(cleanUrl, result);
    res.json(result);
  } catch (err: any) {
    console.error(`[Extract Error] URL: ${cleanUrl} ->`, err.message);
    res.status(500).json({
      success: false,
      error: err.message || 'Media extraction failed',
    });
  }
});

/**
 * Streaming on-the-fly Muxer Endpoint
 * GET /api/stream?video=...&audio=...&format=mp4&title=...
 */
app.get('/api/stream', async (req: Request, res: Response) => {
  const videoUrl = req.query.video as string | undefined;
  const audioUrl = req.query.audio as string | undefined;
  const format = (req.query.format as 'mp4' | 'mp3') || 'mp4';
  const filename = (req.query.title as string) || 'anyfetch_download.mp4';

  try {
    await streamMux(req, res, { videoUrl, audioUrl, format, filename });
  } catch (err: any) {
    console.error('[Stream Error]', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Stream multiplexing failed' });
    }
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`⚡ AnyFetch API Engine running on http://0.0.0.0:${PORT}`);
  startKeepAlive(PORT, EXTERNAL_URL);
});
