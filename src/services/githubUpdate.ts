/**
 * GitHub Releases In-App APK Updater for Android / Anyfetch
 *
 * Allows checking, downloading, and prompting installation of new APK releases
 * directly within the mobile app without requiring the user to open a browser or leave the app.
 */

import { Platform, Linking } from 'react-native';
import Constants from 'expo-constants';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Sharing from 'expo-sharing';
import {
  cacheDirectory,
  documentDirectory,
  getContentUriAsync,
  createDownloadResumable,
  deleteAsync,
} from 'expo-file-system/legacy';
import appJson from '../../app.json';

export interface GitHubReleaseInfo {
  isAvailable: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseTitle: string;
  releaseNotes: string;
  apkUrl: string | null;
  apkName: string | null;
  apkSize: number;
  publishedAt: string;
}

export interface UpdateDownloadProgress {
  fraction: number; // 0 to 1
  received: number; // in bytes
  total: number;    // in bytes
}

const DEFAULT_REPOS = [
  'AbhishekS04/anyfetch-expo',
  'AbhishekS04/anyfetch',
];

/**
 * Compare two semver strings: returns true if latest > current
 */
export function isNewerVersion(latest: string, current: string): boolean {
  const clean = (v: string) => v.replace(/^v/i, '').trim();
  const v1Parts = clean(latest).split('.').map(n => parseInt(n, 10) || 0);
  const v2Parts = clean(current).split('.').map(n => parseInt(n, 10) || 0);

  const len = Math.max(v1Parts.length, v2Parts.length);
  for (let i = 0; i < len; i++) {
    const num1 = v1Parts[i] ?? 0;
    const num2 = v2Parts[i] ?? 0;
    if (num1 > num2) return true;
    if (num1 < num2) return false;
  }
  return false;
}

export function getCurrentAppVersion(): string {
  return appJson.expo?.version || Constants.expoConfig?.version || '1.0.0';
}

/**
 * Check GitHub Releases for an available APK update
 */
export async function checkForGitHubUpdate(customRepo?: string): Promise<GitHubReleaseInfo> {
  const currentVersion = getCurrentAppVersion();
  const reposToTry = customRepo ? [customRepo, ...DEFAULT_REPOS] : DEFAULT_REPOS;

  let releaseData: any = null;
  let targetRepo = '';

  for (const repo of reposToTry) {
    try {
      const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
        headers: {
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'Anyfetch-App-Updater',
        },
      });

      if (res.ok) {
        releaseData = await res.json();
        targetRepo = repo;
        break;
      }
    } catch {
      // Try next repo
    }
  }

  if (!releaseData || !releaseData.tag_name) {
    return {
      isAvailable: false,
      currentVersion,
      latestVersion: currentVersion,
      releaseTitle: '',
      releaseNotes: '',
      apkUrl: null,
      apkName: null,
      apkSize: 0,
      publishedAt: '',
    };
  }

  const rawTag = releaseData.tag_name || '';
  const latestVersion = rawTag.replace(/^v/i, '').trim();
  const isAvailable = isNewerVersion(latestVersion, currentVersion);

  // Find APK asset
  const assets: any[] = Array.isArray(releaseData.assets) ? releaseData.assets : [];
  const apkAsset = assets.find(
    (a: any) =>
      a.name?.toLowerCase().endsWith('.apk') ||
      a.content_type === 'application/vnd.android.package-archive',
  );

  return {
    isAvailable,
    currentVersion,
    latestVersion,
    releaseTitle: releaseData.name || rawTag,
    releaseNotes: releaseData.body || 'New improvements and bug fixes.',
    apkUrl: apkAsset?.browser_download_url ?? null,
    apkName: apkAsset?.name ?? 'anyfetch-update.apk',
    apkSize: apkAsset?.size ?? 0,
    publishedAt: releaseData.published_at || '',
  };
}

/**
 * Downloads the APK directly inside the app with live progress,
 * and launches Android's package installer without forcing the user to exit the app.
 */
export async function downloadAndInstallApk(
  apkUrl: string,
  onProgress?: (progress: UpdateDownloadProgress) => void,
): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!apkUrl) {
      return { ok: false, error: 'No APK download URL provided.' };
    }

    const cacheRoot = cacheDirectory ?? documentDirectory;
    if (!cacheRoot) {
      return { ok: false, error: 'Device storage cache is not accessible.' };
    }

    const targetLocalUri = `${cacheRoot}anyfetch-update.apk`;

    // Remove any previously downloaded APK file to prevent corrupted resume
    await deleteAsync(targetLocalUri, { idempotent: true }).catch(() => {});

    // Create resumable download with progress listener
    const downloadResumable = createDownloadResumable(
      apkUrl,
      targetLocalUri,
      {
        headers: {
          Accept: 'application/octet-stream',
          'User-Agent': 'Anyfetch-App-Updater',
        },
      },
      (downloadProgress) => {
        const total = downloadProgress.totalBytesExpectedToWrite;
        const received = downloadProgress.totalBytesWritten;
        const fraction = total > 0 ? Math.min(1, received / total) : 0;
        if (onProgress) {
          onProgress({ fraction, received, total });
        }
      },
    );

    const result = await downloadResumable.downloadAsync();
    if (!result?.uri) {
      return { ok: false, error: 'Failed to complete APK download.' };
    }

    // Launch installation on Android
    if (Platform.OS === 'android') {
      try {
        const contentUri = await getContentUriAsync(result.uri);

        await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
          data: contentUri,
          flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
          type: 'application/vnd.android.package-archive',
        });

        return { ok: true };
      } catch (intentErr: any) {
        console.warn('[Updater] IntentLauncher failed, attempting Sharing fallback:', intentErr);

        // Fallback: system share / installer dialog
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(result.uri, {
            mimeType: 'application/vnd.android.package-archive',
            dialogTitle: 'Install Anyfetch Update',
          });
          return { ok: true };
        }

        // Secondary fallback: open URL directly
        await Linking.openURL(apkUrl).catch(() => {});
        return { ok: true };
      }
    } else {
      // Non-android platform (e.g. iOS or Web)
      await Linking.openURL(apkUrl).catch(() => {});
      return { ok: true };
    }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Error downloading or installing update.' };
  }
}
