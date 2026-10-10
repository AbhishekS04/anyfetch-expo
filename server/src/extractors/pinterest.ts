import { ExtractedMediaResponse } from '../types';

/**
 * Pinterest Extractor.
 * Resolves Pins and Shortlinks (pin.it) to direct high-res MP4 videos or images.
 */
export async function extractPinterestServer(url: string): Promise<ExtractedMediaResponse> {
  // 1. Resolve shortlink if needed
  let targetUrl = url;
  if (/pin\.it/i.test(url)) {
    const headRes = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    targetUrl = headRes.url || url;
  }

  const res = await fetch(targetUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    },
  });

  if (!res.ok) {
    throw new Error('Could not fetch Pinterest page');
  }

  const html = await res.text();

  // Try parsing JSON-LD or script tags
  let videoUrl: string | null = null;
  let imageUrl: string | null = null;
  let title = 'Pinterest Pin';

  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  if (titleMatch) {
    title = titleMatch[1].replace(/ \| Pinterest.*/, '').trim();
  }

  // Check for MP4 video
  const mp4Match = html.match(/https:\/\/[^"'\s]+\.pinimg\.com\/videos\/[^"'\s]+\.mp4/);
  if (mp4Match) {
    videoUrl = mp4Match[0];
  } else {
    // Check for 720p / mobile mp4
    const anyMp4 = html.match(/"(https:\/\/[^"]+\.mp4)"/);
    if (anyMp4) videoUrl = anyMp4[1].replace(/\\u0026/g, '&');
  }

  // Check for high-res 736x or originals image
  const imgMatch = html.match(/"(https:\/\/i\.pinimg\.com\/originals\/[^"]+)"/);
  const img736Match = html.match(/"(https:\/\/i\.pinimg\.com\/736x\/[^"]+)"/);
  imageUrl = imgMatch ? imgMatch[1] : img736Match ? img736Match[1] : null;

  if (videoUrl) {
    return {
      success: true,
      platform: 'pinterest',
      type: 'video',
      title,
      author: 'Pinterest Creator',
      thumbnail: imageUrl || '',
      url: videoUrl,
    };
  }

  if (imageUrl) {
    return {
      success: true,
      platform: 'pinterest',
      type: 'image',
      title,
      author: 'Pinterest Creator',
      thumbnail: imageUrl,
      url: imageUrl,
    };
  }

  throw new Error('No downloadable video or image found on this Pinterest pin.');
}
