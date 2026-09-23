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
  getInfoAsync,
  readAsStringAsync,
  writeAsStringAsync,
} from 'expo-file-system/legacy';
import appJson from '../../app.json';

export const DEFAULT_REPO = 'AbhishekS04/anyfetch-expo';
export const DEFAULT_REPO_URL = `https://github.com/${DEFAULT_REPO}`;
const SETTINGS_FILE = (documentDirectory ?? '') + 'settings.json';

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
  repo: string;
  repoUrl: string;
}

export interface UpdateDownloadProgress {
  fraction: number; // 0 to 1
  received: number; // in bytes
  total: number;    // in bytes
}

/**
 * Normalizes any GitHub URL or shorthand to "owner/repo"
 * e.g. "https://github.com/AbhishekS04/anyfetch-expo" -> "AbhishekS04/anyfetch-expo"
 *      "AbhishekS04/anyfetch-expo.git" -> "AbhishekS04/anyfetch-expo"
 */
export function normalizeGitHubRepo(input?: string): string {
  if (!input) return DEFAULT_REPO;
  let clean = input.trim();
  // Strip protocols
  clean = clean.replace(/^https?:\/\//i, '');
  // Strip github.com/ or www.github.com/
  clean = clean.replace(/^(?:www\.)?github\.com\//i, '');
  // Strip trailing .git
  clean = clean.replace(/\.git$/i, '');
  // Strip trailing & leading slashes
  clean = clean.replace(/^\/+|\/+$/g, '');

  const parts = clean.split('/').filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]}/${parts[1]}`;
  }
  return clean || DEFAULT_REPO;
}

/**
 * Reads the configured GitHub repo from local settings.json
 */
export async function getSavedGitHubRepo(): Promise<string> {
  try {
    const fileInfo = await getInfoAsync(SETTINGS_FILE);
    if (fileInfo.exists) {
      const content = await readAsStringAsync(SETTINGS_FILE);
      const data = JSON.parse(content);
      if (data?.githubRepo) {
        return normalizeGitHubRepo(data.githubRepo);
      }
    }
  } catch {
    // Ignore and fallback
  }
  return DEFAULT_REPO;
}

/**
 * Saves the configured GitHub repo to local settings.json
 */
export async function saveGitHubRepo(repoInput: string): Promise<string> {
  const normalized = normalizeGitHubRepo(repoInput);
  try {
    let settings: any = {};
    const fileInfo = await getInfoAsync(SETTINGS_FILE);
    if (fileInfo.exists) {
      const content = await readAsStringAsync(SETTINGS_FILE);
      settings = JSON.parse(content);
    }
    settings.githubRepo = normalized;
    await writeAsStringAsync(SETTINGS_FILE, JSON.stringify(settings));
  } catch (err) {
    console.warn('[Updater] Failed to save githubRepo setting:', err);
  }
  return normalized;
}

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
 * Check GitHub Releases for an available APK update.
 * Automatically uses the saved repository if none is passed.
 */
export async function checkForGitHubUpdate(customRepo?: string): Promise<GitHubReleaseInfo> {
  const currentVersion = getCurrentAppVersion();
  const targetRepo = normalizeGitHubRepo(customRepo || (await getSavedGitHubRepo()));
  const repoUrl = `https://github.com/${targetRepo}`;

  let releaseData: any = null;
  let fetchError = '';

  try {
    const res = await fetch(`https://api.github.com/repos/${targetRepo}/releases/latest`, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'Anyfetch-App-Updater',
      },
    });

    if (res.ok) {
      releaseData = await res.json();
    } else if (res.status === 404) {
      fetchError = `No releases found on ${targetRepo}.`;
    } else {
      fetchError = `GitHub API HTTP ${res.status}`;
    }
  } catch (err: any) {
    fetchError = err?.message || 'Network error reaching GitHub.';
  }

  if (!releaseData || !releaseData.tag_name) {
    return {
      isAvailable: false,
      currentVersion,
      latestVersion: currentVersion,
      releaseTitle: '',
      releaseNotes: fetchError || 'No new updates found.',
      apkUrl: null,
      apkName: null,
      apkSize: 0,
      publishedAt: '',
      repo: targetRepo,
      repoUrl,
    };
  }

  const rawTag = releaseData.tag_name || '';
  const latestVersion = rawTag.replace(/^v/i, '').trim();
  const isAvailable = isNewerVersion(latestVersion, currentVersion);

  // Find APK asset in release
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
    apkName: apkAsset?.name ?? `anyfetch-v${latestVersion}.apk`,
    apkSize: apkAsset?.size ?? 0,
    publishedAt: releaseData.published_at || '',
    repo: targetRepo,
    repoUrl,
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
