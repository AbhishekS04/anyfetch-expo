import { ExtractedMediaResponse, CarouselItem } from '../types';

/**
 * High-reliability Instagram Extractor.
 * Resolves Reels, Posts, and Carousels to direct Meta CDN URLs with zero watermarks.
 */
export async function extractInstagramServer(url: string): Promise<ExtractedMediaResponse> {
  const shortcodeMatch = url.match(/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i);
  const shortcode = shortcodeMatch ? shortcodeMatch[1] : null;

  if (!shortcode) {
    throw new Error('Invalid Instagram URL or shortcode not found');
  }

  const cleanUrl = `https://www.instagram.com/p/${shortcode}/`;

  // Strategy 1: Instagram GraphQL Public Query Endpoint
  try {
    const gqlUrl = `https://www.instagram.com/graphql/query/?query_hash=b3055c2e470540da14f5b7a326492348&variables=${encodeURIComponent(
      JSON.stringify({ shortcode, child_comment_count: 0, fetch_comment_count: 0, has_threaded_comments: false })
    )}`;

    const res = await fetch(gqlUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        Accept: 'application/json',
      },
    });

    if (res.ok) {
      const data: any = await res.json();
      const media = data?.data?.shortcode_media;
      if (media) {
        return parseInstagramMedia(media);
      }
    }
  } catch {}

  // Strategy 2: Embed Page JSON scrape
  try {
    const embedUrl = `https://www.instagram.com/p/${shortcode}/embed/captioned/`;
    const res = await fetch(embedUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
      },
    });

    if (res.ok) {
      const html = await res.text();
      // Scrape video URL
      const videoMatch = html.match(/"video_url":\s*"([^"]+)"/);
      const displayMatch = html.match(/"display_url":\s*"([^"]+)"/);
      const captionMatch = html.match(/<div class="Caption">([\s\S]*?)<\/div>/);

      const videoUrl = videoMatch ? videoMatch[1].replace(/\\u0026/g, '&') : null;
      const displayUrl = displayMatch ? displayMatch[1].replace(/\\u0026/g, '&') : '';
      const title = captionMatch
        ? captionMatch[1].replace(/<[^>]+>/g, '').trim().slice(0, 100)
        : 'Instagram Media';

      if (videoUrl) {
        return {
          success: true,
          platform: 'instagram',
          type: 'video',
          title,
          author: 'Instagram User',
          thumbnail: displayUrl,
          url: videoUrl,
        };
      } else if (displayUrl) {
        return {
          success: true,
          platform: 'instagram',
          type: 'image',
          title,
          author: 'Instagram User',
          thumbnail: displayUrl,
          url: displayUrl,
        };
      }
    }
  } catch {}

  throw new Error('Unable to extract Instagram media. Post might be private or restricted.');
}

function parseInstagramMedia(media: any): ExtractedMediaResponse {
  const isVideo = !!media.is_video;
  const caption =
    media.edge_media_to_caption?.edges?.[0]?.node?.text?.slice(0, 100) || 'Instagram Media';
  const author = media.owner?.username || media.owner?.full_name || 'Instagram User';
  const thumbnail = media.display_url || '';

  // Check for Carousel (sidecar)
  const sidecarEdges = media.edge_sidecar_to_children?.edges;
  if (Array.isArray(sidecarEdges) && sidecarEdges.length > 1) {
    const carouselItems: CarouselItem[] = sidecarEdges.map((edge: any, index: number) => {
      const node = edge.node;
      const isItemVideo = !!node.is_video;
      return {
        index,
        type: isItemVideo ? 'video' : 'image',
        url: isItemVideo ? node.video_url : node.display_url,
        thumbnail: node.display_url,
      };
    });

    return {
      success: true,
      platform: 'instagram',
      type: 'carousel',
      title: caption,
      author,
      thumbnail,
      url: carouselItems[0]?.url || '',
      carouselItems,
    };
  }

  // Single Video or Image
  const finalUrl = isVideo ? media.video_url : media.display_url;

  return {
    success: true,
    platform: 'instagram',
    type: isVideo ? 'video' : 'image',
    title: caption,
    author,
    thumbnail,
    duration: media.video_duration ? Math.round(media.video_duration) : undefined,
    url: finalUrl,
  };
}
