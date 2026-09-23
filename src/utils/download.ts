/**
 * Download utility — Expo Go + Android SDK 56.
 *
 * Uses direct file downloads into app cache, then saves via StorageAccessFramework
 * (custom folder) or the native share sheet. Header retries are tuned for common
 * social CDN hosts so direct media URLs stay downloadable after extractor changes.
 */

import {
  documentDirectory,
  cacheDirectory,
  StorageAccessFramework,
  readAsStringAsync,
  deleteAsync,
  downloadAsync,
  getInfoAsync,
} from 'expo-file-system/legacy';
import { EncodingType } from 'expo-file-system';
import * as Sharing from 'expo-sharing'
import { Platform } from 'react-native';

export interface DownloadProgress {
  received: number;
  total: number;
  fraction: number;
}

export interface DownloadResult {
  ok: boolean;
  uri?: string;
  error?: string;
}

/**
 * Extracts the first valid HTTP/HTTPS URL from any string or clipboard text.
 * Automatically cleans leading/trailing punctuation and social media share captions.
 * Example: "Check out this reel https://www.instagram.com/reel/C8XYZ/?igsh=123 sent via app"
 * -> "https://www.instagram.com/reel/C8XYZ/?igsh=123"
 */
export function extractUrlFromText(text: string): string {
  if (!text) return '';
  const trimmed = text.trim();
  const match = trimmed.match(/https?:\/\/[^\s<>"'{}|\\^`[\]]+/i);
  if (match) {
    let clean = match[0];
    clean = clean.replace(/[.,;:!?)]+$/, '');
    return clean;
  }
  return trimmed;
}

/** Detect platform from pasted URL or freeform text containing a link */
export function detectPlatform(
  rawText: string,
): 'instagram' | 'pinterest' | 'twitter' | null {
  if (!rawText) return null;
  const clean = extractUrlFromText(rawText).toLowerCase();
  if (!clean) return null;

  // Instagram: handles posts, reels (singular & plural), share URLs, stories, tv, instagr.am
  if (
    /(?:instagram\.com|instagr\.am)\/(?:p|reel|reels|tv|share\/(?:reel|p))\//i.test(clean) ||
    /(?:instagram\.com|instagr\.am)\/[^/]+\/(?:p|reel|reels)\//i.test(clean)
  ) {
    return 'instagram';
  }

  // Pinterest: handles pin.it and pinterest.* pins
  if (
    /pin\.it\/[A-Za-z0-9_-]+/i.test(clean) ||
    /pinterest\.[a-z.]+\/pin\//i.test(clean) ||
    /pinterest\.com\/pin\//i.test(clean)
  ) {
    return 'pinterest';
  }

  // Twitter / X: handles twitter.com, x.com, mobile.twitter.com, t.co, /i/status/, etc.
  if (
    /(?:twitter|x)\.com\/(?:[^/]+\/status(?:es)?\/\d+|i\/status\/\d+)/i.test(clean) ||
    /t\.co\/[A-Za-z0-9_-]+/i.test(clean)
  ) {
    return 'twitter';
  }

  return null;
}

/** Generate a unique filename */
function makeFilename(url: string, type: 'video' | 'image' | 'audio'): string {
  const ext = type === 'video' ? 'mp4' : type === 'audio' ? 'mp3' : 'jpg';
  const ts = Date.now();
  const seg = url.split('/').pop()?.split('?')[0]?.replace(/[^a-zA-Z0-9_-]/g, '') ?? '';
  return `anyfetch_${seg.slice(0, 12) || ts}_${ts}.${ext}`;
}

export async function requestMediaPermission(): Promise<boolean> {
  return true; // sharing/SAF flow — no media library permission needed
}

/** One download attempt; returns size in bytes (0 = failed / empty) */
async function attemptDownload(
  url: string,
  localUri: string,
  headers: Record<string, string>,
  onProgress?: (p: DownloadProgress) => void,
): Promise<{ uri: string; size: number; status: number }> {
  // Clean up stale file if present
  await deleteAsync(localUri, { idempotent: true }).catch(() => {});

  const result = await downloadAsync(url, localUri, { headers });
  if (!result?.uri) return { uri: localUri, size: 0, status: 0 };

  if (onProgress) {
   onProgress({ received: 1, total: 1, fraction: 1 });
  }

  const info = await getInfoAsync(result.uri);
  const size = info.exists && 'size' in info ? (info.size ?? 0) : 0;
  return { uri: result.uri, size, status: result.status ?? 0 };
}

function buildHeaders(url: string, variant: 'bare' | 'browser' | 'android'): Record<string, string> {
  let referer = '';
  try {
   const host = new URL(url).hostname.toLowerCase();
   if (host.includes('twimg.com') || host.includes('twitter.com') || host.includes('x.com')) {
     referer = 'https://x.com/';
   } else if (host.includes('instagram.com') || host.includes('cdninstagram.com')) {
     referer = 'https://www.instagram.com/';
   } else if (host.includes('pinimg.com') || host.includes('pinterest.com')) {
     referer = 'https://www.pinterest.com/';
   }
  } catch {
   // Ignore malformed URLs; we fall back to a header-less request.
  }

  if (variant === 'bare') return {};

  const base: Record<string, string> = {
   Accept: '*/*',
   'Accept-Language': 'en-US,en;q=0.9',
   'User-Agent':
     variant === 'android'
       ? 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36'
       : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  };

  if (referer) {
   base.Referer = referer;
   base.Origin = new URL(referer).origin;
  }

  return base;
}

/**
 * Download via legacy FileSystem then save via SAF or native sharing sheet.
 * Works reliably in Expo Go on Android.
 */
export async function downloadMedia(
  cdnUrl: string,
  mediaType: 'video' | 'image' | 'audio',
  onProgress?: (p: DownloadProgress) => void,
): Promise<DownloadResult> {
  try {
    const filename = makeFilename(cdnUrl, mediaType);
    const cacheRoot = cacheDirectory ?? documentDirectory;
    if (!cacheRoot) {
      return { ok: false, error: 'Local cache storage is unavailable on this device.' };
    }

    const localUri = cacheRoot + filename;

    const attempts = [buildHeaders(cdnUrl, 'bare'), buildHeaders(cdnUrl, 'browser'), buildHeaders(cdnUrl, 'android')];
    let downloadedUri = localUri;
    let size = 0;
    let lastStatus = 0;

    for (const headers of attempts) {
      const result = await attemptDownload(cdnUrl, localUri, headers, onProgress);
      downloadedUri = result.uri;
      size = result.size;
      lastStatus = result.status;
      if (size > 0 && (lastStatus === 0 || lastStatus < 400)) {
        break;
      }
    }

    if (size === 0) {
      await deleteAsync(downloadedUri, { idempotent: true }).catch(() => {});
      return {
        ok: false,
        error: lastStatus >= 400
          ? `The media request failed with HTTP ${lastStatus}.`
          : 'The media stream returned an empty file.\n\n' +
            'This usually means the stream URL expired between extraction and download. ' +
            'Please tap the URL box, press Fetch again, then Download immediately.',
      };
    }

    // ── Save via SAF or share sheet ────────────────────────────────────────────
    let savedToSaf = false;
    let finalPath = downloadedUri;

    try {
      const settingsFile = (documentDirectory ?? '') + 'settings.json';
      const fileInfo = await getInfoAsync(settingsFile);
      if (fileInfo.exists && Platform.OS === 'android') {
        const content = await readAsStringAsync(settingsFile);
        const settings = JSON.parse(content);

        if (settings.useCustomDirectory && settings.customDirectoryUri) {
          const mimeType =
            mediaType === 'video'
              ? 'video/mp4'
              : mediaType === 'audio'
              ? 'audio/mpeg'
              : 'image/jpeg';

          const safUri = await StorageAccessFramework.createFileAsync(
            settings.customDirectoryUri,
            filename,
            mimeType,
          );

          const base64Data = await readAsStringAsync(downloadedUri, {
            encoding: EncodingType.Base64,
          });

          await StorageAccessFramework.writeAsStringAsync(safUri, base64Data, {
            encoding: EncodingType.Base64,
          });

          savedToSaf = true;
          finalPath = safUri;

          await deleteAsync(downloadedUri, { idempotent: true });
        }
      }
    } catch (safErr) {
      console.warn('SAF save failed, falling back to share sheet:', safErr);
    }

    if (!savedToSaf) {
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        return { ok: false, error: 'Sharing not available on this device' };
      }

      await Sharing.shareAsync(downloadedUri, {
        mimeType:
          mediaType === 'video'
            ? 'video/mp4'
            : mediaType === 'audio'
            ? 'audio/mpeg'
            : 'image/jpeg',
        dialogTitle: 'Save to device',
      });
    }

    return { ok: true, uri: finalPath };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Download error' };
  }
}
