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

/** Parse tweet ID from a Twitter/X URL */
export function parseTweetId(url: string): string {
  const m = url.match(/(?:twitter|x)\.com\/[^/]+\/status(?:es)?\/(\d+)/);
  if (!m) throw new Error('Not a recognised Twitter/X tweet URL');
  return m[1];
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

export async function extractTwitter(url: string): Promise<TwExtractResult> {
  // Step 1: Resolve t.co short links
  let resolvedUrl = url;
  if (url.includes('t.co/')) {
    try {
      const r = await fetch(url, { method: 'HEAD', redirect: 'follow' });
      resolvedUrl = r.url || url;
    } catch {
      const r = await fetch(url, { method: 'GET', redirect: 'follow' });
      resolvedUrl = r.url || url;
    }
  }

  const tweetId = parseTweetId(resolvedUrl);
  const token = makeSyndicationToken(tweetId);
  const apiUrl =
    `https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}&lang=en` +
    `&features=tfw_timeline_list%3A%3Btfw_follower_count_sunset%3Atrue%3Btfw_tweet_edit_backend%3Aon%3Btfw_refsrc_session%3Aon%3Btfw_fosnr_soft_interventions_enabled%3Aon` +
    `&token=${token}`;

  const res = await fetch(apiUrl, {
    headers: {
      'User-Agent': TW_UA,
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://platform.twitter.com/',
      'Origin': 'https://platform.twitter.com',
    },
  });

  if (!res.ok) {
    throw new Error(
      `Twitter Syndication API returned HTTP ${res.status}. The tweet may be private, deleted, or the token formula may need updating.`,
    );
  }

  const data = await res.json().catch(() => null);
  if (!data) throw new Error('Twitter: failed to parse API response');

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

  throw new Error(
    'Twitter: no downloadable media found in this tweet. Only tweets with photos or videos are supported.',
  );
}
