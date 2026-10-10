/**
 * AnyFetch Cloud API Client.
 *
 * Connects the mobile app to our custom high-speed backend engine (hosted on Voroa/Render/Railway)
 * to provide 1080p/4K audio+video remuxing, watermark-free TikTok, Reddit video+audio,
 * and high-bitrate Twitter downloads.
 */

import {
  documentDirectory,
  getInfoAsync,
  readAsStringAsync,
  writeAsStringAsync,
} from 'expo-file-system/legacy';
import { ExtractedResult, ExtractedMediaItem, QualityOption } from '../extractors/types';
import { SupportedPlatform } from '../theme/platformColors';

const SETTINGS_FILE = (documentDirectory ?? '') + 'settings.json';

// Default endpoint (can be configured in Settings)
export const DEFAULT_API_URL = 'https://anyfetch-api.getvoroa.com';

export interface ApiHealthStatus {
  ok: boolean;
  latencyMs?: number;
  uptimeSeconds?: number;
  memoryMb?: number;
  error?: string;
}

/**
 * Reads the configured AnyFetch API URL from local settings.json
 */
export async function getAnyFetchApiUrl(): Promise<string> {
  try {
    const fileInfo = await getInfoAsync(SETTINGS_FILE);
    if (fileInfo.exists) {
      const content = await readAsStringAsync(SETTINGS_FILE);
      const settings = JSON.parse(content);
      if (typeof settings.anyfetchApiUrl === 'string' && settings.anyfetchApiUrl.trim()) {
        return settings.anyfetchApiUrl.trim();
      }
    }
  } catch {}
  return DEFAULT_API_URL;
}

/**
 * Saves the AnyFetch API URL to local settings.json
 */
export async function saveAnyFetchApiUrl(url: string): Promise<void> {
  try {
    let settings: any = {};
    const fileInfo = await getInfoAsync(SETTINGS_FILE);
    if (fileInfo.exists) {
      const content = await readAsStringAsync(SETTINGS_FILE);
      settings = JSON.parse(content);
    }
    settings.anyfetchApiUrl = url.trim();
    await writeAsStringAsync(SETTINGS_FILE, JSON.stringify(settings));
  } catch (err) {
    console.warn('[AnyFetchApi] Failed to save anyfetchApiUrl:', err);
  }
}

/**
 * Checks if the Cloud Engine is enabled in settings (default: true)
 */
export async function isAnyFetchApiEnabled(): Promise<boolean> {
  try {
    const fileInfo = await getInfoAsync(SETTINGS_FILE);
    if (fileInfo.exists) {
      const content = await readAsStringAsync(SETTINGS_FILE);
      const settings = JSON.parse(content);
      if (typeof settings.enableCloudApi === 'boolean') {
        return settings.enableCloudApi;
      }
    }
  } catch {}
  return false;
}

/**
 * Sets whether the Cloud Engine is enabled
 */
export async function setAnyFetchApiEnabled(enabled: boolean): Promise<void> {
  try {
    let settings: any = {};
    const fileInfo = await getInfoAsync(SETTINGS_FILE);
    if (fileInfo.exists) {
      const content = await readAsStringAsync(SETTINGS_FILE);
      settings = JSON.parse(content);
    }
    settings.enableCloudApi = enabled;
    await writeAsStringAsync(SETTINGS_FILE, JSON.stringify(settings));
  } catch (err) {
    console.warn('[AnyFetchApi] Failed to save enableCloudApi:', err);
  }
}

/**
 * Pings the AnyFetch API /health endpoint and measures round-trip latency
 */
export async function pingAnyFetchApi(endpointUrl: string): Promise<ApiHealthStatus> {
  if (!endpointUrl) {
    return { ok: false, error: 'No endpoint URL configured' };
  }

  const cleanBase = endpointUrl.replace(/\/+$/, '');
  const target = `${cleanBase}/health`;
  const start = Date.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(target, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timeoutId);

    const elapsed = Date.now() - start;

    if (!res.ok) {
      return { ok: false, latencyMs: elapsed, error: `HTTP ${res.status}` };
    }

    const data: any = await res.json();
    return {
      ok: true,
      latencyMs: elapsed,
      uptimeSeconds: data.uptimeSeconds,
      memoryMb: data.memoryMb,
    };
  } catch (err: any) {
    return { ok: false, error: err.name === 'AbortError' ? 'Connection timed out' : err.message };
  }
}

/**
 * Resolves media by calling our custom AnyFetch API backend
 */
export async function fetchFromAnyFetchApi(
  targetUrl: string,
  customEndpoint?: string
): Promise<ExtractedResult> {
  const base = (customEndpoint || (await getAnyFetchApiUrl())).replace(/\/+$/, '');
  if (!base) {
    throw new Error('No AnyFetch API endpoint configured');
  }

  const endpoint = `${base}/api/resolve`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  const res = await fetch(endpoint, {
    method: 'POST',
    signal: controller.signal,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'x-anyfetch-client': 'expo-mobile',
    },
    body: JSON.stringify({ url: targetUrl }),
  });
  clearTimeout(timeoutId);

  const rawText = await res.text();
  let data: any;
  try {
    data = JSON.parse(rawText);
  } catch {
    throw new Error(
      res.ok
        ? 'Cloud engine returned non-JSON response'
        : `Cloud engine error ${res.status}`
    );
  }

  if (!res.ok || !data.success) {
    throw new Error(data?.error || `Server returned error ${res.status}`);
  }

  const forceHttps = (urlStr?: string): string => {
    if (!urlStr) return '';
    if (urlStr.startsWith('http://anyfetch-api.getvoroa.com')) {
      return urlStr.replace(/^http:\/\//i, 'https://');
    }
    return urlStr;
  };

  // Map to ExtractedResult
  let carouselItems: ExtractedMediaItem[] | undefined;
  if (Array.isArray(data.carouselItems) && data.carouselItems.length > 0) {
    carouselItems = data.carouselItems.map((item: any, idx: number) => ({
      index: idx,
      type: item.type === 'video' ? 'video' : 'image',
      url: forceHttps(item.url),
      thumbnail: forceHttps(item.thumbnail || item.url),
      selected: true,
    }));
  }

  let qualities: QualityOption[] | undefined;
  if (Array.isArray(data.qualities) && data.qualities.length > 0) {
    qualities = data.qualities.map((q: any) => ({
      id: q.id,
      label: q.label,
      type: q.type,
      url: forceHttps(q.url),
      container: q.container || (q.type === 'audio' ? 'mp3' : 'mp4'),
      bitrate: q.bitrate,
    }));
  }

  return {
    platform: (data.platform || 'youtube') as SupportedPlatform,
    type: data.type || (carouselItems ? 'carousel' : 'video'),
    url: forceHttps(data.url) || (carouselItems?.[0]?.url ?? ''),
    thumbnail: forceHttps(data.thumbnail),
    title: data.title,
    author: data.author,
    duration: data.duration,
    qualities,
    carouselItems,
  };
}
