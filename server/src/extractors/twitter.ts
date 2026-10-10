import { ExtractedMediaResponse, CarouselItem } from '../types';

/**
 * Twitter / X Extractor.
 * Extracts high-bitrate video clips, GIFs, and multi-photo tweets without API keys.
 */
export async function extractTwitterServer(url: string): Promise<ExtractedMediaResponse> {
  const tweetIdMatch = url.match(/(?:status(?:es)?|i\/status)\/(\d+)/i);
  const tweetId = tweetIdMatch ? tweetIdMatch[1] : null;

  if (!tweetId) {
    throw new Error('Could not find Tweet ID in the provided URL');
  }

  // Strategy 1: Official Twitter Syndication Tokenless Endpoint
  try {
    const res = await fetch(
      `https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}&lang=en`,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          Accept: 'application/json',
        },
      }
    );

    if (res.ok) {
      const data: any = await res.json();
      const text = data.text || 'X (Twitter) Post';
      const author = data.user?.name || data.user?.screen_name || 'X Creator';

      // Check for Video / GIF
      if (data.video) {
        const variants = data.video.variants || [];
        // Sort MP4 variants by bitrate descending
        const mp4s = variants
          .filter((v: any) => v.type === 'video/mp4' || v.src?.includes('.mp4'))
          .sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));

        const bestVideoUrl = mp4s[0]?.src || mp4s[0]?.url;
        const thumbnail = data.video.poster || data.mediaDetails?.[0]?.media_url_https || '';

        if (bestVideoUrl) {
          return {
            success: true,
            platform: 'twitter',
            type: 'video',
            title: text,
            author,
            thumbnail,
            url: bestVideoUrl,
          };
        }
      }

      // Check for Photos / Multiple Photos
      const photos = data.photos || data.mediaDetails?.filter((m: any) => m.type === 'photo');
      if (Array.isArray(photos) && photos.length > 0) {
        if (photos.length > 1) {
          const carouselItems: CarouselItem[] = photos.map((p: any, idx: number) => {
            const imgUrl = p.url || p.media_url_https;
            return {
              index: idx,
              type: 'image',
              url: imgUrl,
              thumbnail: imgUrl,
            };
          });

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
          const imgUrl = photos[0].url || photos[0].media_url_https;
          return {
            success: true,
            platform: 'twitter',
            type: 'image',
            title: text,
            author,
            thumbnail: imgUrl,
            url: imgUrl,
          };
        }
      }
    }
  } catch {}

  // Strategy 2: vxtwitter API fallback
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
