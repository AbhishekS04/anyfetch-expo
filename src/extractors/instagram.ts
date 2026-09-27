/**
 * Instagram media extractor — Standalone APK & Expo compatible
 *
 * Multi-tiered extraction architecture:
 * 1. Resolves /share/reel/ and /share/p/ tracking URLs
 * 2. InDown engine — queries high-speed resolver for reels, posts, and carousels,
 *    unwrapping direct Meta CDN (scontent.cdninstagram.com) media URLs
 * 3. OggyAPI Cloudflare Worker engine — secondary resolver with rotating proxies
 * 4. Native page-crawl & embed page fallback (/embed/captioned/)
 * 5. Legacy GraphQL & numeric PK media API fallbacks
 */

import { extractUrlFromText } from '../utils/download';

export type IgMediaType = 'video' | 'image' | 'carousel';

export interface IgMediaItem {
  type: 'video' | 'image';
  url: string;
  thumbnail?: string;
}

export interface IgExtractResult {
  type: IgMediaType;
  items: IgMediaItem[];
  author?: string;
  caption?: string;
}

const IG_BASE = 'https://www.instagram.com';
const IG_APP_ID = '936619743392459';
const IG_UA =
  'Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';
const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const CRAWLER_UA =
  'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)';

// ─── Token Unwrapping & Base64 Decoder (Pure JS) ─────────────────────────────

/**
 * Pure JavaScript base64 decoder that works across Hermes, React Native, and Node.
 */
function base64Decode(str: string): string {
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
 * Validates that a URL is a genuine CDN video file and NOT an HTML webpage.
 */
export function isCdnVideoUrl(url: string): boolean {
  if (!url) return false;
  const u = url.toLowerCase();
  // Reject Instagram webpage URLs
  if (
    u.includes('www.instagram.com') ||
    u.includes('instagram.com/p/') ||
    u.includes('instagram.com/reel/') ||
    u.includes('/embed') ||
    u.includes('.html')
  ) {
    return false;
  }
  // Reject images explicitly
  if (
    u.includes('.jpg') ||
    u.includes('.jpeg') ||
    u.includes('.png') ||
    u.includes('.webp') ||
    u.includes('.gif')
  ) {
    return false;
  }
  // Must have video signal
  if (
    u.includes('.mp4') ||
    u.includes('.webm') ||
    u.includes('.mov') ||
    u.includes('/video') ||
    u.includes('video/mp4') ||
    u.includes('xpv_progressive') ||
    u.includes('dash_baseline')
  ) {
    return true;
  }
  return false;
}

const looksLikeVideoUrl = isCdnVideoUrl;

// ─── URL Helpers ──────────────────────────────────────────────────────────────

/**
 * Resolves Instagram app share links (e.g. /share/reel/TOKEN/?stkn=...) to
 * canonical reel/post URLs by trying crawler User-Agents and redirect following.
 */
export async function resolveInstagramUrl(rawInput: string): Promise<string> {
  const url = extractUrlFromText(rawInput);
  if (!url) return '';
  if (!url.includes('/share/')) return url;

  const userAgents = [
    CRAWLER_UA,
    'WhatsApp/2.23.24.78 A',
    DESKTOP_UA,
    IG_UA,
  ];

  for (const ua of userAgents) {
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': ua,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        redirect: 'follow',
      });

      if (
        res.url &&
        !res.url.includes('/share/') &&
        (res.url.includes('/reel/') || res.url.includes('/p/') || res.url.includes('/tv/'))
      ) {
        return res.url;
      }

      const text = await res.text();

      const canonical =
        text.match(/<link\s+rel="canonical"\s+href="([^"]+)"/i)?.[1] ??
        text.match(/<link\s+href="([^"]+)"\s+rel="canonical"/i)?.[1];
      if (canonical && !canonical.includes('/share/') && /\/(reel|p|tv)\//.test(canonical)) {
        return canonical;
      }

      const ogUrl =
        text.match(/property="og:url"\s+content="([^"]+)"/i)?.[1] ??
        text.match(/content="([^"]+)"\s+property="og:url"/i)?.[1];
      if (ogUrl && !ogUrl.includes('/share/') && /\/(reel|p|tv)\//.test(ogUrl)) {
        return ogUrl;
      }

      const reelMatch = text.match(
        /https?:\/\/(?:www\.)?instagram\.com\/(?:reel|reels|p|tv)\/([A-Za-z0-9_-]{5,})/i,
      );
      if (reelMatch) return reelMatch[0];

      const scMatch = text.match(/"shortcode"\s*:\s*"([A-Za-z0-9_-]{5,})"/);
      if (scMatch) return `https://www.instagram.com/reel/${scMatch[1]}/`;
    } catch (err) {
      console.warn(`[Instagram] Share URL resolve failed (UA=${ua.slice(0, 20)}):`, err);
    }
  }

  return url;
}

/**
 * Converts a base64/base62 Instagram shortcode to a numeric PK (Media ID).
 */
export function shortcodeToPk(shortcode: string): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let id = BigInt(0);
  for (let i = 0; i < shortcode.length; i++) {
    const idx = alphabet.indexOf(shortcode[i]);
    if (idx === -1) break;
    id = id * BigInt(64) + BigInt(idx);
  }
  return id.toString();
}

export function parseShortcode(rawInput: string): string {
  const url = extractUrlFromText(rawInput);

  const m = url.match(/(?:instagram\.com|instagr\.am)\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i);
  if (m && m[1]) return m[1];

  const mFallback = url.match(/\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i);
  if (mFallback && mFallback[1]) return mFallback[1];

  throw new Error('Not a recognised Instagram post/reel URL');
}

function unescapeUrl(raw: string): string {
  return raw
    .replace(/\\u002F/gi, '/')
    .replace(/\\\//g, '/')
    .replace(/\\u0026/gi, '&')
    .replace(/&amp;/g, '&');
}

function extractMetaContent(html: string, property: string): string | undefined {
  return (
    html.match(new RegExp(`property="${property}"\\s+content="([^"]+)"`, 'i'))?.[1] ??
    html.match(new RegExp(`content="([^"]+)"\\s+property="${property}"`, 'i'))?.[1] ??
    html.match(new RegExp(`name="${property}"\\s+content="([^"]+)"`, 'i'))?.[1] ??
    html.match(new RegExp(`content="([^"]+)"\\s+name="${property}"`, 'i'))?.[1]
  );
}

// ─── Tier 1: InDown Multi-Extractor Engine ─────────────────────────────────────

async function tryInDown(url: string): Promise<IgExtractResult | null> {
  try {
    const cleanUrl = url.split('?')[0];
    const body = new URLSearchParams({
      q: cleanUrl,
      vt: 'reel',
      t: 'media',
      lang: 'en',
      v: 'v2',
    }).toString();

    const res = await fetch('https://indown.net/api/ajaxSearch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'X-Requested-With': 'XMLHttpRequest',
        Origin: 'https://indown.net',
        Referer: 'https://indown.net/',
      },
      body,
    });

    if (!res.ok) return null;
    const json = (await res.json().catch(() => null)) as Record<string, any> | null;
    if (!json || json.status !== 'ok' || !json.data) return null;

    const html = String(json.data);
    const hrefMatches = [...html.matchAll(/href=["'](https?:\/\/[^\s"'>]+)["']/g)].map(m => m[1]);
    const imgMatches = [...html.matchAll(/<img[^>]+src=["'](https?:\/\/[^\s"'>]+)["']/g)].map(m => m[1]);

    const thumbUrl = imgMatches[0] ? resolveDirectMediaUrl(imgMatches[0]) : undefined;
    const items: IgMediaItem[] = [];

    for (const href of hrefMatches) {
      const directUrl = resolveDirectMediaUrl(href);
      const isVideo =
        directUrl.toLowerCase().includes('.mp4') ||
        directUrl.toLowerCase().includes('video') ||
        href.toLowerCase().includes('video') ||
        href.toLowerCase().includes('mp4');

      if (!items.some(i => i.url === directUrl)) {
        items.push({
          type: isVideo ? 'video' : 'image',
          url: directUrl,
          thumbnail: thumbUrl,
        });
      }
    }

    const videos = items.filter(i => i.type === 'video');
    if (videos.length > 0) {
      return {
        type: videos.length > 1 ? 'carousel' : 'video',
        items: videos,
      };
    }

    if (items.length > 0) {
      return {
        type: items.length > 1 ? 'carousel' : items[0].type,
        items,
      };
    }
  } catch (err) {
    console.warn('[Instagram] tryInDown error:', err);
  }

  return null;
}

// ─── Tier 2: OggyAPI Cloudflare Worker Engine ─────────────────────────────────

async function tryOggyApi(url: string): Promise<IgExtractResult | null> {
  try {
    const res = await fetch(
      `https://jerrycoder.oggyapi.workers.dev/insta?url=${encodeURIComponent(url)}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0',
          Accept: 'application/json',
        },
      },
    );

    if (!res.ok) return null;
    const json = (await res.json().catch(() => null)) as Record<string, any> | null;
    if (!json || json.status !== 'success' || !json.data) return null;

    const data = json.data;
    if (Array.isArray(data)) {
      const items: IgMediaItem[] = data
        .map(d => ({
          type: (d.type === 'video' ? 'video' : 'image') as 'video' | 'image',
          url: resolveDirectMediaUrl(d.url),
          thumbnail: d.thumbnail ? resolveDirectMediaUrl(d.thumbnail) : undefined,
        }))
        .filter(i => i.url);

      if (items.length > 0) {
        return { type: items.length > 1 ? 'carousel' : items[0].type, items };
      }
    } else if (data.url) {
      const directUrl = resolveDirectMediaUrl(data.url);
      const thumbUrl = data.thumbnail ? resolveDirectMediaUrl(data.thumbnail) : undefined;
      return {
        type: data.type === 'video' ? 'video' : 'image',
        items: [
          {
            type: (data.type === 'video' ? 'video' : 'image') as 'video' | 'image',
            url: directUrl,
            thumbnail: thumbUrl,
          },
        ],
      };
    }
  } catch (err) {
    console.warn('[Instagram] tryOggyApi error:', err);
  }

  return null;
}

// ─── Tier 3: Native Embed Page & Crawl Fallbacks ──────────────────────────────

function extractCdnUrls(html: string): string[] {
  const results: string[] = [];

  const unicodeMatches = html.match(/https:\\u002F\\u002F[^\s"',;{}[\]\\]+/gi) || [];
  for (const m of unicodeMatches) {
    results.push(unescapeUrl(m));
  }

  const slashPattern = /https:\\\/\\\/[^\s"',;{}[\]]+/g;
  const slashMatches = html.match(slashPattern) || [];
  for (const m of slashMatches) {
    results.push(unescapeUrl(m));
  }

  const plainMatches =
    html.match(/https:\/\/(?:[a-z0-9-]+\.)?(?:cdninstagram|scontent)[^\s"'<>{}[\]]+/gi) || [];
  for (const m of plainMatches) {
    results.push(unescapeUrl(m));
  }

  const seen = new Set<string>();
  return results
    .map(u => u.replace(/[).,;:!?]+$/, ''))
    .filter(u => {
      if (seen.has(u)) return false;
      seen.add(u);
      return u.startsWith('http');
    });
}

function parseNode(node: any): IgMediaItem {
  const isVideo = Boolean(
    node?.is_video ||
      node?.__typename === 'XDTGraphVideo' ||
      node?.video_url ||
      (node?.video_versions && node.video_versions.length > 0),
  );

  if (isVideo) {
    const videoUrl = node?.video_url || node?.video_versions?.[0]?.url;
    const thumb =
      node?.thumbnail_src ?? node?.display_url ?? node?.image_versions2?.candidates?.[0]?.url;
    return { type: 'video', url: resolveDirectMediaUrl(videoUrl), thumbnail: thumb };
  }

  const imgUrl = node?.display_url ?? node?.image_versions2?.candidates?.[0]?.url;
  const thumb = node?.display_resources?.[0]?.src ?? imgUrl;
  return { type: 'image', url: resolveDirectMediaUrl(imgUrl), thumbnail: thumb };
}

function parseGraphQLMedia(media: any): IgExtractResult | null {
  if (!media) return null;

  const edges: any[] = media.edge_sidecar_to_children?.edges ?? [];
  if (edges.length) {
    const items = edges
      .map((e: any) => e?.node)
      .filter((n: any) => n?.display_url || n?.video_url || n?.video_versions?.[0]?.url)
      .map(parseNode)
      .filter(i => i.url);
    if (items.length) {
      return {
        type: 'carousel',
        items,
        author: media.owner?.username ?? media.user?.username,
        caption: media.edge_media_to_caption?.edges?.[0]?.node?.text ?? media.caption?.text,
      };
    }
  }

  const carouselMedia: any[] = media.carousel_media ?? [];
  if (carouselMedia.length) {
    const items = carouselMedia.map(parseNode).filter(i => i.url);
    if (items.length) {
      return {
        type: 'carousel',
        items,
        author: media.user?.username ?? media.owner?.username,
        caption: media.caption?.text,
      };
    }
  }

  const item = parseNode(media);
  if (!item.url) return null;
  return {
    type: item.type,
    items: [item],
    author: media.owner?.username ?? media.user?.username,
    caption: media.edge_media_to_caption?.edges?.[0]?.node?.text ?? media.caption?.text,
  };
}

async function tryPageCrawl(shortcode: string): Promise<IgExtractResult | null> {
  const urlVariants = [`${IG_BASE}/reel/${shortcode}/`, `${IG_BASE}/p/${shortcode}/`];
  const crawlerUAs = [CRAWLER_UA, 'Twitterbot/1.0', DESKTOP_UA];

  for (const pageUrl of urlVariants) {
    for (const ua of crawlerUAs) {
      try {
        const res = await fetch(pageUrl, {
          headers: {
            'User-Agent': ua,
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
          },
        });

        if (!res.ok) continue;
        const html = await res.text();
        if (!html || html.length < 500) continue;

        // JSON-LD VideoObject
        const jsonLdTags = [
          ...html.matchAll(/<script\s+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi),
        ];
        for (const match of jsonLdTags) {
          try {
            const ld = JSON.parse(match[1]);
            const contentUrl = ld?.contentUrl ?? ld?.video?.contentUrl;
            if (contentUrl && isCdnVideoUrl(contentUrl)) {
              const thumb = ld?.thumbnailUrl ?? extractMetaContent(html, 'og:image');
              return {
                type: 'video',
                items: [
                  {
                    type: 'video',
                    url: resolveDirectMediaUrl(unescapeUrl(contentUrl)),
                    thumbnail: thumb ? resolveDirectMediaUrl(unescapeUrl(thumb)) : undefined,
                  },
                ],
              };
            }
          } catch {
            /* continue */
          }
        }
      } catch (err) {
        console.warn(`[Instagram] tryPageCrawl error (${shortcode}):`, err);
      }
    }
  }

  return null;
}

async function tryHtmlEmbed(shortcode: string): Promise<IgExtractResult | null> {
  const userAgents = [IG_UA, CRAWLER_UA, DESKTOP_UA];

  for (const ua of userAgents) {
    for (const suffix of ['/embed/captioned/', '/embed/']) {
      let html = '';
      try {
        const res = await fetch(`${IG_BASE}/p/${shortcode}${suffix}`, {
          headers: {
            'User-Agent': ua,
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Sec-Fetch-Dest': 'iframe',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'cross-site',
            Referer: IG_BASE + '/',
          },
        });
        html = await res.text();
      } catch {
        continue;
      }

      if (!html || html.length < 500) continue;

      const cdnUrls = extractCdnUrls(html);
      const videoUrls = cdnUrls.filter(u => isCdnVideoUrl(u));
      const imageUrls = cdnUrls.filter(
        u => u.includes('.jpg') || u.includes('.jpeg') || u.includes('.png') || u.includes('.webp'),
      );

      if (videoUrls.length > 0) {
        return {
          type: 'video',
          items: [
            {
              type: 'video',
              url: resolveDirectMediaUrl(videoUrls[0]),
              thumbnail: imageUrls[0] ? resolveDirectMediaUrl(imageUrls[0]) : undefined,
            },
          ],
        };
      }
    }
  }

  return null;
}

// ─── Tier 4: Legacy GraphQL & PK API ──────────────────────────────────────────

async function tryLegacyGraphQL(shortcode: string): Promise<IgExtractResult | null> {
  const queryHashes = [
    'b3055c01b4b222b8a47dc12b090e4e64',
    '2c4c2e343a8f64c625ba02b2aa12c7f8',
    '9f8827793ef34641b2fb195d4d41151c',
  ];

  for (const queryHash of queryHashes) {
    try {
      const vars = encodeURIComponent(JSON.stringify({ shortcode }));
      const res = await fetch(
        `${IG_BASE}/graphql/query/?query_hash=${queryHash}&variables=${vars}`,
        {
          headers: {
            'User-Agent': DESKTOP_UA,
            Accept: '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
            'x-ig-app-id': IG_APP_ID,
            Referer: `${IG_BASE}/p/${shortcode}/`,
          },
        },
      );

      if (!res.ok) continue;
      const json = await res.json().catch(() => null);
      const media =
        json?.data?.shortcode_media ??
        json?.data?.xdt_shortcode_media ??
        json?.data?.media;

      const parsed = parseGraphQLMedia(media);
      if (parsed) return parsed;
    } catch (err) {
      console.warn('[Instagram] tryLegacyGraphQL error:', err);
    }
  }

  return null;
}

async function tryPkMediaInfo(shortcode: string): Promise<IgExtractResult | null> {
  const pk = shortcodeToPk(shortcode);
  if (!pk || pk === '0') return null;

  for (const endpoint of [
    `https://i.instagram.com/api/v1/media/${pk}/info/`,
    `https://www.instagram.com/api/v1/media/${pk}/info/`,
  ]) {
    try {
      const res = await fetch(endpoint, {
        headers: {
          'User-Agent': 'Instagram 278.0.0.19.115 Android',
          'x-ig-app-id': IG_APP_ID,
          Accept: '*/*',
        },
      });
      if (res.ok) {
        const json = await res.json().catch(() => null);
        const item = json?.items?.[0];
        if (item) {
          const parsed = parseGraphQLMedia(item);
          if (parsed) return parsed;
        }
      }
    } catch {
      /* continue */
    }
  }

  return null;
}

async function tryMobileApi(shortcode: string): Promise<IgExtractResult | null> {
  try {
    const oembed = await fetch(
      `https://i.instagram.com/api/v1/oembed/?url=${encodeURIComponent(`${IG_BASE}/p/${shortcode}/`)}`,
      { headers: { 'User-Agent': IG_UA, 'x-ig-app-id': IG_APP_ID } },
    )
      .then(r => r.json() as Promise<Record<string, any>>)
      .catch(() => null);

    const mediaId = oembed?.media_id as string | undefined;
    if (!mediaId) return null;

    const media = await fetch(`https://i.instagram.com/api/v1/media/${mediaId}/info/`, {
      headers: { 'User-Agent': IG_UA, 'x-ig-app-id': IG_APP_ID },
    })
      .then(r => r.json() as Promise<Record<string, any>>)
      .catch(() => null);

    const item = media?.items?.[0];
    if (item) return parseGraphQLMedia(item);
  } catch (err) {
    console.warn('[Instagram] tryMobileApi error:', err);
  }

  return null;
}

// ─── Main Extractor ───────────────────────────────────────────────────────────

export async function extractInstagram(url: string): Promise<IgExtractResult> {
  // Step 1: Attempt to resolve /share/reel/ and /share/p/ tracking URLs
  let targetUrl = url.trim();
  try {
    const resolved = await resolveInstagramUrl(url);
    if (resolved) targetUrl = resolved;
  } catch (err) {
    console.warn('[Instagram] URL resolve warning:', err);
  }

  // Step 2: InDown engine (Resolves direct Meta CDN MP4/JPG without proxy delay)
  try {
    const indown = await tryInDown(targetUrl);
    if (indown) return indown;
    if (targetUrl !== url) {
      const indownRaw = await tryInDown(url);
      if (indownRaw) return indownRaw;
    }
  } catch (err) {
    console.warn('[Instagram] tryInDown failed:', err);
  }

  // Step 3: OggyAPI Cloudflare Worker engine
  try {
    const oggy = await tryOggyApi(targetUrl);
    if (oggy) return oggy;
    if (targetUrl !== url) {
      const oggyRaw = await tryOggyApi(url);
      if (oggyRaw) return oggyRaw;
    }
  } catch (err) {
    console.warn('[Instagram] tryOggyApi failed:', err);
  }

  // Step 4: Parse shortcode for direct native fallbacks
  let shortcode = '';
  try {
    shortcode = parseShortcode(targetUrl);
  } catch {
    try {
      shortcode = parseShortcode(url);
    } catch {
      /* could not parse shortcode */
    }
  }

  if (shortcode) {
    try {
      const crawl = await tryPageCrawl(shortcode);
      if (crawl) return crawl;
    } catch (err) {
      console.warn('[Instagram] tryPageCrawl failed:', err);
    }

    try {
      const embed = await tryHtmlEmbed(shortcode);
      if (embed) return embed;
    } catch (err) {
      console.warn('[Instagram] tryHtmlEmbed failed:', err);
    }

    try {
      const legacy = await tryLegacyGraphQL(shortcode);
      if (legacy) return legacy;
    } catch (err) {
      console.warn('[Instagram] tryLegacyGraphQL failed:', err);
    }

    try {
      const pkMedia = await tryPkMediaInfo(shortcode);
      if (pkMedia) return pkMedia;
    } catch (err) {
      console.warn('[Instagram] tryPkMediaInfo failed:', err);
    }

    try {
      const mobile = await tryMobileApi(shortcode);
      if (mobile) return mobile;
    } catch (err) {
      console.warn('[Instagram] tryMobileApi failed:', err);
    }
  }

  throw new Error(
    'Instagram could not fetch this reel or post. Please check that the account is public and the link is valid.',
  );
}
