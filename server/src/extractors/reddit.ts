import { ExtractedMediaResponse, CarouselItem } from '../types';

/**
 * Reddit Media Extractor.
 * Resolves Reddit videos with split audio by piping them into our streaming muxer,
 * and handles Reddit multi-image galleries.
 */
export async function extractRedditServer(
  url: string,
  hostUrl: string
): Promise<ExtractedMediaResponse> {
  // Convert URL to Reddit JSON endpoint
  const cleanUrl = url.split('?')[0].replace(/\/+$/, '') + '.json';

  const res = await fetch(cleanUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AnyFetch/1.0',
    },
  });

  if (!res.ok) {
    throw new Error(`Reddit API returned status ${res.status}`);
  }

  const json: any = await res.json();
  const post = json?.[0]?.data?.children?.[0]?.data;
  if (!post) {
    throw new Error('Could not find post data in Reddit response');
  }

  const title = post.title || 'Reddit Post';
  const author = post.author ? `u/${post.author}` : 'Reddit User';
  const thumbnail = post.thumbnail && post.thumbnail.startsWith('http') ? post.thumbnail : '';

  // 1. Reddit Video (v.redd.it) with separate audio
  const redditVideo = post.secure_media?.reddit_video || post.media?.reddit_video;
  if (redditVideo) {
    const fallbackVideoUrl = redditVideo.fallback_url;
    // Derive DASH audio URL
    const audioUrl = fallbackVideoUrl.replace(/\/DASH_[0-9]+(?:\.mp4)?.*$/, '/DASH_audio.mp4');

    const safeTitle = encodeURIComponent(
      title.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim() || 'reddit_video'
    );

    // Stream through our muxer to combine audio + video
    const muxUrl = `${hostUrl}/api/stream?video=${encodeURIComponent(
      fallbackVideoUrl
    )}&audio=${encodeURIComponent(audioUrl)}&title=${safeTitle}.mp4`;

    return {
      success: true,
      platform: 'reddit',
      type: 'video',
      title,
      author,
      thumbnail,
      duration: redditVideo.duration,
      url: muxUrl,
    };
  }

  // 2. Reddit Image Gallery
  if (post.is_gallery && post.gallery_data?.items && post.media_metadata) {
    const items = post.gallery_data.items;
    const carouselItems: CarouselItem[] = [];

    items.forEach((item: any, idx: number) => {
      const mediaInfo = post.media_metadata[item.media_id];
      if (mediaInfo && mediaInfo.s) {
        const rawUrl = mediaInfo.s.u || mediaInfo.s.gif;
        if (rawUrl) {
          const imgUrl = rawUrl.replace(/&amp;/g, '&');
          carouselItems.push({
            index: idx,
            type: 'image',
            url: imgUrl,
            thumbnail: imgUrl,
          });
        }
      }
    });

    if (carouselItems.length > 0) {
      return {
        success: true,
        platform: 'reddit',
        type: 'carousel',
        title,
        author,
        thumbnail: carouselItems[0].url,
        url: carouselItems[0].url,
        carouselItems,
      };
    }
  }

  // 3. Single Direct Image / GIF
  if (post.url_overridden_by_dest) {
    const dest = post.url_overridden_by_dest;
    if (/\.(jpg|jpeg|png|webp|gif)$/i.test(dest)) {
      return {
        success: true,
        platform: 'reddit',
        type: 'image',
        title,
        author,
        thumbnail: dest,
        url: dest,
      };
    }
  }

  throw new Error('No downloadable video or image found in this Reddit post.');
}
