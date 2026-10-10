import { ExtractedMediaResponse, QualityOption } from '../types';

/**
 * YouTube Extractor using InnerTube ANDROID_VR + VisitorData.
 * Bypasses bot verifications and SABR player restrictions, unlocking all HD adaptive formats
 * (4K, 2K, 1080p, 720p, 480p, 360p, 240p, 144p) and crystal-clear audio streams.
 */

// Module-level cache — persists across all calls to extractYouTubeServer
let cachedVisitorData: string | undefined;
let visitorDataExpiresAt = 0;

async function getVisitorData(): Promise<string | undefined> {
  if (cachedVisitorData && Date.now() < visitorDataExpiresAt) {
    return cachedVisitorData;
  }
  try {
    const res = await fetch('https://www.youtube.com/youtubei/v1/visitor_id', {
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
    if (res.ok) {
      const data: any = await res.json();
      const v = data?.responseContext?.visitorData;
      if (v) {
        cachedVisitorData = v;
        visitorDataExpiresAt = Date.now() + 60 * 60 * 1000;
        return v;
      }
    }
  } catch {}
  return undefined;
}

export async function extractYouTubeServer(
  url: string,
  hostUrl: string
): Promise<ExtractedMediaResponse> {
  const videoIdMatch = url.match(
    /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/|v\/|live\/)|youtu\.be\/|music\.youtube\.com\/watch\?v=)([A-Za-z0-9_-]{11})/i
  );

  const videoId = videoIdMatch ? videoIdMatch[1] : null;
  if (!videoId) {
    throw new Error('Invalid YouTube video link or ID not found');
  }

  // 1. Fetch metadata via oEmbed for reliable title & author
  let title = 'YouTube Video';
  let author = 'YouTube Creator';
  try {
    const oembedRes = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    );
    if (oembedRes.ok) {
      const oembedData: any = await oembedRes.json();
      title = oembedData.title || title;
      author = oembedData.author_name || author;
    }
  } catch {}

  // 2. Fetch visitorData session token via InnerTube visitor_id endpoint
  const visitorData = await getVisitorData();

  // 3. Query InnerTube Clients with progressive fallback (ANDROID -> ANDROID_VR -> IOS)
  const innertubeClients = [
    {
      name: 'ANDROID',
      headers: {
        'User-Agent':
          'com.google.android.youtube/21.26.364 (Linux; U; Android 11) gzip',
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
        'User-Agent':
          'com.google.ios.youtube/21.26.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)',
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

  let playerData: any = null;
  let lastError: string = 'Video is unavailable or private';

  for (const clientConfig of innertubeClients) {
    try {
      const playerRes = await fetch('https://www.youtube.com/youtubei/v1/player', {
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

      if (!playerRes.ok) continue;
      const data: any = await playerRes.json();
      const hasDirectStreams = Boolean(
        data?.streamingData &&
          ((Array.isArray(data.streamingData.formats) &&
            data.streamingData.formats.some((f: any) => f.url)) ||
            (Array.isArray(data.streamingData.adaptiveFormats) &&
              data.streamingData.adaptiveFormats.some((f: any) => f.url)))
      );

      if (data?.playabilityStatus?.status === 'OK' && hasDirectStreams) {
        playerData = data;
        break;
      } else if (data?.playabilityStatus?.reason) {
        lastError = data.playabilityStatus.reason;
      }
    } catch (e: any) {
      lastError = e?.message || lastError;
    }
  }

  if (!playerData) {
    throw new Error(lastError);
  }

  const details = playerData?.videoDetails;
  title = details?.title || title;
  author = details?.author || author;
  const duration = details?.lengthSeconds ? parseInt(details.lengthSeconds, 10) : undefined;
  const thumbnail =
    details?.thumbnail?.thumbnails?.pop()?.url ||
    `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  const streamingData = playerData?.streamingData;
  if (!streamingData) {
    throw new Error('No streaming data found for this video');
  }

  // 4. Find best audio stream (m4a AAC preferred for zero-transcode remuxing)
  let bestAudioUrl: string | null = null;
  if (Array.isArray(streamingData.adaptiveFormats)) {
    const audioFormats = streamingData.adaptiveFormats.filter(
      (f: any) => f.mimeType?.includes('audio') && f.url
    );
    const m4aAudio = audioFormats.find((f: any) => f.itag === 140);
    bestAudioUrl = m4aAudio?.url || audioFormats[0]?.url || null;
  }

  const qualities: QualityOption[] = [];
  const safeFilename = encodeURIComponent(
    title.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim() || 'youtube_video'
  );

  // 5. Adaptive HD Video Formats (4K, 2K, 1080p, 720p, 480p, 360p, 240p, 144p)
  if (Array.isArray(streamingData.adaptiveFormats) && bestAudioUrl) {
    const videoAdaptive = streamingData.adaptiveFormats.filter(
      (f: any) => f.url && f.qualityLabel && typeof f.qualityLabel === 'string'
    );

    // Group by resolution number, prioritizing video/mp4 (H.264/AVC)
    const resMap = new Map<number, any>();
    for (const vf of videoAdaptive) {
      const resNum = parseInt(vf.qualityLabel, 10);
      if (!resNum) continue;

      const isMp4 = vf.mimeType?.includes('video/mp4');
      const existing = resMap.get(resNum);

      if (!existing) {
        resMap.set(resNum, vf);
      } else if (!existing.mimeType?.includes('video/mp4') && isMp4) {
        resMap.set(resNum, vf);
      } else if (isMp4 && vf.fps && existing.fps && vf.fps > existing.fps) {
        resMap.set(resNum, vf);
      }
    }

    const sortedResNums = Array.from(resMap.keys()).sort((a, b) => b - a);

    for (const resNum of sortedResNums) {
      const vf = resMap.get(resNum);
      const qId = `${resNum}p`;
      let label = `${resNum}p`;
      if (resNum >= 2160) label = `4K (${resNum}p)`;
      else if (resNum >= 1440) label = `2K (${resNum}p)`;
      else if (resNum >= 1080) label = `1080p HD`;
      else if (resNum >= 720) label = `720p HD`;
      else if (resNum >= 480) label = `480p SD`;

      if (vf.fps && vf.fps > 30) {
        label += ` (${vf.fps}fps)`;
      }

      const muxUrl = `${hostUrl}/api/stream?video=${encodeURIComponent(
        vf.url
      )}&audio=${encodeURIComponent(bestAudioUrl)}&title=${safeFilename}_${qId}.mp4`;

      qualities.push({
        id: qId,
        label,
        type: 'video',
        url: muxUrl,
        container: 'mp4',
      });
    }
  }

  // 6. Progressive Direct Streams (itag 18 / 22) — Fast, video+audio combined in 1 direct file
  let directPreviewUrl = '';
  if (Array.isArray(streamingData.formats)) {
    for (const pFmt of streamingData.formats) {
      if (pFmt.url) {
        const resLabel =
          pFmt.qualityLabel || (pFmt.itag === 18 ? '360p' : pFmt.itag === 22 ? '720p' : 'SD');
        if (!directPreviewUrl) directPreviewUrl = pFmt.url;
        qualities.push({
          id: pFmt.itag === 18 ? '360p_direct' : `${resLabel.toLowerCase().replace(/[^0-9a-z]/g, '')}_direct`,
          label: `${resLabel} (Fast Direct MP4)`,
          type: 'video',
          url: pFmt.url,
          container: 'mp4',
        });
      }
    }
  }

  // 7. Audio Downloads (MP3 320k via stream muxer & direct M4A AAC)
  if (bestAudioUrl) {
    const mp3Url = `${hostUrl}/api/stream?audio=${encodeURIComponent(
      bestAudioUrl
    )}&format=mp3&title=${safeFilename}.mp3`;

    qualities.push({
      id: 'audio',
      label: 'Audio (MP3 320k)',
      type: 'audio',
      url: mp3Url,
      container: 'mp3',
      bitrate: '320 kbps',
    });

    qualities.push({
      id: 'm4a',
      label: 'Audio (M4A AAC)',
      type: 'audio',
      url: bestAudioUrl,
      container: 'm4a',
      bitrate: '128 kbps',
    });
  }

  // Fallback if no video qualities were discovered
  if (qualities.length === 0 && directPreviewUrl) {
    qualities.push({
      id: '360p',
      label: '360p (Fast Direct MP4)',
      type: 'video',
      url: directPreviewUrl,
      container: 'mp4',
    });
  }

  // 8. Default playable URL for in-app VideoView preview:
  // Starts playing INSTANTLY in low quality (360p) with AUDIO for both videos and Shorts.
  let defaultUrl = directPreviewUrl;
  if (!defaultUrl && bestAudioUrl) {
    const lowVf =
      qualities.find(q => q.id === '360p' && q.type === 'video') ||
      qualities.find(q => q.id === '240p' && q.type === 'video') ||
      qualities.find(q => q.id === '480p' && q.type === 'video') ||
      qualities.find(q => q.type === 'video');

    if (lowVf) {
      defaultUrl = lowVf.url;
    }
  }
  if (!defaultUrl) {
    defaultUrl = qualities[0]?.url || '';
  }

  return {
    success: true,
    platform: 'youtube',
    type: 'video',
    title,
    author,
    thumbnail,
    duration,
    url: defaultUrl,
    qualities,
  };
}
