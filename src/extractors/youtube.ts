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
import { getAnyFetchApiUrl, isAnyFetchApiEnabled } from '../services/anyfetchApi';

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

// Module-level visitorData cache for Android VR player
let cachedVisitorData: string | undefined;
let visitorDataExpiresAt = 0;

async function getVisitorData(): Promise<string | undefined> {
  if (cachedVisitorData && Date.now() < visitorDataExpiresAt) {
    return cachedVisitorData;
  }
  try {
    const visRes = await fetch('https://www.youtube.com/youtubei/v1/visitor_id', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        context: {
          client: {
            clientName: 'ANDROID_VR',
            clientVersion: '1.65.10',
            deviceMake: 'Oculus',
            deviceModel: 'Quest 3',
            androidSdkVersion: 32,
            osName: 'Android',
            osVersion: '12L',
            hl: 'en',
            gl: 'US',
          },
        },
      }),
    });
    if (visRes.ok) {
      const visJson: any = await visRes.json();
      const v = visJson?.responseContext?.visitorData;
      if (v) {
        cachedVisitorData = v;
        visitorDataExpiresAt = Date.now() + 60 * 60 * 1000;
        return v;
      }
    }
  } catch {}
  return cachedVisitorData;
}

/**
 * Fetch direct streams from YouTube Innertube
 */
async function fetchInnertubeStreams(
  videoId: string,
  apiUrl?: string | null
): Promise<{
  title?: string;
  author?: string;
  duration?: number;
  thumbnail?: string;
  qualities: YtQualityOption[];
} | null> {
  const visitorData = await getVisitorData();

  const innertubeClients = [
    {
      name: 'ANDROID',
      headers: {
        'User-Agent': 'com.google.android.youtube/21.26.364 (Linux; U; Android 11) gzip',
        'X-YouTube-Client-Name': '3',
        'X-YouTube-Client-Version': '21.26.364',
      },
      context: {
        client: {
          clientName: 'ANDROID',
          clientVersion: '21.26.364',
          androidSdkVersion: 30,
          osName: 'Android',
          osVersion: '11',
          hl: 'en',
          gl: 'US',
          ...(visitorData ? { visitorData } : {}),
        },
      },
    },
    {
      name: 'ANDROID_VR',
      headers: {
        'User-Agent':
          'com.google.android.apps.youtube.vr.oculus/1.65.10 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip',
        'X-YouTube-Client-Name': '28',
        'X-YouTube-Client-Version': '1.65.10',
      },
      context: {
        client: {
          clientName: 'ANDROID_VR',
          clientVersion: '1.65.10',
          deviceMake: 'Oculus',
          deviceModel: 'Quest 3',
          androidSdkVersion: 32,
          osName: 'Android',
          osVersion: '12L',
          hl: 'en',
          gl: 'US',
          ...(visitorData ? { visitorData } : {}),
        },
      },
    },
    {
      name: 'IOS',
      headers: {
        'User-Agent': 'com.google.ios.youtube/21.26.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)',
        'X-YouTube-Client-Name': '5',
        'X-YouTube-Client-Version': '21.26.4',
      },
      context: {
        client: {
          clientName: 'IOS',
          clientVersion: '21.26.4',
          deviceMake: 'Apple',
          deviceModel: 'iPhone16,2',
          osName: 'iPhone',
          osVersion: '18.3.2.22D82',
          hl: 'en',
          gl: 'US',
        },
      },
    },
  ];

  for (const clientConfig of innertubeClients) {
    try {
      const res = await fetch('https://www.youtube.com/youtubei/v1/player', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...clientConfig.headers,
        },
        body: JSON.stringify({
          context: clientConfig.context,
          videoId,
        }),
      });

      if (!res.ok) continue;
      const data = await res.json();
      if (data?.playabilityStatus?.status !== 'OK') continue;

      const streamingData = data?.streamingData;
      if (!streamingData) continue;

      const hasDirectStreams = Boolean(
        (Array.isArray(streamingData.formats) &&
          streamingData.formats.some((f: any) => f.url)) ||
          (Array.isArray(streamingData.adaptiveFormats) &&
            streamingData.adaptiveFormats.some((f: any) => f.url))
      );
      if (!hasDirectStreams) continue;

      const details = data?.videoDetails;
      const qualities: YtQualityOption[] = [];

      // Progressive streams (Combined Video + Audio, e.g. 360p itag 18, 720p itag 22)
      if (Array.isArray(streamingData.formats)) {
        for (const fmt of streamingData.formats) {
          if (fmt.url) {
            const resLabel =
              fmt.qualityLabel || (fmt.itag === 18 ? '360p' : fmt.itag === 22 ? '720p' : 'SD');
            qualities.push({
              id: resLabel.toLowerCase().replace(/[^0-9a-z]/g, ''),
              label: `${resLabel} MP4 (Direct)`,
              resolution: resLabel,
              type: 'video',
              url: fmt.url,
              container: 'mp4',
            });
          }
        }
      }

      // Best Audio stream (itag 140 m4a AAC preferred)
      let bestAudioUrl: string | null = null;
      if (Array.isArray(streamingData.adaptiveFormats)) {
        const audioFormats = streamingData.adaptiveFormats.filter(
          (f: any) => f.mimeType?.includes('audio') && f.url
        );
        const m4aAudio = audioFormats.find((f: any) => f.itag === 140);
        bestAudioUrl = m4aAudio?.url || audioFormats[0]?.url || null;
      }

      const safeTitle = encodeURIComponent(
        (details?.title || 'youtube_video').replace(/[^a-zA-Z0-9_\-\s]/g, '').trim() || 'youtube_video'
      );

      // If Cloud API is reachable and audio exists, construct muxed HD options (1080p, 720p, etc.)
      // CRITICAL: NEVER output un-muxed adaptive video streams as download options because they have NO AUDIO!
      if (apiUrl && bestAudioUrl && Array.isArray(streamingData.adaptiveFormats)) {
        for (const fmt of streamingData.adaptiveFormats) {
          if (fmt.url && fmt.mimeType?.includes('video/mp4') && fmt.qualityLabel) {
            const cleanId = fmt.qualityLabel.toLowerCase().replace(/[^0-9a-z]/g, '');
            if (!qualities.some(q => q.id === cleanId)) {
              qualities.push({
                id: cleanId,
                label: `${fmt.qualityLabel} HD (Cloud Mux)`,
                resolution: fmt.qualityLabel,
                type: 'video',
                url: `${apiUrl}/api/stream?video=${encodeURIComponent(fmt.url)}&audio=${encodeURIComponent(bestAudioUrl)}&title=${safeTitle}_${cleanId}.mp4`,
                container: 'mp4',
              });
            }
          }
        }
      }

      // Audio download options
      if (bestAudioUrl) {
        if (apiUrl) {
          qualities.push({
            id: 'audio',
            label: 'Audio (MP3 320k)',
            type: 'audio',
            url: `${apiUrl}/api/stream?audio=${encodeURIComponent(bestAudioUrl)}&format=mp3&title=${safeTitle}.mp3`,
            container: 'mp3',
            bitrate: '320 kbps',
          });
        }
        qualities.push({
          id: 'm4a',
          label: 'Audio (M4A AAC - Direct)',
          type: 'audio',
          url: bestAudioUrl,
          container: 'm4a',
          bitrate: '128 kbps',
        });
      }

      if (qualities.length > 0) {
        let bestThumb: string | undefined;
        if (Array.isArray(details?.thumbnail?.thumbnails) && details.thumbnail.thumbnails.length > 0) {
          bestThumb = details.thumbnail.thumbnails[details.thumbnail.thumbnails.length - 1]?.url;
        }
        return {
          title: details?.title,
          author: details?.author,
          duration: details?.lengthSeconds ? parseInt(details.lengthSeconds, 10) : undefined,
          thumbnail: bestThumb || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          qualities,
        };
      }
    } catch {
      // try next client
    }
  }

  return null;
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
  let thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  // 3. Primary Engine: Direct YouTube Innertube resolution
  let apiUrl: string | null = null;
  try {
    const enabled = await isAnyFetchApiEnabled();
    if (enabled) {
      apiUrl = await getAnyFetchApiUrl();
      if (apiUrl) apiUrl = apiUrl.replace(/\/+$/, '');
    }
  } catch {}

  const innertubeResult = await fetchInnertubeStreams(videoId, apiUrl);
  if (innertubeResult && innertubeResult.qualities.length > 0) {
    if (innertubeResult.title) title = innertubeResult.title;
    if (innertubeResult.author) author = innertubeResult.author;
    if (innertubeResult.duration) duration = innertubeResult.duration;
    if (innertubeResult.thumbnail) thumbnail = innertubeResult.thumbnail;
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

  // Sort qualities: 1080p -> 720p -> 480p -> 360p -> 240p -> 144p -> audio -> m4a
  const order: Record<string, number> = {
    '1080p': 1,
    '720p': 2,
    '480p': 3,
    '360p': 4,
    '240p': 5,
    '144p': 6,
    'audio': 7,
    'm4a': 8,
  };
  discoveredStreams.sort((a, b) => (order[a.id] || 99) - (order[b.id] || 99));

  // Default playable URL for VideoView preview:
  // Starts playing INSTANTLY in lightweight progressive quality (360p) with audio built-in.
  const videoStream =
    discoveredStreams.find(q => q.id === '360p' && q.type === 'video' && !q.url.includes('/api/stream')) ||
    discoveredStreams.find(q => q.id === '360p' && q.type === 'video') ||
    discoveredStreams.find(q => q.id === '480p' && q.type === 'video') ||
    discoveredStreams.find(q => q.id === '720p' && q.type === 'video') ||
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
