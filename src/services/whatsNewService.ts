/**
 * whatsNewService.ts — Update Onboarding & Release Acknowledgement Service
 *
 * Tracks the installed application version, determines if What's New
 * onboarding is required for major releases, and safely persists acknowledgements.
 */

import {
  documentDirectory,
  getInfoAsync,
  readAsStringAsync,
  writeAsStringAsync,
} from 'expo-file-system/legacy';
import { getCurrentAppVersion, isNewerVersion } from './githubUpdate';
import {
  ReleaseConfig,
  getReleaseConfigForVersion,
  normalizeVersionKey,
} from '../config/releaseNotes';

export const STORAGE_KEY_LAST_ACKNOWLEDGED = 'anyfetch.lastAcknowledgedReleaseVersion';
const SETTINGS_FILE = (documentDirectory ?? '') + 'settings.json';

export interface WhatsNewDecision {
  shouldShow: boolean;
  installedVersion: string;
  acknowledgedVersion: string | null;
  releaseConfig: ReleaseConfig | null;
}

/**
 * Returns the currently installed application runtime version.
 */
export function getInstalledApplicationVersion(): string {
  return getCurrentAppVersion();
}

/**
 * Reads the last acknowledged release version from persistent storage.
 */
export async function getLastAcknowledgedVersion(): Promise<string | null> {
  try {
    const fileInfo = await getInfoAsync(SETTINGS_FILE);
    if (!fileInfo.exists) return null;

    const content = await readAsStringAsync(SETTINGS_FILE);
    const settings = JSON.parse(content);

    // Primary key with legacy fallback
    const ack =
      settings[STORAGE_KEY_LAST_ACKNOWLEDGED] ||
      settings.lastSeenExperienceVersion ||
      null;

    return typeof ack === 'string' && ack.trim() ? ack.trim() : null;
  } catch (err) {
    console.warn('[WhatsNewService] Error reading last acknowledged version:', err);
    return null;
  }
}

/**
 * Persists the acknowledged release version to persistent storage.
 * Safeguard: Avoids overwriting a newer acknowledged version with an older value (e.g. downgrades).
 */
export async function acknowledgeReleaseVersion(versionToAcknowledge: string): Promise<boolean> {
  if (!versionToAcknowledge) return false;

  try {
    const cleanVersion = versionToAcknowledge.trim();
    const fileInfo = await getInfoAsync(SETTINGS_FILE);
    let settings: Record<string, any> = {};

    if (fileInfo.exists) {
      const content = await readAsStringAsync(SETTINGS_FILE);
      try {
        settings = JSON.parse(content);
      } catch {
        settings = {};
      }
    }

    const currentAck = settings[STORAGE_KEY_LAST_ACKNOWLEDGED] || settings.lastSeenExperienceVersion;

    // Downgrade protection: do not overwrite a newer acknowledged version with an older version
    if (currentAck && isNewerVersion(currentAck, cleanVersion)) {
      console.info(
        `[WhatsNewService] Skipping acknowledge: current (${currentAck}) is newer than target (${cleanVersion})`
      );
      return true;
    }

    settings[STORAGE_KEY_LAST_ACKNOWLEDGED] = cleanVersion;
    settings.lastSeenExperienceVersion = cleanVersion; // legacy compatibility

    await writeAsStringAsync(SETTINGS_FILE, JSON.stringify(settings));
    return true;
  } catch (err) {
    console.warn('[WhatsNewService] Error saving acknowledged version:', err);
    return false;
  }
}

/**
 * Resets the acknowledged version (used for automated testing).
 */
export async function resetAcknowledgedVersion(): Promise<void> {
  try {
    const fileInfo = await getInfoAsync(SETTINGS_FILE);
    if (fileInfo.exists) {
      const content = await readAsStringAsync(SETTINGS_FILE);
      const settings = JSON.parse(content);
      delete settings[STORAGE_KEY_LAST_ACKNOWLEDGED];
      delete settings.lastSeenExperienceVersion;
      await writeAsStringAsync(SETTINGS_FILE, JSON.stringify(settings));
    }
  } catch (err) {
    console.warn('[WhatsNewService] Error resetting acknowledged version:', err);
  }
}

/**
 * Evaluates whether the What's New full-screen page must be displayed at startup.
 *
 * Criteria:
 * 1. Read installed application version.
 * 2. Read last acknowledged version from persistent storage.
 * 3. Verify if release entry exists in centralized configuration.
 * 4. Verify if release is configured to require What's New (requireWhatsNew: true).
 * 5. Verify non-empty highlights list.
 * 6. Verify user has not already acknowledged this version.
 */
export async function shouldShowWhatsNew(
  overrideInstalledVersion?: string
): Promise<WhatsNewDecision> {
  const installedVersion = (overrideInstalledVersion || getInstalledApplicationVersion()).trim();
  const acknowledgedVersion = await getLastAcknowledgedVersion();

  // If user already completed What's New for this installed version, skip
  if (
    acknowledgedVersion &&
    normalizeVersionKey(acknowledgedVersion) === normalizeVersionKey(installedVersion)
  ) {
    return {
      shouldShow: false,
      installedVersion,
      acknowledgedVersion,
      releaseConfig: null,
    };
  }

  // Lookup release config
  const releaseConfig = getReleaseConfigForVersion(installedVersion);

  // If no entry exists, or What's New is not required, or no highlights configured -> skip
  if (
    !releaseConfig ||
    !releaseConfig.requireWhatsNew ||
    !Array.isArray(releaseConfig.highlights) ||
    releaseConfig.highlights.length === 0
  ) {
    return {
      shouldShow: false,
      installedVersion,
      acknowledgedVersion,
      releaseConfig,
    };
  }

  return {
    shouldShow: true,
    installedVersion,
    acknowledgedVersion,
    releaseConfig,
  };
}
