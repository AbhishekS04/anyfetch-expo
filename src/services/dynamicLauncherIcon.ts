/**
 * dynamicLauncherIcon.ts — Cross-Platform Dynamic Launcher Icon Controller (Duolingo-style)
 *
 * Communicates with the native Android DynamicIcon module to switch the app drawer
 * and home screen launcher icon automatically based on user streaks and inactivity:
 * - Active / In Use: Runner Ninja (mainlogo.png / MainActivity)
 * - 24 Hours Inactive: Sad Crying Ninja (sadlogo.png / MainActivitySad)
 * - 48 Hours Inactive: Angry Fiery Ninja (angrylogo.png / MainActivityAngry)
 * - 72+ Hours Inactive: Dramatic Pleading Ninja (dramaticlogo.png / MainActivityDramatic)
 */

import { NativeModules, Platform } from 'react-native';

const { DynamicIcon } = NativeModules;

export type LauncherIconType = 'default' | 'sad' | 'angry' | 'dramatic';

export interface LauncherIconMeta {
  id: LauncherIconType;
  label: string;
  stageLabel: string;
  description: string;
  previewAsset: any;
}

export interface InactivityStatusInfo {
  lastActive: number;
  elapsedMs: number;
  testMode: boolean;
  sadThreshold: number;
  angryThreshold: number;
  dramaticThreshold: number;
}

export const LAUNCHER_ICONS: LauncherIconMeta[] = [
  {
    id: 'default',
    label: 'Runner Ninja',
    stageLabel: 'Active Streak',
    description: 'Default runner ninja mascot (mainlogo.png) active when you use the app.',
    previewAsset: require('../../logo/mainlogo.png'),
  },
  {
    id: 'sad',
    label: 'Sad Ninja',
    stageLabel: '24h Inactive',
    description: 'Tearful mascot waiting for you to return and fetch.',
    previewAsset: require('../../logo/sadlogo.png'),
  },
  {
    id: 'angry',
    label: 'Fiery Ninja',
    stageLabel: '48h Inactive',
    description: 'Furious aura of flames and steam from long inactivity.',
    previewAsset: require('../../logo/angrylogo.png'),
  },
  {
    id: 'dramatic',
    label: 'Requesting Ninja',
    stageLabel: '72h+ Inactive',
    description: 'Pleading mascot with hands together requesting you to come back.',
    previewAsset: require('../../logo/dramaticlogo.png'),
  },
];

/**
 * Checks if native dynamic icon switching is supported on the current platform.
 */
export function isDynamicIconSupported(): boolean {
  return Platform.OS === 'android' && Boolean(DynamicIcon && DynamicIcon.setIcon);
}

/**
 * Records user activity: restores Runner Ninja icon and arms background inactivity timers.
 * Call this when the app starts or user interacts with media.
 */
export async function recordAppUsage(): Promise<boolean> {
  if (!isDynamicIconSupported()) return false;
  try {
    await DynamicIcon.recordActivity();
    return true;
  } catch (err) {
    console.warn('[DynamicIcon] Failed to record activity:', err);
    return false;
  }
}

/**
 * Evaluates current inactivity and syncs the appropriate launcher icon.
 */
export async function evaluateLauncherIcon(): Promise<LauncherIconType> {
  if (!isDynamicIconSupported()) return 'default';
  try {
    const res = await DynamicIcon.evaluateIcon();
    return (res as LauncherIconType) || 'default';
  } catch (err) {
    console.warn('[DynamicIcon] Failed to evaluate icon:', err);
    return 'default';
  }
}

/**
 * Fetches real-time inactivity countdown and threshold status.
 */
export async function getInactivityStatus(): Promise<InactivityStatusInfo | null> {
  if (!isDynamicIconSupported()) return null;
  try {
    const status = await DynamicIcon.getInactivityStatus();
    return status as InactivityStatusInfo;
  } catch (err) {
    console.warn('[DynamicIcon] Failed to get inactivity status:', err);
    return null;
  }
}

/**
 * Toggles accelerated 1-minute test mode for instant verification.
 */
export async function setDynamicIconTestMode(enabled: boolean): Promise<LauncherIconType> {
  if (!isDynamicIconSupported()) return 'default';
  try {
    const res = await DynamicIcon.setTestMode(enabled);
    return (res as LauncherIconType) || 'default';
  } catch (err) {
    console.warn('[DynamicIcon] Failed to set test mode:', err);
    return 'default';
  }
}

/**
 * Gets the list of available launcher icons.
 */
export async function getAvailableIcons(): Promise<LauncherIconType[]> {
  if (isDynamicIconSupported()) {
    try {
      const list = await DynamicIcon.getAvailableIcons();
      if (Array.isArray(list) && list.length > 0) {
        return list as LauncherIconType[];
      }
    } catch {
      // Fallback
    }
  }
  return ['default', 'sad', 'angry', 'dramatic'];
}

/**
 * Returns the currently active launcher icon alias.
 */
export async function getCurrentLauncherIcon(): Promise<LauncherIconType> {
  if (!isDynamicIconSupported()) {
    return 'default';
  }
  try {
    const current = await DynamicIcon.getCurrentIcon();
    return (current as LauncherIconType) || 'default';
  } catch (err) {
    console.warn('[DynamicIcon] Failed to get current icon:', err);
    return 'default';
  }
}

/**
 * Switches the launcher icon on the Android Home Screen and App Drawer (Duolingo-style).
 */
export async function setLauncherIcon(icon: LauncherIconType): Promise<boolean> {
  if (!isDynamicIconSupported()) {
    return false;
  }
  try {
    await DynamicIcon.setIcon(icon);
    return true;
  } catch (err) {
    console.warn(`[DynamicIcon] Failed to set launcher icon to '${icon}':`, err);
    return false;
  }
}
