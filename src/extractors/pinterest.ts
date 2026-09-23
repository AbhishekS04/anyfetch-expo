/**
 * Pinterest media extractor — Expo Go and Standalone APK compatible
 * Pure fetch(), no native modules required.
 */
const PT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
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

/**
 * Resolves short `pin.it` links by following redirects and inspecting HTML bodies
 * to safely obtain the numeric Pin URL in React Native environments.
 */
async function resolvePinShortlink(rawUrl: string): Promise<string> {
  let url = extractUrlFromText(rawUrl);
  if (!url.includes('pin.it')) return url;

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': PT_UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirect: 'follow',
    });

    if (res.url && res.url.includes('/pin/')) {
      return res.url;
    }

    const text = await res.text();
    // Hop 1 or Hop 2: Pinterest 308/302 text contains target URL
    const pinMatch = text.match(/https?:\/\/(?:www\.)?pinterest\.com\/pin\/(\d+)/i);
    if (pinMatch) {
      return pinMatch[0];
    }

    const shortenerMatch = text.match(/https?:\/\/api\.pinterest\.com\/url_shortener\/[^"'\s<]+/i);
    if (shortenerMatch) {
      const hop2Res = await fetch(shortenerMatch[0], {
        headers: { 'User-Agent': PT_UA },
        redirect: 'follow',
      });
      if (hop2Res.url && hop2Res.url.includes('/pin/')) {
        return hop2Res.url;
      }
      const hop2Text = await hop2Res.text();
      const hop2PinMatch = hop2Text.match(/https?:\/\/(?:www\.)?pinterest\.com\/pin\/(\d+)/i);
      if (hop2PinMatch) {
        return hop2PinMatch[0];
      }
    }
  } catch (err) {
    console.warn('[Pinterest] Error resolving pin.it shortlink:', err);
  }

  return url;
}

/**
 * Converts Pinterest HLS streaming video URLs (.m3u8) into direct MP4 downloads.
 * Pinterest CDN mirrors HLS streams into 720p or 1080p MP4s on v1.pinimg.com.
 */
function resolvePinterestDirectMp4(hlsUrl: string): string {
  if (!hlsUrl || !hlsUrl.includes('.m3u8')) return hlsUrl;

  // Example:
  // https://v1.pinimg.com/videos/mc/hls/5b/4b/5b4b...m3u8
  // -> https://v1.pinimg.com/videos/mc/720p/5b/4b/5b4b...mp4
  let directMp4 = hlsUrl.replace(/\/hls\//i, '/720p/').replace(/\.m3u8(\?.*)?$/i, '.mp4$1');
  return directMp4;
}

/**
 * Scans Pinterest page HTML for embedded video_list objects (__PWS_DATA__ or relay scripts)
 */
function extractVideoFromPwsData(html: string): { mp4Url?: string; thumbnail?: string } {
  try {
    // 1. Look for V_720P or V_EXP7 or V_HLSV4 in script tags
    const mp4Match = html.match(/"url"\s*:\s*"([^"]+v1\.pinimg\.com\/videos\/[^"]+\.mp4[^"]*)"/i);
    if (mp4Match) {
      return { mp4Url: mp4Match[1].replace(/\\u0026/g, '&') };
    }

    const anyMp4 = html.match(/https:\/\/v1\.pinimg\.com\/videos\/[a-zA-Z0-9_\/.-]+\.mp4(\?[^"'\s<>]*)?/i);
    if (anyMp4) {
      return { mp4Url: anyMp4[0].replace(/\\u0026/g, '&') };
    }
  } catch (err) {
    console.warn('[Pinterest] PWS video parse error:', err);
  }
  return {};
}

export async function extractPinterest(url: string): Promise<PtExtractResult> {
  const resolvedUrl = await resolvePinShortlink(url);
  const pinId = parsePinId(resolvedUrl);
  const pageUrl = `${PT_BASE}/pin/${pinId}/`;

  const response = await fetch(pageUrl, {
    headers: {
      'User-Agent': PT_UA,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });

  if (!response.ok) {
    throw new Error(`Pinterest returned HTTP ${response.status}`);
  }

  const html = await response.text();

  // 1. Check for direct MP4 videos from Pinterest page data
  const pwsVideo = extractVideoFromPwsData(html);

  // 2. Try parsing JSON-LD Video Object
  const videoSnippetMatch = html.match(
    /<script data-test-id="video-snippet" type="application\/ld\+json">([\s\S]*?)<\/script>/i,
  );
  if (videoSnippetMatch) {
    try {
      const videoLd = JSON.parse(videoSnippetMatch[1]);
      const title = videoLd.name || videoLd.description || '';
      const thumbnail = videoLd.thumbnailUrl || pwsVideo.thumbnail || '';
      const contentUrl = videoLd.contentUrl;

      if (contentUrl || pwsVideo.mp4Url) {
        const directMp4 = pwsVideo.mp4Url || resolvePinterestDirectMp4(contentUrl);
        return {
          type: 'video',
          url: directMp4,
          thumbnail,
          title,
        };
      }
    } catch (err) {
      console.warn('Failed to parse Pinterest video-snippet', err);
    }
  }

  // 3. Fallback: Parse meta tags (og:video)
  const metaTags: Record<string, string> = {};
  const metaRegex =
    /<meta\b[^>]*property="([^"]+)"[^>]*content="([^"]+)"|<meta\b[^>]*content="([^"]+)"[^>]*property="([^"]+)"|<meta\b[^>]*name="([^"]+)"[^>]*content="([^"]+)"|<meta\b[^>]*content="([^"]+)"[^>]*name="([^"]+)"/gi;
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
  const rawVideo = metaTags['og:video:secure_url'] || metaTags['og:video'];

  if (pwsVideo.mp4Url || rawVideo) {
    const directMp4 = pwsVideo.mp4Url || resolvePinterestDirectMp4(rawVideo);
    return {
      type: 'video',
      url: directMp4,
      thumbnail,
      title,
    };
  }

  // 4. Try parsing JSON-LD Leaf Object (for images)
  const leafSnippetMatch = html.match(
    /<script data-test-id="leaf-snippet" type="application\/ld\+json">([\s\S]*?)<\/script>/i,
  );
  if (leafSnippetMatch) {
    try {
      const leafLd = JSON.parse(leafSnippetMatch[1]);
      const leafTitle = leafLd.headline || leafLd.articleBody || title;
      const imageUrl = leafLd.image;

      if (imageUrl) {
        return {
          type: 'image',
          url: imageUrl,
          thumbnail: imageUrl,
          title: leafTitle,
        };
      }
    } catch (err) {
      console.warn('Failed to parse Pinterest leaf-snippet', err);
    }
  }

  // 5. Look for originals high-resolution image links in raw HTML
  const origMatch = html.match(/https:\/\/i\.pinimg\.com\/originals\/[a-zA-Z0-9_\/.-]+/);
  if (origMatch) {
    return {
      type: 'image',
      url: origMatch[0],
      thumbnail: origMatch[0],
      title: title || 'Pinterest Image',
    };
  }

  if (thumbnail) {
    return {
      type: 'image',
      url: thumbnail,
      thumbnail,
      title,
    };
  }

  throw new Error('Pinterest: no media found in this pin.');
}
