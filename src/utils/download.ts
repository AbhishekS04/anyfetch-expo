/**
 * Download utility — Expo Go + Android SDK 56.
 *
 * Uses direct file downloads into app cache, then saves via StorageAccessFramework
 * (custom folder) or the native share sheet. Header retries are tuned for common
 * social CDN hosts so direct media URLs stay downloadable after extractor changes.
 */

import {
  resolveDirectMediaUrl,
  extractUrlFromText,
  detectPlatform,
} from './url';
export {
  resolveDirectMediaUrl,
  extractUrlFromText,
  detectPlatform,
} from './url';
import {
  documentDirectory,
  cacheDirectory,
  StorageAccessFramework,
  readAsStringAsync,
  deleteAsync,
  downloadAsync,
  getInfoAsync,
  createDownloadResumable,
} from 'expo-file-system/legacy';
import { EncodingType } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
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

/** One download attempt with background execution and streaming progress */
async function attemptDownload(
  url: string,
  localUri: string,
  headers: Record<string, string>,
  onProgress?: (p: DownloadProgress) => void,
): Promise<{ uri: string; size: number; status: number }> {
  // Clean up stale file if present
  await deleteAsync(localUri, { idempotent: true }).catch(() => {});

  // createDownloadResumable uses Android DownloadManager — survives app backgrounding
  const downloadResumable = createDownloadResumable(
    url,
    localUri,
    { headers },
    progress => {
      if (onProgress && progress.totalBytesExpectedToWrite > 0) {
        const fraction = Math.min(
          1,
          Math.max(0, progress.totalBytesWritten / progress.totalBytesExpectedToWrite)
        );
        onProgress({
          received: progress.totalBytesWritten,
          total: progress.totalBytesExpectedToWrite,
          fraction,
        });
      } else if (onProgress && progress.totalBytesWritten > 0) {
        // Mux stream — total size unknown until complete (chunked transfer)
        onProgress({
          received: progress.totalBytesWritten,
          total: 0, // 0 means indeterminate
          fraction: -1, // signal indeterminate to UI
        });
      }
    }
  );

  try {
    const result = await downloadResumable.downloadAsync();
    if (!result?.uri) return { uri: localUri, size: 0, status: 0 };
    if (onProgress) onProgress({ received: 1, total: 1, fraction: 1 });
    const info = await getInfoAsync(result.uri);
    const size = info.exists && 'size' in info ? (info.size ?? 0) : 0;
    return { uri: result.uri, size, status: result.status ?? 200 };
  } catch {
    // Fallback to basic downloadAsync
    try {
      const result = await downloadAsync(url, localUri, { headers });
      if (!result?.uri) return { uri: localUri, size: 0, status: 0 };
      if (onProgress) onProgress({ received: 1, total: 1, fraction: 1 });
      const info = await getInfoAsync(result.uri);
      const size = info.exists && 'size' in info ? (info.size ?? 0) : 0;
      return { uri: result.uri, size, status: result.status ?? 200 };
    } catch {
      return { uri: localUri, size: 0, status: 0 };
    }
  }
}

function buildHeaders(url: string, variant: 'bare' | 'browser' | 'android'): Record<string, string> {
  let referer = '';
  let isYouTube = false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes('twimg.com') || host.includes('twitter.com') || host.includes('x.com')) {
      referer = 'https://x.com/';
    } else if (host.includes('instagram.com') || host.includes('cdninstagram.com')) {
      referer = 'https://www.instagram.com/';
    } else if (host.includes('pinimg.com') || host.includes('pinterest.com')) {
      referer = 'https://www.pinterest.com/';
    } else if (host.includes('googlevideo.com') || host.includes('youtube.com') || host.includes('ytimg.com')) {
      isYouTube = true;
    }
  } catch {
    // Ignore malformed URLs; we fall back to a header-less request.
  }

  if (variant === 'bare') return {};

  const base: Record<string, string> = {
    Accept: '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'User-Agent':
      isYouTube
        ? 'com.google.android.youtube/21.26.364 (Linux; U; Android 11) gzip'
        : variant === 'android'
        ? 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36'
        : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  };

  if (referer && !isYouTube) {
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
  rawCdnUrl: string,
  mediaType: 'video' | 'image' | 'audio',
  onProgress?: (p: DownloadProgress) => void,
  customFilename?: string,
): Promise<DownloadResult> {
  try {
    const cdnUrl = resolveDirectMediaUrl(rawCdnUrl);
    const filename = customFilename || makeFilename(cdnUrl, mediaType);
    const cacheRoot = cacheDirectory ?? documentDirectory;
    if (!cacheRoot) {
      return { ok: false, error: 'Local cache storage is unavailable on this device.' };
    }

    const localUri = cacheRoot + filename;

    // Detect if this is our own mux server endpoint — use bare headers
    const isMuxUrl = cdnUrl.includes('/api/stream');
    const isYtUrl = cdnUrl.includes('googlevideo.com') || cdnUrl.includes('youtube.com');

    let downloadedUri = localUri;
    let size = 0;
    let lastStatus = 0;

    // Fast cache check: if identical file is already downloaded with a valid size (>100KB), reuse it
    const existingInfo = await getInfoAsync(localUri).catch(() => null);
    if (existingInfo?.exists && 'size' in existingInfo && (existingInfo.size ?? 0) > 100000) {
      downloadedUri = localUri;
      size = existingInfo.size ?? 0;
      if (onProgress) onProgress({ received: 1, total: 1, fraction: 1 });
    } else if (isMuxUrl) {
      // First attempt: cloud multiplexer
      const result = await attemptDownload(cdnUrl, localUri, {}, onProgress);
      downloadedUri = result.uri;
      size = result.size;
      lastStatus = result.status;

      // Seamless fallback: if cloud multiplexer returned 0 bytes or failed,
      // extract the direct video/audio stream URL and download directly on-device
      if (size === 0) {
        try {
          const parsed = new URL(cdnUrl);
          const directStreamUrl = parsed.searchParams.get('video') || parsed.searchParams.get('audio');
          if (directStreamUrl) {
            const ytHeaders = buildHeaders(directStreamUrl, 'android');
            const fallbackResult = await attemptDownload(directStreamUrl, localUri, ytHeaders, onProgress);
            downloadedUri = fallbackResult.uri;
            size = fallbackResult.size;
            lastStatus = fallbackResult.status;
          }
        } catch {}
      }
    } else {
      const attempts = isYtUrl
        ? [buildHeaders(cdnUrl, 'android'), buildHeaders(cdnUrl, 'bare')]
        : [
            buildHeaders(cdnUrl, 'bare'),
            buildHeaders(cdnUrl, 'browser'),
            buildHeaders(cdnUrl, 'android'),
          ];
      for (const headers of attempts) {
        const result = await attemptDownload(cdnUrl, localUri, headers, onProgress);
        downloadedUri = result.uri;
        size = result.size;
        lastStatus = result.status;
        if (size > 0 && (lastStatus === 0 || lastStatus < 400)) break;
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

    // Guard against servers returning HTML challenge/error pages disguised as media
    if (size > 0 && size < 50000) {
      try {
        const preview = await readAsStringAsync(downloadedUri, {
          encoding: EncodingType.UTF8,
          length: 500,
        });
        if (
          preview.includes('<!DOCTYPE') ||
          preview.includes('<html') ||
          preview.includes('<head') ||
          preview.includes('Cloudflare') ||
          preview.includes('Access denied') ||
          preview.includes('challenge-platform') ||
          preview.includes('cf-browser-verification') ||
          preview.includes('{"error"')
        ) {
          await deleteAsync(downloadedUri, { idempotent: true }).catch(() => {});
          return {
            ok: false,
            error:
              'The download server returned a verification/bot challenge page instead of media.\n\n' +
              'This YouTube video stream is restricted. Please select another quality or video.',
          };
        }
      } catch {
        // Binary media file (expected for video/audio)
      }
    }

    // ── Save to Gallery, Custom SAF folder, or fallback to share sheet ───────
    let saved = false;
    let finalPath = downloadedUri;

    // 1. Check if user configured a custom StorageAccessFramework directory in Settings
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

          saved = true;
          finalPath = safUri;

          await deleteAsync(downloadedUri, { idempotent: true }).catch(() => {});
        }
      }
    } catch (safErr) {
      console.warn('SAF save failed, proceeding to MediaLibrary:', safErr);
    }

    // 2. Default: Save directly to Android/iOS Gallery (MediaLibrary)
    if (!saved) {
      try {
        let MediaLib: any = null;
        try {
          // Dynamic require prevents crash in Expo Go or runtimes without ExpoMediaLibraryNext
          MediaLib = require('expo-media-library');
        } catch (loadErr) {
          console.warn('[MediaLibrary] Native module not present in current runtime (e.g. Expo Go):', loadErr);
        }

        if (MediaLib && typeof MediaLib.requestPermissionsAsync === 'function') {
          const perm = await MediaLib.requestPermissionsAsync();
          if (perm.granted || perm.status === 'granted') {
            const asset = await MediaLib.createAssetAsync(downloadedUri);
            try {
              const album = await MediaLib.getAlbumAsync('AnyFetch');
              if (!album) {
                await MediaLib.createAlbumAsync('AnyFetch', asset, false);
              } else {
                await MediaLib.addAssetsToAlbumAsync([asset], album, false);
              }
            } catch (albumErr) {
              // Optional album grouping; asset is already in public DCIM/Gallery
              console.log('AnyFetch album note:', albumErr);
            }
            saved = true;
            finalPath = asset.uri;
            // Delete temporary cache file once saved to MediaStore
            await deleteAsync(downloadedUri, { idempotent: true }).catch(() => {});
          } else {
            console.warn('MediaLibrary permission not granted');
          }
        }
      } catch (mediaErr) {
        console.warn('MediaLibrary save error, falling back to share sheet:', mediaErr);
      }
    }

    // 3. Fallback: Share sheet only if gallery saving could not be completed
    if (!saved) {
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        return { ok: false, error: 'Could not save to gallery. Please check storage permissions.' };
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
