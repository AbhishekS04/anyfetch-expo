/**
 * Instagram media extractor — Standalone APK & Expo compatible
 *
 * Multi-layer resilient extractor:
 * 1. Resolves `/share/reel/` and `/share/p/` tracking URLs to real canonical shortcodes
 * 2. Instagram Embed / Crawler page parsing (with facebookexternalhit & mobile UAs)
 * 3. Modern GraphQL queries (PolarisPostRootQuery 27128499623469141 & legacy 8845758582119845)
 * 4. Numeric PK Media API endpoints (`/api/v1/media/{pk}/info/`)
 * 5. Direct mobile and gateway fallbacks
 */

const IG_BASE = 'https://www.instagram.com';
const IG_APP_ID = '936619743392459';
const IG_UA =
  'Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
const CRAWLER_UA =
  'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)';

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

import { extractUrlFromText } from '../utils/download';

/**
 * Resolves Instagram app share links (e.g., https://www.instagram.com/share/reel/1exygT/?stkn=...)
 * by following redirects and reading the canonical reel URL.
 */
export async function resolveInstagramUrl(rawInput: string): Promise<string> {
  let url = extractUrlFromText(rawInput);
  if (!url) return '';

  if (url.includes('/share/')) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': IG_UA,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        redirect: 'follow',
      });

      if (res.url && !res.url.includes('/share/')) {
        return res.url;
      }

      const text = await res.text();
      const reelMatch = text.match(/https?:\/\/(?:www\.)?instagram\.com\/(?:reel|p)\/([A-Za-z0-9_-]{5,})/i);
      if (reelMatch) return reelMatch[0];

      const canonicalMatch = text.match(/<link\s+rel="canonical"\s+href="([^"]+)"/i);
      if (canonicalMatch && !canonicalMatch[1].includes('/share/')) return canonicalMatch[1];

      const ogUrlMatch = text.match(/<meta\s+property="og:url"\s+content="([^"]+)"/i);
      if (ogUrlMatch && !ogUrlMatch[1].includes('/share/')) return ogUrlMatch[1];
    } catch (err) {
      console.warn('[Instagram] Error resolving share link:', err);
    }
  }

  return url;
}

/**
 * Converts a base64/base62 Instagram shortcode (e.g. C8r_B0tSD-G) to a numeric PK (Media ID)
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

  // Match /reel/CODE, /reels/CODE, /p/CODE, /tv/CODE
  const m = url.match(/(?:instagram\.com|instagr\.am)\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i);
  if (m && m[1]) return m[1];

  const mFallback = url.match(/\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i);
  if (mFallback && mFallback[1]) return mFallback[1];

  const mShare = url.match(/\/share\/(?:reel|p)\/([A-Za-z0-9_-]+)/i);
  if (mShare && mShare[1]) return mShare[1];

  throw new Error('Not a recognised Instagram post/reel URL');
}

function getSetCookieString(res: Response): { csrfToken: string; cookieStr: string } {
  const headers = res.headers as any;
  const raw: string[] = [
    ...(headers.getSetCookie?.() ?? []),
    ...(headers.get?.('set-cookie') ? [headers.get('set-cookie')] : []),
  ].filter(Boolean);

  const cookieStr = raw.map((c: string) => c.split(';')[0]).filter(Boolean).join('; ');
  let csrfToken = '';
  for (const c of raw) {
    const m = c.match(/csrftoken=([^;]+)/);
    if (m) {
      csrfToken = m[1];
      break;
    }
  }
  return { csrfToken, cookieStr };
}

async function bootstrapSession(): Promise<{ csrfToken: string; cookieStr: string }> {
  const res = await fetch(`${IG_BASE}/`, {
    headers: {
      'User-Agent': IG_UA,
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });

  return getSetCookieString(res);
}

function parseNode(node: any): IgMediaItem {
  const isVideo = Boolean(
    node?.is_video ||
      node?.__typename === 'XDTGraphVideo' ||
      node?.video_url ||
      (node?.video_versions && node.video_versions.length > 0),
  );

  if (isVideo) {
    const videoUrl =
      node?.video_url ||
      node?.video_versions?.[0]?.url;
    const thumb =
      node?.thumbnail_src ??
      node?.display_url ??
      node?.image_versions2?.candidates?.[0]?.url;
    return {
      type: 'video',
      url: videoUrl,
      thumbnail: thumb,
    };
  }

  const imgUrl =
    node?.display_url ??
    node?.image_versions2?.candidates?.[0]?.url;
  const thumb =
    node?.display_resources?.[0]?.src ??
    imgUrl;
  return {
    type: 'image',
    url: imgUrl,
    thumbnail: thumb,
  };
}

function parseGraphQLMedia(media: any): IgExtractResult | null {
  if (!media) return null;

  // 1. Carousel sidecar edges
  const edges: any[] = media.edge_sidecar_to_children?.edges ?? [];
  if (edges.length) {
    const items = edges
      .map((edge: any) => edge?.node)
      .filter((node: any) => node?.display_url || node?.video_url || node?.video_versions?.[0]?.url)
      .map((node: any) => parseNode(node))
      .filter(item => item.url);
    if (items.length) {
      return {
        type: 'carousel',
        items,
        author: media.owner?.username ?? media.user?.username,
        caption: media.edge_media_to_caption?.edges?.[0]?.node?.text ?? media.caption?.text,
      };
    }
  }

  // 2. Carousel media list (v1 / web_info API shape)
  const carouselMedia: any[] = media.carousel_media ?? [];
  if (carouselMedia.length) {
    const items = carouselMedia
      .map((node: any) => parseNode(node))
      .filter(item => item.url);
    if (items.length) {
      return {
        type: 'carousel',
        items,
        author: media.user?.username ?? media.owner?.username,
        caption: media.caption?.text,
      };
    }
  }

  // 3. Single Item
  const item = parseNode(media);
  if (!item.url) return null;
  return {
    type: item.type,
    items: [item],
    author: media.owner?.username ?? media.user?.username,
    caption: media.edge_media_to_caption?.edges?.[0]?.node?.text ?? media.caption?.text,
  };
}

function parseEmbedContext(html: string): any | null {
  const initMatch = html.match(/"init",\[\],\[(.*?)\]\],/s)?.[1];
  if (initMatch) {
    try {
      const embedData = JSON.parse(initMatch) as { contextJSON?: string };
      if (embedData?.contextJSON) {
        return JSON.parse(embedData.contextJSON);
      }
    } catch {
      // continue
    }
  }

  const ctxRaw = html.match(/"contextJSON"\s*:\s*"((?:[^"\\]|\\.)*)"/s)?.[1];
  if (ctxRaw) {
    try {
      const unescaped = ctxRaw
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\')
        .replace(/\\n/g, '')
        .replace(/\\r/g, '');
      return JSON.parse(unescaped);
    } catch {
      // continue
    }
  }

  const gqlData = html.match(/"gql_data"\s*:\s*(\{[\s\S]*?\})\s*[,}]/)?.[1];
  if (gqlData) {
    try {
      return JSON.parse(gqlData);
    } catch {
      // continue
    }
  }

  return null;
}

function extractFromHtml(html: string): IgExtractResult | null {
  const ogVideo =
    html.match(/property="og:video:secure_url"[^>]*content="([^"]+)"/)?.[1] ??
    html.match(/property="og:video"[^>]*content="([^"]+)"/)?.[1] ??
    html.match(/content="([^"]+)"[^>]*property="og:video(?::secure_url)?"/)?.[1];

  const ogImage =
    html.match(/property="og:image"[^>]*content="([^"]+)"/)?.[1] ??
    html.match(/name="twitter:image"[^>]*content="([^"]+)"/)?.[1] ??
    html.match(/content="([^"]+)"[^>]*property="og:image"/)?.[1];

  const title =
    html.match(/property="og:title"[^>]*content="([^"]+)"/)?.[1] ??
    html.match(/name="twitter:title"[^>]*content="([^"]+)"/)?.[1] ??
    html.match(/content="([^"]+)"[^>]*property="og:title"/)?.[1];

  if (ogVideo) {
    return {
      type: 'video',
      items: [{ type: 'video', url: ogVideo.replace(/&amp;/g, '&'), thumbnail: ogImage }],
      caption: title,
    };
  }

  const directVideo = html.match(/"video_url":"([^"]+)"/)?.[1];
  const directImage = html.match(/"display_url":"([^"]+)"/)?.[1];
  if (directVideo) {
    const unescaped = directVideo.replace(/\\u0026/g, '&');
    return {
      type: 'video',
      items: [{ type: 'video', url: unescaped, thumbnail: directImage?.replace(/\\u0026/g, '&') }],
      caption: title,
    };
  }

  if (ogImage) {
    return {
      type: 'image',
      items: [{ type: 'image', url: ogImage.replace(/&amp;/g, '&'), thumbnail: ogImage.replace(/&amp;/g, '&') }],
      caption: title,
    };
  }

  if (directImage) {
    const unescaped = directImage.replace(/\\u0026/g, '&');
    return {
      type: 'image',
      items: [{ type: 'image', url: unescaped, thumbnail: unescaped }],
      caption: title,
    };
  }

  return null;
}

async function tryHtmlEmbed(shortcode: string): Promise<IgExtractResult | null> {
  const userAgents = [IG_UA, CRAWLER_UA];

  for (const ua of userAgents) {
    for (const suffix of ['/embed/captioned/', '/embed/']) {
      const html = await fetch(`${IG_BASE}/p/${shortcode}${suffix}`, {
        headers: {
          'User-Agent': ua,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Sec-Fetch-Dest': 'iframe',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'cross-site',
          Referer: IG_BASE + '/',
        },
      })
        .then(r => r.text())
        .catch(() => '');

      if (!html) continue;

      const ctx = parseEmbedContext(html);
      if (ctx) {
        const media =
          ctx?.gql_data?.shortcode_media ??
          ctx?.gql_data?.xdt_shortcode_media ??
          ctx?.shortcode_media ??
          ctx?.xdt_shortcode_media;
        const parsed = parseGraphQLMedia(media);
        if (parsed) return parsed;

        const mobile = ctx?.items?.[0] ?? ctx?.data?.items?.[0] ?? ctx;
        const video =
          mobile?.video_versions?.[0]?.url ??
          mobile?.video_url ??
          mobile?.media?.video_url;
        const image =
          mobile?.image_versions2?.candidates?.[0]?.url ??
          mobile?.display_url ??
          mobile?.media?.display_url;
        if (video || image) {
          return {
            type: video ? 'video' : 'image',
            items: [
              {
                type: video ? 'video' : 'image',
                url: video ?? image,
                thumbnail: image,
              },
            ],
            caption: mobile?.title ?? mobile?.caption,
          };
        }
      }

      const direct = extractFromHtml(html);
      if (direct) return direct;
    }
  }

  return null;
}

async function tryGraphQL(
  shortcode: string,
  csrfToken: string,
  cookieStr: string,
): Promise<IgExtractResult | null> {
  const queries = [
    // 1. Current PolarisPostRootQuery (active 2025-2026)
    {
      doc_id: '27128499623469141',
      variables: JSON.stringify({
        shortcode,
        __relay_internal__pv__PolarisAIGMMediaWebLabelEnabledrelayprovider: false,
      }),
    },
    // 2. Legacy PolarisPostActionLoadPostQueryQuery
    {
      doc_id: '8845758582119845',
      variables: JSON.stringify({
        shortcode,
        fetch_tagged_user_count: null,
        hoisted_comment_id: null,
        hoisted_reply_id: null,
      }),
    },
  ];

  for (const q of queries) {
    try {
      const body = new URLSearchParams({
        doc_id: q.doc_id,
        variables: q.variables,
      });

      const res = await fetch(`${IG_BASE}/graphql/query`, {
        method: 'POST',
        headers: {
          Accept: '*/*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Requested-With': 'XMLHttpRequest',
          'x-ig-app-id': IG_APP_ID,
          'X-CSRFToken': csrfToken,
          cookie: cookieStr,
          Referer: `${IG_BASE}/p/${shortcode}/`,
          'User-Agent': IG_UA,
        },
        body: body.toString(),
      });

      if (!res.ok) continue;
      const json = await res.json().catch(() => null);
      const media =
        json?.data?.xdt_api__v1__media__shortcode__web_info?.items?.[0] ??
        json?.data?.xdt_shortcode_media ??
        json?.data?.shortcode_media;

      const parsed = parseGraphQLMedia(media);
      if (parsed) return parsed;
    } catch (err) {
      console.warn('[Instagram] GraphQL query attempt failed:', err);
    }
  }

  return null;
}

async function tryPkMediaInfo(shortcode: string): Promise<IgExtractResult | null> {
  const pk = shortcodeToPk(shortcode);
  if (!pk || pk === '0') return null;

  const endpoints = [
    `https://i.instagram.com/api/v1/media/${pk}/info/`,
    `https://www.instagram.com/api/v1/media/${pk}/info/`,
  ];

  for (const endpoint of endpoints) {
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
      // continue
    }
  }

  return null;
}

async function tryMobileApi(shortcode: string): Promise<IgExtractResult | null> {
  try {
    const oembed = await fetch(
      `https://i.instagram.com/api/v1/oembed/?url=${encodeURIComponent(`${IG_BASE}/p/${shortcode}/`)}`,
      {
        headers: {
          'User-Agent': IG_UA,
          'x-ig-app-id': IG_APP_ID,
        },
      },
    )
      .then(r => r.json() as Promise<Record<string, any>>)
      .catch(() => null);

    const mediaId = oembed?.media_id as string | undefined;
    if (!mediaId) return null;

    const media = await fetch(`https://i.instagram.com/api/v1/media/${mediaId}/info/`, {
      headers: {
        'User-Agent': IG_UA,
        'x-ig-app-id': IG_APP_ID,
      },
    })
      .then(r => r.json() as Promise<Record<string, any>>)
      .catch(() => null);

    const item = media?.items?.[0];
    if (item) {
      return parseGraphQLMedia(item);
    }
  } catch (err) {
    console.warn('[Instagram] tryMobileApi error:', err);
  }

  return null;
}

export async function extractInstagram(url: string): Promise<IgExtractResult> {
  // Step 1: Resolve share links (e.g. /share/reel/...) to real canonical shortcodes
  const resolvedUrl = await resolveInstagramUrl(url);
  const shortcode = parseShortcode(resolvedUrl);

  // Step 2: Try Embed HTML parsing first (fastest, no login session required)
  try {
    const htmlDirect = await tryHtmlEmbed(shortcode);
    if (htmlDirect) return htmlDirect;
  } catch (err) {
    console.warn('[Instagram] tryHtmlEmbed error:', err);
  }

  // Step 3: Try GraphQL with bootstrapped session
  try {
    const { csrfToken, cookieStr } = await bootstrapSession();
    const gql = await tryGraphQL(shortcode, csrfToken, cookieStr);
    if (gql) return gql;
  } catch (err) {
    console.warn('[Instagram] tryGraphQL/bootstrap error:', err);
  }

  // Step 4: Try Numeric PK Media API endpoint
  try {
    const pkMedia = await tryPkMediaInfo(shortcode);
    if (pkMedia) return pkMedia;
  } catch (err) {
    console.warn('[Instagram] tryPkMediaInfo error:', err);
  }

  // Step 5: Try Mobile oEmbed API
  try {
    const mobile = await tryMobileApi(shortcode);
    if (mobile) return mobile;
  } catch (err) {
    console.warn('[Instagram] tryMobileApi error:', err);
  }

  // Step 6: Direct info endpoint fallback (?__a=1&__d=dis)
  try {
    const directRes = await fetch(`${IG_BASE}/p/${shortcode}/?__a=1&__d=dis`, {
      headers: {
        'User-Agent': IG_UA,
        Accept: 'application/json',
      },
    });
    if (directRes.ok) {
      const directJson = await directRes.json().catch(() => null);
      const media = directJson?.graphql?.shortcode_media ?? directJson?.items?.[0];
      if (media) {
        const parsed = parseGraphQLMedia(media);
        if (parsed) return parsed;
      }
    }
  } catch (err) {
    console.warn('[Instagram] direct info error:', err);
  }

  throw new Error('Instagram could not fetch this reel or post. Please check that the account is public and the link is valid.');
}
