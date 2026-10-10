import { ExtractedMediaResponse, CarouselItem } from '../types';

/**
 * TikTok Extractor.
 * Extracts high-definition, watermark-free videos and photo carousels from TikTok.
 */
export async function extractTikTokServer(url: string): Promise<ExtractedMediaResponse> {
  // Strategy 1: TikWM Gateway (Ultra-fast, watermark-free direct CDN links)
  try {
    const res = await fetch('https://www.tikwm.com/api/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Linux; Android 14)',
      },
      body: new URLSearchParams({ url, count: '12', cursor: '0', web: '1', hd: '1' }),
    });

    if (res.ok) {
      const data: any = await res.json();
      if (data?.code === 0 && data.data) {
        const item = data.data;
        const title = item.title || 'TikTok Video';
        const author = item.author?.nickname || item.author?.unique_id || 'TikTok User';
        const thumbnail = item.cover || item.origin_cover || '';

        // If it's a photo slide / carousel
        if (Array.isArray(item.images) && item.images.length > 0) {
          const carouselItems: CarouselItem[] = item.images.map((imgUrl: string, idx: number) => ({
            index: idx,
            type: 'image',
            url: imgUrl,
            thumbnail: imgUrl,
          }));

          return {
            success: true,
            platform: 'tiktok',
            type: 'carousel',
            title,
            author,
            thumbnail: carouselItems[0]?.url || thumbnail,
            url: carouselItems[0]?.url || '',
            carouselItems,
          };
        }

        // HD video URL without watermark
        const videoUrl = item.hdplay || item.play || item.wmplay;
        if (videoUrl) {
          return {
            success: true,
            platform: 'tiktok',
            type: 'video',
            title,
            author,
            thumbnail,
            duration: item.duration,
            url: videoUrl,
          };
        }
      }
    }
  } catch {}

  throw new Error('Unable to extract TikTok video. Link may be invalid or restricted.');
}
