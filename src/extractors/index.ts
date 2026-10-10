import { detectPlatform } from '../utils/download';
import { extractInstagram } from './instagram';
import { extractPinterest } from './pinterest';
import { extractTwitter } from './twitter';
import { extractYouTube } from './youtube';
import { ExtractedResult } from './types';
import {
  fetchFromAnyFetchApi,
  isAnyFetchApiEnabled,
  getAnyFetchApiUrl,
} from '../services/anyfetchApi';

export * from './types';

/**
 * Universal media extractor dispatcher.
 * Smart Hybrid Architecture:
 * 1. Prioritizes AnyFetch Cloud API for on-the-fly 1080p remuxing, watermark-free TikTok,
 *    Reddit video+audio, and bypass of platform rate limits.
 * 2. Automatically falls back to on-device extractors if the cloud service is offline or unconfigured.
 */
export async function extractMedia(rawUrl: string): Promise<ExtractedResult> {
  const platform = detectPlatform(rawUrl);
  if (!platform) {
    throw new Error('Unsupported or unrecognized platform link');
  }

  // ── Step 1: Attempt High-Speed Cloud Engine if enabled ──
  try {
    const cloudEnabled = await isAnyFetchApiEnabled();
    const apiUrl = await getAnyFetchApiUrl();

    if (cloudEnabled && apiUrl) {
      const cloudResult = await fetchFromAnyFetchApi(rawUrl, apiUrl);
      if (cloudResult && (cloudResult.url || (cloudResult.carouselItems && cloudResult.carouselItems.length > 0))) {
        return cloudResult;
      }
    }
  } catch (cloudErr: any) {
    console.warn('[Extractor] Cloud engine fallback triggered:', cloudErr?.message || cloudErr);
    // Silent failover to local extractors below
  }

  // ── Step 2: On-Device Local Extractor Fallbacks ──

  if (platform === 'youtube') {
    const yt = await extractYouTube(rawUrl);
    return {
      platform: 'youtube',
      type: 'video',
      url: yt.defaultUrl,
      thumbnail: yt.thumbnail,
      title: yt.title,
      author: yt.author,
      duration: yt.duration,
      qualities: yt.qualities,
    };
  }

  if (platform === 'instagram') {
    const ig = await extractInstagram(rawUrl);
    if (ig.type === 'carousel') {
      const carouselItems = ig.items.map((it, i) => ({
        index: i,
        type: it.type,
        url: it.url,
        thumbnail: it.thumbnail,
        selected: true,
      }));
      return {
        platform: 'instagram',
        type: 'carousel',
        url: ig.items[0]?.url || '',
        thumbnail: ig.items[0]?.thumbnail,
        title: ig.caption,
        author: ig.author,
        carouselItems,
      };
    }

    const first = ig.items[0];
    return {
      platform: 'instagram',
      type: first?.type || 'video',
      url: first?.url || '',
      thumbnail: first?.thumbnail,
      title: ig.caption,
      author: ig.author,
    };
  }

  if (platform === 'twitter') {
    const tw = await extractTwitter(rawUrl);
    if (tw.items.length > 1) {
      const carouselItems = tw.items.map((it, i) => ({
        index: i,
        type: it.type,
        url: it.url,
        thumbnail: it.thumbnail,
        selected: true,
      }));
      return {
        platform: 'twitter',
        type: 'carousel',
        url: tw.items[0]?.url || '',
        thumbnail: tw.items[0]?.thumbnail,
        title: tw.text,
        author: tw.author,
        carouselItems,
      };
    }

    const first = tw.items[0];
    return {
      platform: 'twitter',
      type: first?.type || 'video',
      url: first?.url || '',
      thumbnail: first?.thumbnail,
      title: tw.text,
      author: tw.author,
    };
  }

  if (platform === 'pinterest') {
    const pt = await extractPinterest(rawUrl);
    if (pt.type === 'video_hls') {
      return {
        platform: 'pinterest',
        type: 'video',
        url: pt.hlsUrl || pt.url || '',
        thumbnail: pt.thumbnail,
        title: pt.title,
        hlsNote:
          pt.hlsNote ||
          'This video uses HLS streaming format. Direct download may not be supported on all devices.',
      };
    }

    return {
      platform: 'pinterest',
      type: pt.type as 'video' | 'image',
      url: pt.url || '',
      thumbnail: pt.thumbnail,
      title: pt.title,
    };
  }

  if (platform === 'tiktok' || platform === 'reddit') {
    throw new Error(
      `${platform.toUpperCase()} requires the AnyFetch Cloud Engine. Please configure and enable the Cloud API URL in Settings.`
    );
  }

  throw new Error(`Platform handler for ${platform} is not implemented`);
}
