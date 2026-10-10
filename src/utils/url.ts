/**
 * URL and platform parsing utilities for AnyFetch.
 *
 * Leaf utility module with zero dependencies across extractors or downloaders
 * to prevent circular dependency cycles.
 */

export type PlatformType = 'instagram' | 'pinterest' | 'twitter' | 'youtube' | 'facebook' | 'tiktok' | 'reddit';

/**
 * Pure JavaScript base64 decoder that works reliably across Hermes, React Native, and Node.
 */
export function base64Decode(str: string): string {
  if (typeof atob === 'function') {
    try {
      return atob(str);
    } catch {
      /* fallback below */
    }
  }
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let output = '';
  let input = String(str).replace(/=+$/, '');
  if (input.length % 4 === 1) return '';
  for (
    let bc = 0, bs = 0, buffer: number, idx = 0;
    (buffer = input.charCodeAt(idx++));
    ~buffer && ((bs = bc % 4 ? bs * 64 + buffer : buffer), bc++ % 4)
      ? (output += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6))))
      : 0
  ) {
    buffer = chars.indexOf(String.fromCharCode(buffer));
  }
  return output;
}

/**
 * Decodes JWT tokens from proxy services (snapcdn, etc.) to extract the
 * direct underlying Meta CDN (scontent.cdninstagram.com) media URL.
 */
export function decodeTokenPayload(token: string): string | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4 !== 0) {
      b64 += '=';
    }
    const jsonStr = base64Decode(b64);
    const parsed = JSON.parse(jsonStr);
    return parsed?.url || null;
  } catch {
    return null;
  }
}

/**
 * Unwraps proxy URLs that bundle tokens (e.g. https://dl.snapcdn.app/get?token=...)
 * into the direct, unproxied Meta CDN URL (https://scontent.cdninstagram.com/...).
 */
export function resolveDirectMediaUrl(rawUrl: string): string {
  if (!rawUrl) return '';
  if (rawUrl.includes('token=')) {
    const token = rawUrl.split('token=')[1]?.split('&')[0];
    if (token) {
      const decoded = decodeTokenPayload(token);
      if (decoded && (decoded.startsWith('http://') || decoded.startsWith('https://'))) {
        return decoded;
      }
    }
  }
  return rawUrl;
}

/**
 * Extracts the first valid HTTP/HTTPS URL from any string or clipboard text.
 * Automatically cleans leading/trailing punctuation and social media share captions.
 * Example: "Check out this reel https://www.instagram.com/reel/C8XYZ/?igsh=123 sent via app"
 * -> "https://www.instagram.com/reel/C8XYZ/?igsh=123"
 */
export function extractUrlFromText(text: string): string {
  if (!text) return '';
  const trimmed = text.trim();
  const match = trimmed.match(/https?:\/\/[^\s<>"'{}|\\^`[\]]+/i);
  if (match) {
    let clean = match[0];
    clean = clean.replace(/[.,;:!?)]+$/, '');
    return clean;
  }
  return trimmed;
}

/**
 * Detects the target media platform from a raw URL or freeform text containing a link.
 */
export function detectPlatform(
  rawText: string,
): PlatformType | null {
  if (!rawText) return null;
  const clean = extractUrlFromText(rawText).toLowerCase();
  if (!clean) return null;

  // YouTube: watch?v=, youtu.be, shorts, embed, live, music.youtube.com
  if (
    /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/|v\/|live\/)|youtu\.be\/|music\.youtube\.com\/watch\?v=)/i.test(clean)
  ) {
    return 'youtube';
  }

  // Instagram: posts, reels (singular & plural), share URLs (incl. ?stkn= new format), tv, instagr.am
  if (
    /(?:instagram\.com|instagr\.am)\/(?:p|reel|reels|tv)\//i.test(clean) ||
    /(?:instagram\.com|instagr\.am)\/share\//i.test(clean) ||
    /(?:instagram\.com|instagr\.am)\/[^/]+\/(?:p|reel|reels)\//i.test(clean)
  ) {
    return 'instagram';
  }

  // Facebook: handles facebook.com, fb.watch, fb.com, m.facebook.com
  if (
    /(?:facebook\.com|fb\.watch|fb\.com)/i.test(clean)
  ) {
    return 'facebook';
  }

  // Pinterest: handles pin.it and pinterest.* pins
  if (
    /pin\.it\/[A-Za-z0-9_-]+/i.test(clean) ||
    /pinterest\.[a-z.]+\/pin\//i.test(clean) ||
    /pinterest\.com\/pin\//i.test(clean)
  ) {
    return 'pinterest';
  }

  // Twitter / X: handles twitter.com, x.com, mobile.twitter.com, t.co, /i/status/, etc.
  if (
    /(?:twitter|x)\.com\/(?:[^/]+\/status(?:es)?\/\d+|i\/status\/\d+)/i.test(clean) ||
    /t\.co\/[A-Za-z0-9_-]+/i.test(clean)
  ) {
    return 'twitter';
  }

  // TikTok: handles tiktok.com, vm.tiktok.com, vt.tiktok.com
  if (/(?:tiktok\.com|vm\.tiktok\.com|vt\.tiktok\.com)/i.test(clean)) {
    return 'tiktok';
  }

  // Reddit: handles reddit.com, v.redd.it, redd.it
  if (/(?:reddit\.com|v\.redd\.it|redd\.it)/i.test(clean)) {
    return 'reddit';
  }

  return null;
}
