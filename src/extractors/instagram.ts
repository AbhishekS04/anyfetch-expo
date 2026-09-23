/**
 * Instagram media extractor — Expo Go compatible
 *
 * Tries three layers:
 * 1. Embed/page HTML parsing for direct video/image URLs
 * 2. Instagram GraphQL POST with the current web payload shape
 * 3. Mobile oEmbed -> media info fallback
 */

const IG_BASE = 'https://www.instagram.com';
const IG_APP_ID = '936619743392459';
const IG_UA =
  'Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

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

export function parseShortcode(rawInput: string): string {
  const url = extractUrlFromText(rawInput);
  const m = url.match(/(?:instagram\.com|instagr\.am)\/(?:p|reel|reels|tv|share\/(?:reel|p))\/([A-Za-z0-9_-]+)/i);
  if (m && m[1]) return m[1];

  const mFallback = url.match(/\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i);
  if (mFallback && mFallback[1]) return mFallback[1];

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

async function fetchPageHtml(shortcode: string): Promise<string> {
  const res = await fetch(`${IG_BASE}/p/${shortcode}/?hl=en`, {
    headers: {
      'User-Agent': IG_UA,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
    },
  });
  return res.text();
}

function parseNode(node: any): IgMediaItem {
  if (node?.is_video || node?.__typename === 'XDTGraphVideo' || node?.video_url) {
    return {
      type: 'video',
      url: node.video_url,
      thumbnail: node.thumbnail_src ?? node.display_url,
    };
  }
  return {
    type: 'image',
    url: node?.display_url,
    thumbnail: node?.display_resources?.[0]?.src ?? node?.display_url,
  };
}

function parseGraphQLMedia(media: any): IgExtractResult | null {
  if (!media) return null;

  const edges: any[] = media.edge_sidecar_to_children?.edges ?? [];
  if (edges.length) {
    const items = edges
      .map((edge: any) => edge?.node)
      .filter((node: any) => node?.display_url || node?.video_url)
      .map((node: any) => parseNode(node));
    if (items.length) {
      return {
        type: 'carousel',
        items,
        author: media.owner?.username,
        caption: media.edge_media_to_caption?.edges?.[0]?.node?.text,
      };
    }
  }

  const item = parseNode(media);
  if (!item.url) return null;
  return {
    type: item.type,
    items: [item],
    author: media.owner?.username,
    caption: media.edge_media_to_caption?.edges?.[0]?.node?.text,
  };
}

function extractObjectEntry(name: string, html: string): Record<string, any> | null {
  const re = new RegExp(String.raw`\["${name}",.*?,(\{.*?\}),\d+\]`);
  const match = html.match(re)?.[1];
  if (!match) return null;
  try {
    return JSON.parse(match);
  } catch {
    return null;
  }
}

function extractNumberFromQuery(name: string, html: string): string | null {
  const match = html.match(new RegExp(`${name}=(\\d+)`))?.[1];
  return match ?? null;
}

function parseEmbedContext(html: string): any | null {
  const initMatch = html.match(/"init",\[\],\[(.*?)\]\],/s)?.[1];
  if (initMatch) {
    try {
      const embedData = JSON.parse(initMatch) as { contextJSON?: string };
      if (embedData?.contextJSON) {
        const ctx = JSON.parse(embedData.contextJSON);
        return ctx;
      }
    } catch {
      // ignore and continue with other patterns
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
      // ignore
    }
  }

  const gqlData = html.match(/"gql_data"\s*:\s*(\{[\s\S]*?\})\s*[,}]/)?.[1];
  if (gqlData) {
    try {
      return JSON.parse(gqlData);
    } catch {
      // ignore
    }
  }

  return null;
}

function extractFromHtml(html: string): IgExtractResult | null {
  const ogVideo =
    html.match(/property="og:video:secure_url"[^>]*content="([^"]+)"/)?.[1] ??
    html.match(/property="og:video"[^>]*content="([^"]+)"/)?.[1];
  const ogImage =
    html.match(/property="og:image"[^>]*content="([^"]+)"/)?.[1] ??
    html.match(/name="twitter:image"[^>]*content="([^"]+)"/)?.[1];
  const title =
    html.match(/property="og:title"[^>]*content="([^"]+)"/)?.[1] ??
    html.match(/name="twitter:title"[^>]*content="([^"]+)"/)?.[1];

  if (ogVideo) {
    return {
      type: 'video',
      items: [{ type: 'video', url: ogVideo, thumbnail: ogImage }],
      caption: title,
    };
  }

  if (ogImage) {
    return {
      type: 'image',
      items: [{ type: 'image', url: ogImage, thumbnail: ogImage }],
      caption: title,
    };
  }

  const directVideo = html.match(/"video_url":"([^"]+)"/)?.[1];
  const directImage = html.match(/"display_url":"([^"]+)"/)?.[1];
  if (directVideo) {
    return {
      type: 'video',
      items: [{ type: 'video', url: directVideo, thumbnail: directImage }],
      caption: title,
    };
  }
  if (directImage) {
    return {
      type: 'image',
      items: [{ type: 'image', url: directImage, thumbnail: directImage }],
      caption: title,
    };
  }

  const jsonLdMatch = html.match(
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/i,
  )?.[1];
  if (jsonLdMatch) {
    try {
      const ld = JSON.parse(jsonLdMatch);
      const contentUrl = ld.contentUrl as string | undefined;
      const thumbnail = (ld.thumbnailUrl as string | undefined) ?? ogImage;
      if (contentUrl) {
        return {
          type: contentUrl.includes('.mp4') ? 'video' : 'image',
          items: [
            {
              type: contentUrl.includes('.mp4') ? 'video' : 'image',
              url: contentUrl,
              thumbnail,
            },
          ],
          caption: (ld.name as string | undefined) ?? title,
        };
      }
    } catch {
      // ignore
    }
  }

  return null;
}

async function tryHtmlEmbed(shortcode: string): Promise<IgExtractResult | null> {
  for (const suffix of ['/embed/captioned/', '/embed/']) {
    const html = await fetch(`${IG_BASE}/p/${shortcode}${suffix}`, {
      headers: {
        'User-Agent': IG_UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Sec-Fetch-Dest': 'iframe',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'cross-site',
        Referer: IG_BASE + '/',
      },
    }).then(r => r.text()).catch(() => '');

    if (!html) continue;

    const ctx = parseEmbedContext(html);
    if (ctx) {
      const media = ctx?.gql_data?.shortcode_media ?? ctx?.gql_data?.xdt_shortcode_media ?? ctx?.shortcode_media ?? ctx?.xdt_shortcode_media;
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

  return null;
}

async function tryGraphQL(
  shortcode: string,
  csrfToken: string,
  cookieStr: string,
): Promise<IgExtractResult | null> {
  const html = await fetchPageHtml(shortcode);

  const webConfig = extractObjectEntry('DGWWebConfig', html);
  const siteData = extractObjectEntry('SiteData', html);
  const polaris = extractObjectEntry('PolarisSiteData', html);
  const pushInfo = extractObjectEntry('InstagramWebPushInfo', html);
  const lsd = extractObjectEntry('LSD', html)?.token ?? 'AVrqPT0gJDo';
  const bloksVersionId = extractObjectEntry('WebBloksVersioningID', html)?.versioningID ?? '';
  const appId = webConfig?.appId ?? IG_APP_ID;
  const cometReq = extractNumberFromQuery('__comet_req', html) ?? '7';
  const jazoest = extractNumberFromQuery('jazoest', html) ?? String(Math.floor(Math.random() * 10000));
  const spinR = siteData?.__spin_r ?? '1019933358';
  const spinB = siteData?.__spin_b ?? 'trunk';
  const spinT = siteData?.__spin_t ?? String(Math.floor(Date.now() / 1000));
  const hasteSession = siteData?.haste_session ?? '20126.HYP:instagram_web_pkg.2.1...0';
  const hsi = siteData?.hsi ?? '7436540909012459023';
  const rolloutHash = pushInfo?.rollout_hash ?? '1019933358';
  const sVal = '::' + Math.random().toString(36).slice(2, 8);
  const dynVal = Array.from({ length: 154 }, () => Math.floor(Math.random() * 2).toString()).join('');
  const csrVal = Array.from({ length: 154 }, () => Math.floor(Math.random() * 2).toString()).join('');

  const anonCookie = [
    csrfToken && `csrftoken=${csrfToken}`,
    polaris?.device_id && `ig_did=${polaris.device_id}`,
    'wd=1280x720',
    'dpr=2',
    polaris?.machine_id && `mid=${polaris.machine_id}`,
    'ig_nrcb=1',
  ]
    .filter(Boolean)
    .join('; ');

  const body = new URLSearchParams({
    __d: 'www',
    __a: '1',
    __s: sVal,
    __hs: hasteSession,
    __req: 'b',
    __ccg: 'EXCELLENT',
    __rev: rolloutHash,
    __hsi: hsi,
    __dyn: dynVal,
    __csr: csrVal,
    __user: '0',
    __comet_req: cometReq,
    av: '0',
    dpr: '2',
    lsd,
    jazoest,
    __spin_r: spinR,
    __spin_b: spinB,
    __spin_t: spinT,
    fb_api_caller_class: 'RelayModern',
    fb_api_req_friendly_name: 'PolarisPostActionLoadPostQueryQuery',
    variables: JSON.stringify({
      shortcode,
      fetch_tagged_user_count: null,
      hoisted_comment_id: null,
      hoisted_reply_id: null,
    }),
    server_timestamps: 'true',
    doc_id: '8845758582119845',
  });

  const res = await fetch(`${IG_BASE}/graphql/query`, {
    method: 'POST',
    headers: {
      Accept: '*/*',
      'Accept-Language': 'en-GB,en;q=0.9',
      'Content-Type': 'application/x-www-form-urlencoded',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin',
      'X-Requested-With': 'XMLHttpRequest',
      'x-ig-app-id': String(appId),
      'X-FB-LSD': lsd,
      'X-CSRFToken': csrfToken,
      'X-FB-Friendly-Name': 'PolarisPostActionLoadPostQueryQuery',
      'x-asbd-id': '129477',
      ...(bloksVersionId ? { 'X-Bloks-Version-Id': bloksVersionId } : {}),
      cookie: cookieStr || anonCookie,
      Referer: `${IG_BASE}/p/${shortcode}/`,
    },
    body: body.toString(),
  });

  if (!res.ok) return null;
  const json = await res.json().catch(() => null);
  const media = json?.data?.xdt_shortcode_media ?? json?.data?.shortcode_media;
  return parseGraphQLMedia(media);
}

async function tryMobileApi(shortcode: string): Promise<IgExtractResult | null> {
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
  if (!item) return null;

  const carousel = item.carousel_media as any[] | undefined;
  if (carousel?.length) {
    const items = carousel
      .map(node => {
        const video = node.video_versions?.[0]?.url;
        const image = node.image_versions2?.candidates?.[0]?.url;
        if (!video && !image) return null;
        return {
          type: video ? 'video' : 'image',
          url: video ?? image,
          thumbnail: image ?? node.thumbnail_url,
        } as IgMediaItem;
      })
      .filter(Boolean) as IgMediaItem[];

    if (items.length) {
      return { type: 'carousel', items, caption: item.caption?.text };
    }
  }

  const video = item.video_versions?.[0]?.url;
  const image = item.image_versions2?.candidates?.[0]?.url ?? item.thumbnail_url;
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
      caption: item.caption?.text,
    };
  }

  return null;
}

export async function extractInstagram(url: string): Promise<IgExtractResult> {
  const shortcode = parseShortcode(url);

  // 1. Try Embed HTML parsing first (fastest and doesn't require session)
  try {
    const htmlDirect = await tryHtmlEmbed(shortcode);
    if (htmlDirect) return htmlDirect;
  } catch (err) {
    console.warn('[Instagram] tryHtmlEmbed error:', err);
  }

  // 2. Try GraphQL with bootstrapped session
  try {
    const { csrfToken, cookieStr } = await bootstrapSession();
    const gql = await tryGraphQL(shortcode, csrfToken, cookieStr);
    if (gql) return gql;
  } catch (err) {
    console.warn('[Instagram] tryGraphQL/bootstrap error:', err);
  }

  // 3. Try Mobile oEmbed info API
  try {
    const mobile = await tryMobileApi(shortcode);
    if (mobile) return mobile;
  } catch (err) {
    console.warn('[Instagram] tryMobileApi error:', err);
  }

  // 4. Try Direct info endpoint fallback (?__a=1&__d=dis)
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

  throw new Error('Instagram could not fetch this post. It may be private, rate-limited, or unavailable.');
}
