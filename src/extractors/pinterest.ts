/**
 * Pinterest media extractor — Expo Go compatible
 * Pure fetch(), no native modules.
 */
const PT_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const PT_BASE = 'https://www.pinterest.com';

export type PtMediaType = 'image' | 'video' | 'video_hls';

export interface PtExtractResult {
  type: PtMediaType;
  url?: string;
  hlsUrl?: string;
  thumbnail?: string;
  title?: string;
  hlsNote?: string;
}

import { extractUrlFromText } from '../utils/download';

export function parsePinId(rawInput: string): string {
  const url = extractUrlFromText(rawInput);
  const m = url.match(/\/pin\/(\d+)/i);
  if (m && m[1]) return m[1];
  throw new Error('Not a recognised Pinterest pin URL');
}

export async function extractPinterest(url: string): Promise<PtExtractResult> {
  let activeUrl = extractUrlFromText(url);
  if (activeUrl.includes('pin.it')) {
    try {
      const res = await fetch(activeUrl, { method: 'HEAD', redirect: 'follow' });
      if (res.url) activeUrl = res.url;
    } catch (err) {
      const res = await fetch(activeUrl, { method: 'GET', redirect: 'follow' });
      if (res.url) activeUrl = res.url;
    }
  }

  const pinId = parsePinId(activeUrl);
  const pageUrl = `${PT_BASE}/pin/${pinId}/`;

  const response = await fetch(pageUrl, {
    headers: {
      'User-Agent': PT_UA,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    }
  });

  if (!response.ok) {
    throw new Error(`Pinterest returned HTTP ${response.status}`);
  }

  const html = await response.text();

  // 1. Try parsing JSON-LD Video Object
  const videoSnippetMatch = html.match(/<script data-test-id="video-snippet" type="application\/ld\+json">([\s\S]*?)<\/script>/i);
  if (videoSnippetMatch) {
    try {
      const videoLd = JSON.parse(videoSnippetMatch[1]);
      const title = videoLd.name || videoLd.description || '';
      const thumbnail = videoLd.thumbnailUrl || '';
      const contentUrl = videoLd.contentUrl;

      if (contentUrl) {
        const isHls = contentUrl.includes('.m3u8');
        return {
          type: isHls ? 'video_hls' : 'video',
          url: isHls ? undefined : contentUrl,
          hlsUrl: isHls ? contentUrl : undefined,
          thumbnail,
          title,
          hlsNote: isHls ? 'This video is streamed by Pinterest and cannot be downloaded directly yet.' : undefined,
        };
      }
    } catch (err) {
      console.warn('Failed to parse Pinterest video-snippet', err);
    }
  }

  // 2. Try parsing JSON-LD Leaf Object (for images)
  const leafSnippetMatch = html.match(/<script data-test-id="leaf-snippet" type="application\/ld\+json">([\s\S]*?)<\/script>/i);
  if (leafSnippetMatch) {
    try {
      const leafLd = JSON.parse(leafSnippetMatch[1]);
      const title = leafLd.headline || leafLd.articleBody || '';
      const imageUrl = leafLd.image;

      if (imageUrl) {
        return {
          type: 'image',
          url: imageUrl,
          thumbnail: imageUrl,
          title,
        };
      }
    } catch (err) {
      console.warn('Failed to parse Pinterest leaf-snippet', err);
    }
  }

  // 3. Fallback: Parse meta tags
  const metaTags: Record<string, string> = {};
  const metaRegex = /<meta\b[^>]*property="([^"]+)"[^>]*content="([^"]+)"|<meta\b[^>]*content="([^"]+)"[^>]*property="([^"]+)"|<meta\b[^>]*name="([^"]+)"[^>]*content="([^"]+)"|<meta\b[^>]*content="([^"]+)"[^>]*name="([^"]+)"/gi;
  let match;
  while ((match = metaRegex.exec(html)) !== null) {
    const key = match[1] || match[4] || match[5] || match[8];
    const val = match[2] || match[3] || match[6] || match[7];
    if (key && val) {
      metaTags[key.toLowerCase()] = val;
    }
  }

  const title = metaTags['og:title'] || metaTags['twitter:title'] || '';
  const thumbnail = metaTags['og:image'] || metaTags['twitter:image:src'] || '';

  if (metaTags['og:video'] || metaTags['og:video:secure_url']) {
    const videoUrl = metaTags['og:video:secure_url'] || metaTags['og:video'];
    if (videoUrl) {
      const isHls = videoUrl.includes('.m3u8');
      return {
        type: isHls ? 'video_hls' : 'video',
        url: isHls ? undefined : videoUrl,
        hlsUrl: isHls ? videoUrl : undefined,
        thumbnail,
        title,
        hlsNote: isHls ? 'This video is streamed by Pinterest and cannot be downloaded directly yet.' : undefined,
      };
    }
  }

  if (thumbnail) {
    return {
      type: 'image',
      url: thumbnail,
      thumbnail,
      title,
    };
  }

  // 4. Ultimate Fallback: look for original image links in raw HTML
  const origMatch = html.match(/https:\/\/i\.pinimg\.com\/originals\/[a-zA-Z0-9_/.-]+/);
  if (origMatch) {
    return {
      type: 'image',
      url: origMatch[0],
      thumbnail: origMatch[0],
      title: title || 'Pinterest Image',
    };
  }

  throw new Error('Pinterest: no media found');
}
