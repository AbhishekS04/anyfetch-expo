import { spawn } from 'child_process';
import { Request, Response } from 'express';
// @ts-ignore
import ffmpegPath from 'ffmpeg-static';

/**
 * On-the-fly streaming multiplexer.
 * Merges split video and audio streams in-memory and pipes directly into HTTP response
 * with zero intermediate disk writes.
 */
export function streamMux(
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

  const binary = ffmpegPath || 'ffmpeg';
  const args: string[] = ['-hide_banner', '-loglevel', 'error'];

  // Input 1: Video or Audio
  if (videoUrl) {
    args.push('-headers', 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64)\r\n', '-i', videoUrl);
  }
  if (audioUrl) {
    args.push('-headers', 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64)\r\n', '-i', audioUrl);
  }

  if (format === 'mp3') {
    // Pure audio extraction (MP3 conversion on the fly)
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Disposition', `attachment; filename="${filename.replace(/\.mp4$/i, '.mp3')}"`);
    args.push('-vn', '-c:a', 'libmp3lame', '-q:a', '2', '-f', 'mp3', 'pipe:1');
  } else {
    // Video + Audio mux (Fast stream copy with fragmented MP4 flags for streaming)
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    if (videoUrl && audioUrl) {
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
    } else if (videoUrl) {
      args.push(
        '-c:v', 'copy',
        '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
        '-f', 'mp4',
        'pipe:1'
      );
    }
  }

  const proc = spawn(binary, args);

  // Stream stdout directly into client response
  proc.stdout.pipe(res);

  let stderrOutput = '';
  proc.stderr.on('data', chunk => {
    stderrOutput += chunk.toString();
  });

  proc.on('error', err => {
    console.error('[Muxer] Spawn error:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'FFmpeg process failed to spawn' });
    }
  });

  proc.on('close', code => {
    if (code !== 0 && code !== null) {
      console.warn(`[Muxer] FFmpeg exited with code ${code}. Stderr: ${stderrOutput.slice(-200)}`);
    }
  });

  // Client aborted / closed connection: terminate FFmpeg immediately
  req.on('close', () => {
    if (!proc.killed) {
      proc.kill('SIGKILL');
    }
  });
}
