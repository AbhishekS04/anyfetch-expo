import http from 'http';
import { PassThrough } from 'stream';
import fs from 'fs';
import { spawn } from 'child_process';
import { Request, Response } from 'express';
// @ts-ignore
import ffmpegStaticPath from 'ffmpeg-static';

const ANDROID_UA =
  'com.google.android.youtube/21.26.364 (Linux; U; Android 11) gzip';

// YouTube CDN enforces strict byte-range limits — chunked fetch is required
const VIDEO_CHUNK_SIZE = 2 * 1024 * 1024; // 2MB per request
const AUDIO_CHUNK_SIZE = 512 * 1024;       // 512KB per request
// Max concurrent chunk fetches per stream
const CONCURRENCY = 4;

function getFfmpegBinary(): string {
  try {
    if (fs.existsSync('/usr/bin/ffmpeg')) return '/usr/bin/ffmpeg';
    if (ffmpegStaticPath && fs.existsSync(ffmpegStaticPath)) return ffmpegStaticPath;
  } catch {}
  return 'ffmpeg';
}

function isYouTubeUrl(u?: string): boolean {
  return Boolean(u && /googlevideo\.com|youtube\.com/i.test(u));
}

/**
 * Fetch total byte length of a remote resource using Range: bytes=0-0.
 */
async function probeContentLength(url: string): Promise<number> {
  // First try Content-Length parameter embedded in YouTube CDN URL
  const clenMatch = url.match(/[?&]clen=(\d+)/);
  if (clenMatch) return parseInt(clenMatch[1], 10);

  try {
    const res = await fetch(url, {
      method: 'HEAD',
      headers: { 'User-Agent': ANDROID_UA },
    });
    const cl = res.headers.get('content-length');
    if (cl) return parseInt(cl, 10);
  } catch {}

  // Fallback: range probe
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': ANDROID_UA, Range: 'bytes=0-0' },
    });
    const cr = res.headers.get('content-range');
    const m = cr?.match(/\/(\d+)/);
    if (m) return parseInt(m[1], 10);
  } catch {}

  return 0;
}

/**
 * Pipe a YouTube CDN stream (video or audio) into a Node.js PassThrough stream,
 * using parallel chunk fetching to saturate bandwidth for long-form content.
 */
async function pipeYouTubeStream(
  targetUrl: string,
  outputStream: PassThrough,
  chunkSize: number,
  signal: AbortSignal
): Promise<void> {
  const totalLength = await probeContentLength(targetUrl);
  if (totalLength === 0) {
    // Cannot determine length — fall back to single linear fetch
    try {
      const res = await fetch(targetUrl, {
        headers: { 'User-Agent': ANDROID_UA },
        signal,
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const reader = res.body.getReader();
      while (!signal.aborted) {
        const { done, value } = await reader.read();
        if (done) break;
        outputStream.push(Buffer.from(value));
      }
    } catch (e: any) {
      if (!signal.aborted) outputStream.destroy(e);
    } finally {
      outputStream.push(null);
    }
    return;
  }

  // Build chunk ranges
  interface ChunkRange { start: number; end: number; index: number }
  const chunks: ChunkRange[] = [];
  for (let offset = 0; offset < totalLength; offset += chunkSize) {
    chunks.push({
      index: chunks.length,
      start: offset,
      end: Math.min(offset + chunkSize - 1, totalLength - 1),
    });
  }

  // We need to write chunks in ORDER, so we use an ordered buffer
  const buffers = new Array<Buffer | null>(chunks.length).fill(null);
  let nextToWrite = 0;

  async function fetchChunk(chunk: ChunkRange): Promise<void> {
    if (signal.aborted) return;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(targetUrl, {
          headers: { 'User-Agent': ANDROID_UA, Range: `bytes=${chunk.start}-${chunk.end}` },
          signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        buffers[chunk.index] = buf;
        return;
      } catch (e: any) {
        if (signal.aborted) return;
        if (attempt === 2) throw e;
        await new Promise(r => setTimeout(r, 200 * (attempt + 1)));
      }
    }
  }

  // Flush ordered buffers to stream as they arrive
  async function flushLoop(): Promise<void> {
    while (nextToWrite < chunks.length) {
      if (signal.aborted) break;
      if (buffers[nextToWrite] !== null) {
        outputStream.push(buffers[nextToWrite]);
        buffers[nextToWrite] = null; // free memory
        nextToWrite++;
      } else {
        await new Promise(r => setTimeout(r, 10));
      }
    }
  }

  // Run fetches with concurrency limit
  async function runWithConcurrency(): Promise<void> {
    let i = 0;
    const active = new Set<Promise<void>>();

    while (i < chunks.length && !signal.aborted) {
      if (active.size < CONCURRENCY) {
        const chunk = chunks[i++];
        const p = fetchChunk(chunk).finally(() => active.delete(p));
        active.add(p);
      } else {
        await Promise.race(active);
      }
    }
    await Promise.all(active);
  }

  try {
    await Promise.all([runWithConcurrency(), flushLoop()]);
  } catch (e: any) {
    if (!signal.aborted) {
      console.warn('[pipeYouTubeStream] Handled stream error:', e?.message || e);
    }
  } finally {
    outputStream.push(null);
  }
}

/**
 * On-the-fly streaming multiplexer.
 * Merges split video+audio streams in-memory and pipes directly into HTTP response.
 * For YouTube/GoogleVideo streams, provides an internal ephemeral chunk-streamer proxy
 * to satisfy CDN byte-range limits and prevent HTTP 403 Forbidden responses.
 */
export async function streamMux(
  req: Request,
  res: Response,
  options: {
    videoUrl?: string;
    audioUrl?: string;
    format?: 'mp4' | 'mp3';
    filename?: string;
  }
) {
  const { videoUrl, audioUrl, format = 'mp4', filename = 'anyfetch_download.mp4' } = options;

  if (!videoUrl && !audioUrl) {
    res.status(400).json({ error: 'Missing video or audio stream URL' });
    return;
  }

  // AbortController to cleanly stop streaming if client disconnects
  const abortController = new AbortController();
  const { signal } = abortController;

  req.on('close', () => abortController.abort());

  let proxyServer: http.Server | null = null;
  let ffmpegVideoInput = videoUrl;
  let ffmpegAudioInput = audioUrl;

  // Spin up ephemeral localhost proxy for YouTube CDN streams
  if (isYouTubeUrl(videoUrl) || isYouTubeUrl(audioUrl)) {
    try {
      // Pre-build PassThrough streams — ffmpeg reads from these
      let videoStream: PassThrough | null = null;
      let audioStream: PassThrough | null = null;

      if (isYouTubeUrl(videoUrl) && videoUrl) {
        videoStream = new PassThrough({ highWaterMark: VIDEO_CHUNK_SIZE * 2 });
        videoStream.on('error', (err) => console.warn('[Video PassThrough Handled]:', err.message));
      }
      if (isYouTubeUrl(audioUrl) && audioUrl) {
        audioStream = new PassThrough({ highWaterMark: AUDIO_CHUNK_SIZE * 2 });
        audioStream.on('error', (err) => console.warn('[Audio PassThrough Handled]:', err.message));
      }

      proxyServer = http.createServer(async (proxyReq, proxyRes) => {
        const isVideo = proxyReq.url?.startsWith('/video');
        const stream = isVideo ? videoStream : audioStream;
        const targetUrl = isVideo ? videoUrl! : audioUrl!;

        if (!stream || !targetUrl) {
          proxyRes.writeHead(404).end();
          return;
        }

        const totalLength = await probeContentLength(targetUrl);

        proxyRes.writeHead(200, {
          'Content-Type': isVideo ? 'video/mp4' : 'audio/mp4',
          'Accept-Ranges': 'none',
          ...(totalLength > 0 ? { 'Content-Length': totalLength } : {}),
        });

        stream.pipe(proxyRes);
        proxyReq.on('close', () => stream.unpipe(proxyRes));
      });

      const port = await new Promise<number>((resolve, reject) => {
        proxyServer!.listen(0, '127.0.0.1', () => {
          resolve((proxyServer!.address() as any).port);
        });
        proxyServer!.on('error', reject);
      });

      // Kick off async streaming into PassThrough pipes
      if (videoStream && videoUrl) {
        ffmpegVideoInput = `http://127.0.0.1:${port}/video`;
        pipeYouTubeStream(videoUrl, videoStream, VIDEO_CHUNK_SIZE, signal).catch(() => {});
      }
      if (audioStream && audioUrl) {
        ffmpegAudioInput = `http://127.0.0.1:${port}/audio`;
        pipeYouTubeStream(audioUrl, audioStream, AUDIO_CHUNK_SIZE, signal).catch(() => {});
      }
    } catch (err: any) {
      console.warn('[Muxer] Proxy setup error, falling back to direct:', err.message);
    }
  }

  const binary = getFfmpegBinary();
  const args: string[] = [
    '-hide_banner',
    '-loglevel', 'error',
    // Critical for streaming from our proxy — re-probe on every connection
    '-reconnect', '1',
    '-reconnect_streamed', '1',
    '-reconnect_delay_max', '5',
  ];

  if (ffmpegVideoInput) {
    args.push('-i', ffmpegVideoInput);
  }
  if (ffmpegAudioInput) {
    args.push('-i', ffmpegAudioInput);
  }

  if (format === 'mp3') {
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Disposition', `attachment; filename="${filename.replace(/\.mp4$/i, '.mp3')}"`);
    args.push('-vn', '-c:a', 'libmp3lame', '-b:a', '320k', '-f', 'mp3', 'pipe:1');
  } else {
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    if (ffmpegVideoInput && ffmpegAudioInput) {
      args.push(
        '-map', '0:v:0',
        '-map', '1:a:0',
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
        '-f', 'mp4',
        'pipe:1'
      );
    } else if (ffmpegVideoInput) {
      args.push(
        '-c:v', 'copy',
        '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
        '-f', 'mp4',
        'pipe:1'
      );
    } else {
      // Audio-only passthrough as MP4 container
      args.push(
        '-vn',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
        '-f', 'mp4',
        'pipe:1'
      );
    }
  }

  const proc = spawn(binary, args);
  proc.stdout.pipe(res);

  let stderrOutput = '';
  proc.stderr.on('data', chunk => {
    stderrOutput += chunk.toString();
  });

  const cleanup = () => {
    abortController.abort();
    if (proxyServer) {
      try { proxyServer.close(); } catch {}
      proxyServer = null;
    }
  };

  proc.on('error', err => {
    console.error('[Muxer] Spawn error:', err.message);
    cleanup();
    if (!res.headersSent) {
      res.status(500).json({ error: 'FFmpeg process failed to spawn' });
    }
  });

  proc.on('close', code => {
    cleanup();
    if (code !== 0 && code !== null) {
      console.warn(`[Muxer] FFmpeg exited with code ${code}. Stderr: ${stderrOutput.slice(-500)}`);
    }
  });

  req.on('close', () => {
    cleanup();
    if (!proc.killed) proc.kill('SIGKILL');
  });
}
