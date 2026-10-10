/**
 * YouTube media extractor — Expo & Standalone APK compatible
 *
 * Supports:
 * - youtube.com/watch?v=ID
 * - youtu.be/ID
 * - youtube.com/shorts/ID
 * - youtube.com/embed/ID
 * - m.youtube.com/watch?v=ID
 * - music.youtube.com/watch?v=ID
 */

import { extractUrlFromText } from '../utils/download';

export interface YtQualityOption {
  id: string; // '1080p' | '720p' | '480p' | '360p' | 'audio'
  label: string; // '1080p HD' | '720p HD' | '480p SD' | '360p' | 'Audio (MP3)'
  resolution?: string;
  type: 'video' | 'audio';
  url: string;
  container: 'mp4' | 'mp3' | 'm4a';
  bitrate?: string;
}

export interface YtExtractResult {
  id: string;
  type: 'video';
  title: string;
  author: string;
  duration: number; // in seconds
  thumbnail: string;
  defaultUrl: string;
  qualities: YtQualityOption[];
  initialTimestamp?: number;
}

/**
 * Extracts 11-character YouTube video ID and optional timestamp from any YouTube URL.
 */
export function parseYouTubeId(rawInput: string): { id: string; timestamp?: number } {
  const url = extractUrlFromText(rawInput);
  if (!url) throw new Error('Not a recognised YouTube link');

  // Parse timestamp if present (e.g. ?t=45, ?t=1m30s, &start=45)
  let timestamp: number | undefined;
  const tMatch = url.match(/[?&](?:t|start)=([0-9hm]+)/i);
  if (tMatch && tMatch[1]) {
    const rawT = tMatch[1].toLowerCase();
    if (/^\d+$/.test(rawT)) {
      timestamp = parseInt(rawT, 10);
    } else {
      const h = rawT.match(/(\d+)h/)?.[1];
      const m = rawT.match(/(\d+)m/)?.[1];
      const s = rawT.match(/(\d+)s/)?.[1];
      timestamp = (parseInt(h || '0', 10) * 3600) + (parseInt(m || '0', 10) * 60) + parseInt(s || '0', 10);
    }
  }

  // Common YouTube URL formats
  const patterns = [
    /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/|v\/|live\/)|youtu\.be\/|music\.youtube\.com\/watch\?v=)([A-Za-z0-9_-]{11})/i,
    /\/([A-Za-z0-9_-]{11})(?:\?|&|$)/,
  ];

  for (const pat of patterns) {
    const m = url.match(pat);
    if (m && m[1]) {
      return { id: m[1], timestamp };
    }
  }

  throw new Error('Could not find YouTube video ID in this link.');
}

/**
 * Fetch video metadata via YouTube oEmbed
 */
async function fetchOEmbedInfo(videoId: string): Promise<{ title: string; author: string } | null> {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          Accept: 'application/json',
        },
      },
    );
    if (res.ok) {
      const data = await res.json();
      return {
        title: data.title || 'YouTube Video',
        author: data.author_name || 'YouTube Creator',
      };
    }
  } catch {
    // fallback
  }
  return null;
}

/**
 * Fetch direct streams from YouTube Innertube ANDROID_VR client
 */
async function fetchInnertubeStreams(videoId: string): Promise<{
  title?: string;
  author?: string;
  duration?: number;
  qualities: YtQualityOption[];
} | null> {
  try {
    const res = await fetch('https://www.youtube.com/youtubei/v1/player', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Android; Mobile)',
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: 'ANDROID_VR',
            clientVersion: '1.61.48',
            deviceMake: 'Oculus',
            deviceModel: 'Quest 3',
            hl: 'en',
            gl: 'US',
          },
        },
        videoId,
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    if (data?.playabilityStatus?.status !== 'OK') return null;

    const details = data?.videoDetails;
    const streamingData = data?.streamingData;
    if (!streamingData) return null;

    const qualities: YtQualityOption[] = [];

    // Progressive streams (Combined Video + Audio, e.g. 360p itag 18, 720p itag 22)
    if (Array.isArray(streamingData.formats)) {
      for (const fmt of streamingData.formats) {
        if (fmt.url) {
          const resLabel =
            fmt.qualityLabel || (fmt.itag === 18 ? '360p' : fmt.itag === 22 ? '720p' : 'SD');
          qualities.push({
            id: resLabel.toLowerCase().replace(/[^0-9a-z]/g, ''),
            label: `${resLabel} MP4`,
            resolution: resLabel,
            type: 'video',
            url: fmt.url,
            container: 'mp4',
          });
        }
      }
    }

    // Adaptive streams (1080p, 720p, audio only itag 140)
    if (Array.isArray(streamingData.adaptiveFormats)) {
      for (const fmt of streamingData.adaptiveFormats) {
        if (fmt.url) {
          if (fmt.mimeType?.includes('audio') && fmt.itag === 140) {
            qualities.push({
              id: 'audio',
              label: 'Audio (M4A / MP3)',
              type: 'audio',
              url: fmt.url,
              container: 'mp3',
              bitrate: '128 kbps',
            });
          } else if (fmt.mimeType?.includes('video/mp4') && fmt.qualityLabel) {
            const cleanId = fmt.qualityLabel.toLowerCase().replace(/[^0-9a-z]/g, '');
            if (!qualities.some(q => q.id === cleanId)) {
              qualities.push({
                id: cleanId,
                label: `${fmt.qualityLabel} HD`,
                resolution: fmt.qualityLabel,
                type: 'video',
                url: fmt.url,
                container: 'mp4',
              });
            }
          }
        }
      }
    }

    return {
      title: details?.title,
      author: details?.author,
      duration: details?.lengthSeconds ? parseInt(details.lengthSeconds, 10) : undefined,
      qualities,
    };
  } catch {
    return null;
  }
}

/**
 * Main YouTube extraction function
 */
export async function extractYouTube(rawInput: string): Promise<YtExtractResult> {
  const { id: videoId, timestamp } = parseYouTubeId(rawInput);

  // 1. Fetch title and author via oEmbed
  const oembed = await fetchOEmbedInfo(videoId);
  let title = oembed?.title || `YouTube Video (${videoId})`;
  let author = oembed?.author || 'YouTube';
  let duration = 180;
  let discoveredStreams: YtQualityOption[] = [];

  // 2. High-resolution thumbnail
  const thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  // 3. Primary Engine: Direct YouTube Innertube resolution
  const innertubeResult = await fetchInnertubeStreams(videoId);
  if (innertubeResult && innertubeResult.qualities.length > 0) {
    if (innertubeResult.title) title = innertubeResult.title;
    if (innertubeResult.author) author = innertubeResult.author;
    if (innertubeResult.duration) duration = innertubeResult.duration;
    discoveredStreams = innertubeResult.qualities;
  }

  // 4. Secondary Engine: Query Invidious API instances if Innertube did not resolve streams
  if (discoveredStreams.length === 0) {
    const publicInstances = [
      'https://invidious.f5.si',
      'https://inv.nadeko.net',
      'https://invidious.nerdvpn.de',
    ];

    for (const base of publicInstances) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);

        const res = await fetch(`${base}/api/v1/videos/${videoId}`, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
            Accept: 'application/json',
          },
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          const contentType = res.headers.get('content-type') || '';
          if (!contentType.includes('application/json')) continue;

          const data = await res.json();
          if (data.lengthSeconds) {
            duration = parseInt(data.lengthSeconds, 10);
          }
          if (data.title) title = data.title;
          if (data.author) author = data.author;

          if (Array.isArray(data.formatStreams)) {
            for (const f of data.formatStreams) {
              if (f.url && f.container === 'mp4') {
                discoveredStreams.push({
                  id: f.resolution || f.qualityLabel || '360p',
                  label: `${f.resolution || '360p'} MP4`,
                  resolution: f.resolution,
                  type: 'video',
                  url: f.url,
                  container: 'mp4',
                });
              }
            }
          }

          if (discoveredStreams.length > 0) break;
        }
      } catch {
        // try next instance
      }
    }
  }

  if (discoveredStreams.length === 0) {
    throw new Error(
      'YouTube is restricting direct downloads for this video (login or bot check required). Please try another video or YouTube Short.'
    );
  }

  // Sort qualities: 1080p -> 720p -> 480p -> 360p -> audio
  const order: Record<string, number> = {
    '1080p': 1,
    '720p': 2,
    '480p': 3,
    '360p': 4,
    'audio': 5,
  };
  discoveredStreams.sort((a, b) => (order[a.id] || 99) - (order[b.id] || 99));

  // Default playable URL for VideoView preview
  const videoStream =
    discoveredStreams.find(q => q.id === '720p') ||
    discoveredStreams.find(q => q.id === '360p') ||
    discoveredStreams.find(q => q.type === 'video') ||
    discoveredStreams[0];

  return {
    id: videoId,
    type: 'video',
    title,
    author,
    duration,
    thumbnail,
    defaultUrl: videoStream.url,
    qualities: discoveredStreams,
    initialTimestamp: timestamp,
  };
}
