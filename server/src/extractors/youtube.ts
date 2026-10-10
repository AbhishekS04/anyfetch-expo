import { ExtractedMediaResponse, QualityOption } from '../types';

/**
 * YouTube Extractor using InnerTube Android Client.
 * Bypasses signature ciphers and bot verifications by mimicking official Android mobile app.
 */
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

  // 2. Query InnerTube Android Client
  const playerRes = await fetch('https://www.youtube.com/youtubei/v1/player', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'com.google.android.youtube/19.29.35 (Linux; U; Android 14) gzip',
    },
    body: JSON.stringify({
      context: {
        client: {
          clientName: 'ANDROID',
          clientVersion: '19.29.35',
          hl: 'en',
          gl: 'US',
        },
      },
      videoId,
    }),
  });

  if (!playerRes.ok) {
    throw new Error(`InnerTube returned status ${playerRes.status}`);
  }

  const playerData: any = await playerRes.json();
  if (playerData?.playabilityStatus?.status !== 'OK') {
    const reason = playerData?.playabilityStatus?.reason || 'Video is unavailable or private';
    throw new Error(reason);
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

  // Find best audio stream (m4a or opus)
  let bestAudioUrl: string | null = null;
  if (Array.isArray(streamingData.adaptiveFormats)) {
    const audioFormats = streamingData.adaptiveFormats.filter((f: any) =>
      f.mimeType?.includes('audio') && f.url
    );
    // Prefer itag 140 (m4a AAC) for instantaneous stream copying without transcoding
    const m4aAudio = audioFormats.find((f: any) => f.itag === 140);
    bestAudioUrl = m4aAudio?.url || audioFormats[0]?.url || null;
  }

  const qualities: QualityOption[] = [];
  const safeFilename = encodeURIComponent(
    title.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim() || 'youtube_video'
  );

  // Progressive Formats (Audio + Video combined in 1 file; Direct CDN pass-through)
  if (Array.isArray(streamingData.formats)) {
    for (const fmt of streamingData.formats) {
      if (fmt.url) {
        const resLabel =
          fmt.qualityLabel || (fmt.itag === 18 ? '360p' : fmt.itag === 22 ? '720p' : 'SD');
        qualities.push({
          id: resLabel.toLowerCase().replace(/[^0-9a-z]/g, ''),
          label: `${resLabel} (Fast Direct)`,
          type: 'video',
          url: fmt.url,
          container: 'mp4',
        });
      }
    }
  }

  // Adaptive HD Formats (1080p, 1440p, 4K) -> Muxed on the fly via /api/stream
  if (Array.isArray(streamingData.adaptiveFormats) && bestAudioUrl) {
    const videoFormats = streamingData.adaptiveFormats.filter(
      (f: any) => f.mimeType?.includes('video/mp4') && f.qualityLabel && f.url
    );

    for (const vf of videoFormats) {
      const qId = vf.qualityLabel.toLowerCase().replace(/[^0-9a-z]/g, '');
      if (!qualities.some(q => q.id === qId)) {
        // Stream URL piped through our streaming muxer
        const muxUrl = `${hostUrl}/api/stream?video=${encodeURIComponent(
          vf.url
        )}&audio=${encodeURIComponent(bestAudioUrl)}&title=${safeFilename}.mp4`;

        qualities.push({
          id: qId,
          label: `${vf.qualityLabel} HD (Muxed)`,
          type: 'video',
          url: muxUrl,
          container: 'mp4',
        });
      }
    }
  }

  // Audio MP3 download option
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
  }

  // Sort qualities highest first
  qualities.sort((a, b) => {
    const numA = parseInt(a.id, 10) || 0;
    const numB = parseInt(b.id, 10) || 0;
    return numB - numA;
  });

  const defaultUrl = qualities[0]?.url || '';

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
