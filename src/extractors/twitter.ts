/**
 * Twitter / X media extractor — Expo Go compatible
 *
 * Uses the Twitter Syndication API (cdn.syndication.twimg.com) — no Bearer
 * token or login required. Pure fetch(), no native modules.
 *
 * Supported URL formats:
 *   https://twitter.com/<user>/status/<id>
 *   https://x.com/<user>/status/<id>
 *   https://t.co/<short>
 */

const TW_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export type TwMediaType = 'video' | 'gif' | 'image';

export interface TwMediaItem {
  type: 'video' | 'image';
  url: string;
  thumbnail?: string;
  bitrate?: number;
}

export interface TwExtractResult {
  type: TwMediaType;
  items: TwMediaItem[];
  author?: string;
  text?: string;
}

import { extractUrlFromText } from '../utils/download';

/** Parse tweet ID from a Twitter/X URL */
export function parseTweetId(rawInput: string): string {
  const url = extractUrlFromText(rawInput);
  const m = url.match(/(?:twitter|x)\.com\/(?:[^/]+\/status(?:es)?|i\/status)\/(\d+)/i);
  if (m && m[1]) return m[1];

  const mFallback = url.match(/\/status(?:es)?\/(\d+)/i);
  if (mFallback && mFallback[1]) return mFallback[1];

  throw new Error('Not a recognised Twitter/X tweet URL');
}

/**
 * Token formula used by Twitter's own embedded-tweet widget.
 * Derived from the public JS bundle — no secret key involved.
 */
function makeSyndicationToken(tweetId: string): string {
  const idNum = parseInt(tweetId.slice(0, 15), 10);
  const token = ((idNum / 1e15) * Math.PI)
    .toString(36)
    .replace(/(0+|\.)/g, '');
  return token;
}

/** Best-quality MP4 from a Twitter video_info variants array */
function bestVariant(variants: any[]): { url: string; bitrate: number } | null {
  const mp4 = variants
    .filter((v: any) => v.content_type === 'video/mp4' && v.url)
    .sort((a: any, b: any) => (b.bitrate ?? 0) - (a.bitrate ?? 0));
  if (!mp4.length) return null;
  return { url: mp4[0].url, bitrate: mp4[0].bitrate ?? 0 };
}

async function tryFallbackTwitterApis(tweetId: string): Promise<TwExtractResult | null> {
  // Try FxTwitter API
  try {
    const fxRes = await fetch(`https://api.fxtwitter.com/status/${tweetId}`, {
      headers: { 'User-Agent': TW_UA, Accept: 'application/json' },
    });
    if (fxRes.ok) {
      const fxData = await fxRes.json();
      const tweet = fxData?.tweet;
      const allMedia = tweet?.media?.all ?? [];
      if (allMedia.length > 0) {
        const items: TwMediaItem[] = allMedia.map((m: any) => ({
          type: m.type === 'video' || m.type === 'gif' ? 'video' : 'image',
          url: m.url,
          thumbnail: m.thumbnail_url || m.url,
        }));
        return {
          type: items.some(i => i.type === 'video') ? 'video' : 'image',
          items,
          author: tweet?.author?.name ?? '',
          text: tweet?.text ?? '',
        };
      }
    }
  } catch (err) {
    console.warn('[Twitter] FxTwitter fallback failed:', err);
  }

  // Try VxTwitter API
  try {
    const vxRes = await fetch(`https://api.vxtwitter.com/Twitter/status/${tweetId}`, {
      headers: { 'User-Agent': TW_UA, Accept: 'application/json' },
    });
    if (vxRes.ok) {
      const vxData = await vxRes.json();
      const mediaList = vxData?.media_extended ?? [];
      if (mediaList.length > 0) {
        const items: TwMediaItem[] = mediaList.map((m: any) => ({
          type: m.type === 'video' || m.type === 'gif' ? 'video' : 'image',
          url: m.url,
          thumbnail: m.thumbnail_url || m.url,
        }));
        return {
          type: items.some(i => i.type === 'video') ? 'video' : 'image',
          items,
          author: vxData?.user_name ?? '',
          text: vxData?.text ?? '',
        };
      }
    }
  } catch (err) {
    console.warn('[Twitter] VxTwitter fallback failed:', err);
  }

  return null;
}

async function resolveTwitterShortlink(cleanUrl: string): Promise<string> {
  if (!cleanUrl.includes('t.co/')) return cleanUrl;

  try {
    const res = await fetch(cleanUrl, {
      method: 'GET',
      headers: { 'User-Agent': TW_UA },
      redirect: 'follow',
    });

    if (res.url && (res.url.includes('twitter.com') || res.url.includes('x.com'))) {
      return res.url;
    }

    const html = await res.text();
    const metaRefresh = html.match(/<meta[^>]*http-equiv=["']refresh["'][^>]*content=["'][^;]+;\s*url=([^"']+)["']/i);
    if (metaRefresh && metaRefresh[1]) {
      return metaRefresh[1];
    }

    const titleUrl = html.match(/https?:\/\/(?:twitter|x)\.com\/[^"'\s<]+/i);
    if (titleUrl) {
      return titleUrl[0];
    }
  } catch (err) {
    console.warn('[Twitter] Failed to resolve t.co link:', err);
  }

  return cleanUrl;
}

export async function extractTwitter(url: string): Promise<TwExtractResult> {
  const cleanUrl = extractUrlFromText(url);
  const resolvedUrl = await resolveTwitterShortlink(cleanUrl);
  const tweetId = parseTweetId(resolvedUrl);

  // 1. Try Twitter Syndication API
  try {
    const token = makeSyndicationToken(tweetId);
    const apiUrl =
      `https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}&lang=en` +
      `&features=tfw_timeline_list%3A%3Btfw_follower_count_sunset%3Atrue%3Btfw_tweet_edit_backend%3Aon%3Btfw_refsrc_session%3Aon%3Btfw_fosnr_soft_interventions_enabled%3Aon` +
      `&token=${token}`;

    const res = await fetch(apiUrl, {
      headers: {
        'User-Agent': TW_UA,
        Accept: '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        Referer: 'https://platform.twitter.com/',
        Origin: 'https://platform.twitter.com',
      },
    });

    if (res.ok) {
      const data = await res.json().catch(() => null);
      if (data) {
        const author: string = data.user?.name ?? data.user?.screen_name ?? '';
        const text: string = data.text ?? '';
        const mediaEntities: any[] =
          data.mediaDetails ??
          data.extended_entities?.media ??
          data.entities?.media ??
          [];

        const items: TwMediaItem[] = [];
        for (const media of mediaEntities) {
          if (media.type === 'video' || media.type === 'animated_gif') {
            const videoInfo = media.video_info ?? media.videoInfo;
            const variants: any[] = videoInfo?.variants ?? [];
            const best = bestVariant(variants);
            if (best) {
              items.push({
                type: 'video',
                url: best.url,
                thumbnail: media.media_url_https ?? media.media_url,
                bitrate: best.bitrate,
              });
            }
          } else if (media.type === 'photo') {
            const imgUrl =
              (media.media_url_https ?? media.media_url ?? '') + '?format=jpg&name=orig';
            items.push({
              type: 'image',
              url: imgUrl,
              thumbnail: media.media_url_https ?? media.media_url,
            });
          }
        }

        if (items.length > 0) {
          const hasVideo = items.some(i => i.type === 'video');
          const isGif = mediaEntities[0]?.type === 'animated_gif';
          return {
            type: hasVideo ? (isGif ? 'gif' : 'video') : 'image',
            items,
            author,
            text,
          };
        }
      }
    }
  } catch (err) {
    console.warn('[Twitter] Syndication API failed, falling back:', err);
  }

  // 2. Try Fallback APIs
  const fallbackResult = await tryFallbackTwitterApis(tweetId);
  if (fallbackResult) {
    return fallbackResult;
  }

  throw new Error(
    'Twitter: no downloadable media found in this tweet. Only tweets with photos or videos are supported.',
  );
}
