import { ExtractedMediaResponse, CarouselItem } from '../types';

const TW_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

function makeSyndicationToken(tweetId: string): string {
  const idNum = parseInt(tweetId.slice(0, 15), 10);
  return ((idNum / 1e15) * Math.PI)
    .toString(36)
    .replace(/(0+|\.)/g, '');
}

/**
 * Twitter / X Extractor with Multi-Strategy Fallback.
 * Strategy 1: FxTwitter API
 * Strategy 2: Official Twitter Syndication Endpoint (tokenized)
 * Strategy 3: VxTwitter API
 */
export async function extractTwitterServer(url: string): Promise<ExtractedMediaResponse> {
  const tweetIdMatch = url.match(/(?:status(?:es)?|i\/status)\/(\d+)/i);
  const tweetId = tweetIdMatch ? tweetIdMatch[1] : null;

  if (!tweetId) {
    throw new Error('Could not find Tweet ID in the provided URL');
  }

  // ── Strategy 1: FxTwitter API ──
  try {
    const fxRes = await fetch(`https://api.fxtwitter.com/status/${tweetId}`, {
      headers: { 'User-Agent': TW_UA, Accept: 'application/json' },
    });
    if (fxRes.ok) {
      const fxData: any = await fxRes.json();
      const tweet = fxData?.tweet;
      const allMedia = tweet?.media?.all ?? [];

      if (allMedia.length > 0) {
        const text = tweet?.text || 'X (Twitter) Post';
        const author = tweet?.author?.name || tweet?.author?.screen_name || 'X Creator';

        if (allMedia.length > 1) {
          const carouselItems: CarouselItem[] = allMedia.map((m: any, idx: number) => ({
            index: idx,
            type: m.type === 'video' || m.type === 'gif' ? 'video' : 'image',
            url: m.url,
            thumbnail: m.thumbnail_url || m.url,
          }));

          return {
            success: true,
            platform: 'twitter',
            type: 'carousel',
            title: text,
            author,
            thumbnail: carouselItems[0]?.url || '',
            url: carouselItems[0]?.url || '',
            carouselItems,
          };
        } else {
          const m = allMedia[0];
          const isVid = m.type === 'video' || m.type === 'gif';
          return {
            success: true,
            platform: 'twitter',
            type: isVid ? 'video' : 'image',
            title: text,
            author,
            thumbnail: m.thumbnail_url || m.url,
            url: m.url,
          };
        }
      }
    }
  } catch {}

  // ── Strategy 2: Official Twitter Syndication with Token ──
  try {
    const token = makeSyndicationToken(tweetId);
    const apiUrl =
      `https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}&lang=en` +
      `&features=tfw_timeline_list%3A%3Btfw_follower_count_sunset%3Atrue%3Btfw_tweet_edit_backend%3Aon` +
      `&token=${token}`;

    const res = await fetch(apiUrl, {
      headers: {
        'User-Agent': TW_UA,
        Accept: '*/*',
        Referer: 'https://platform.twitter.com/',
        Origin: 'https://platform.twitter.com',
      },
    });

    if (res.ok) {
      const data: any = await res.json();
      const text = data.text || 'X (Twitter) Post';
      const author = data.user?.name || data.user?.screen_name || 'X Creator';

      if (data.video) {
        const variants = data.video.variants || [];
        const mp4s = variants
          .filter((v: any) => v.type === 'video/mp4' || v.src?.includes('.mp4'))
          .sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));

        const bestVideoUrl = mp4s[0]?.src || mp4s[0]?.url;
        if (bestVideoUrl) {
          return {
            success: true,
            platform: 'twitter',
            type: 'video',
            title: text,
            author,
            thumbnail: data.video.poster || '',
            url: bestVideoUrl,
          };
        }
      }
    }
  } catch {}

  // ── Strategy 3: VxTwitter API ──
  try {
    const vxRes = await fetch(`https://api.vxtwitter.com/Twitter/status/${tweetId}`);
    if (vxRes.ok) {
      const vxData: any = await vxRes.json();
      const text = vxData.text || 'X (Twitter) Post';
      const author = vxData.user_name || vxData.user_screen_name || 'X Creator';

      if (vxData.mediaURLs && vxData.mediaURLs.length > 0) {
        const isVid = vxData.media_extended?.[0]?.type === 'video' || vxData.mediaURLs[0]?.includes('.mp4');
        return {
          success: true,
          platform: 'twitter',
          type: isVid ? 'video' : 'image',
          title: text,
          author,
          thumbnail: vxData.mediaURLs[0],
          url: vxData.mediaURLs[0],
        };
      }
    }
  } catch {}

  throw new Error('Unable to extract media from this Tweet.');
}
