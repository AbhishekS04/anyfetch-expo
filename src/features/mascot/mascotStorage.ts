/**
 * mascotStorage.ts — Persistent storage and injectable clock for AnyFetch Mascot
 *
 * Uses expo-file-system/legacy for persistent, zero-cloud on-device storage.
 * Does not classify a brand-new installation as inactive.
 * Supports injectable clock / simulated time offset for rapid, deterministic testing.
 */

import {
  documentDirectory,
  getInfoAsync,
  readAsStringAsync,
  writeAsStringAsync,
} from 'expo-file-system/legacy';
import { MascotStorageData } from './mascotTypes';

const MASCOT_STORAGE_FILE = (documentDirectory ?? '') + 'mascot_data.json';

// In-memory cache for synchronous reads after initial load
let cachedData: MascotStorageData | null = null;

// Clock simulation offset in milliseconds (for automated testing / simulation)
let simulatedClockOffsetMs: number = 0;

/**
 * Returns current timestamp according to the injectable clock.
 * Normally returns Date.now(), or Date.now() + simulatedClockOffsetMs during tests.
 */
export function getMascotNow(): number {
  return Date.now() + simulatedClockOffsetMs;
}

/**
 * Sets an artificial clock offset in milliseconds (or hours) for testing inactivity states.
 * Passing 0 resets to the real system clock.
 */
export function setSimulatedClockOffset(offsetMs: number): void {
  simulatedClockOffsetMs = offsetMs;
}

/**
 * Convenience helper to simulate inactivity by moving the clock forward by N hours.
 */
export function simulateInactivityHours(hours: number): void {
  simulatedClockOffsetMs = hours * 60 * 60 * 1000;
}

/**
 * Reads mascot persistence file safely.
 * If file does not exist (new install), initializes with current timestamp so user
 * is NOT classified as inactive on fresh install.
 */
export async function loadMascotStorage(): Promise<MascotStorageData> {
  const now = getMascotNow();

  try {
    if (!documentDirectory) {
      const fallback: MascotStorageData = { lastActivityTimestamp: now };
      cachedData = fallback;
      return fallback;
    }

    const info = await getInfoAsync(MASCOT_STORAGE_FILE);
    if (!info.exists) {
      // First install: initialize with current timestamp
      const initial: MascotStorageData = {
        lastActivityTimestamp: now,
        sessionSuccessfulDownloads: 0,
        consecutiveFailures: 0,
      };
      await saveMascotStorage(initial);
      cachedData = initial;
      return initial;
    }

    const raw = await readAsStringAsync(MASCOT_STORAGE_FILE);
    const parsed = JSON.parse(raw);

    // Validate structure defensively
    if (typeof parsed?.lastActivityTimestamp !== 'number' || isNaN(parsed.lastActivityTimestamp)) {
      parsed.lastActivityTimestamp = now;
    }

    cachedData = parsed;
    return parsed;
  } catch (err) {
    console.warn('[MascotStorage] Failed to read storage, fallback to now:', err);
    const fallback: MascotStorageData = { lastActivityTimestamp: now };
    cachedData = fallback;
    return fallback;
  }
}

/**
 * Writes mascot storage data asynchronously to disk.
 */
export async function saveMascotStorage(data: Partial<MascotStorageData>): Promise<void> {
  try {
    if (!documentDirectory) return;
    const current = cachedData ?? { lastActivityTimestamp: getMascotNow() };
    const merged: MascotStorageData = { ...current, ...data };
    cachedData = merged;
    await writeAsStringAsync(MASCOT_STORAGE_FILE, JSON.stringify(merged));
  } catch (err) {
    console.warn('[MascotStorage] Failed to save storage:', err);
  }
}

/**
 * Returns currently cached data synchronously, or a safe default.
 */
export function getCachedMascotStorage(): MascotStorageData {
  if (cachedData) return cachedData;
  return { lastActivityTimestamp: getMascotNow() };
}

/**
 * Records a meaningful user action (e.g. initiating download, switching tabs, manual interaction).
 * Updates lastActivityTimestamp to current time.
 */
export async function recordMascotActivity(): Promise<void> {
  const now = getMascotNow();
  await saveMascotStorage({
    lastActivityTimestamp: now,
  });
}
