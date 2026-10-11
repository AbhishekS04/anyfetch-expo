/**
 * mascotConfig.ts — Central configuration for AnyFetch Pixel Mascot
 */

import { MascotAssetKey, MascotConfig, MascotState } from './mascotTypes';

export const MASCOT_CONFIG: MascotConfig = {
  inactivityThresholds: {
    sleepy: 24 * 60 * 60 * 1000, // 24 hours (86,400,000 ms)
    sad: 48 * 60 * 60 * 1000,    // 48 hours (172,800,000 ms)
    crying: 72 * 60 * 60 * 1000, // 72 hours (259,200,000 ms)
  },
  reactionDurations: {
    happy: 3500,
    excited: 4000,
    success: 3500,
    failed: 3500,
    angry: 4000,
    celebrating: 4500,
    pleading: 4000,
  },
  failureThresholdForAngry: 2,
  downloadsForMilestone: 3,
};

/**
 * Bundled source PNG assets directly from the project's logo/ directory.
 * Source of truth: logo/ directory.
 */
export const MASCOT_ASSETS: Record<MascotAssetKey, any> = {
  main: require('../../../logo/mainlogo.png'),
  sad: require('../../../logo/sadlogo.png'),
  angry: require('../../../logo/angrylogo.png'),
  dramatic: require('../../../logo/dramaticlogo.png'),
};

/**
 * Mapping of each mascot state to its corresponding character asset.
 */
export const STATE_TO_ASSET_MAP: Record<MascotState, MascotAssetKey> = {
  idle: 'main',
  happy: 'main',
  excited: 'main',
  downloading: 'main',
  success: 'main',
  failed: 'sad',
  sleepy: 'sad',
  sad: 'sad',
  crying: 'sad',
  pleading: 'sad',
  angry: 'angry',
  celebrating: 'dramatic',
};

/**
 * Emotional metadata and accessible status labels for each state.
 */
export const MASCOT_STATE_META: Record<
  MascotState,
  { label: string; moodBadgeColor: string; description: string }
> = {
  idle: {
    label: 'Ready to fetch',
    moodBadgeColor: '#10B981',
    description: 'AnyFetch companion is chill and ready to download.',
  },
  happy: {
    label: 'Feeling great!',
    moodBadgeColor: '#10B981',
    description: 'AnyFetch companion is joyful and smiling.',
  },
  excited: {
    label: 'Super charged!',
    moodBadgeColor: '#F59E0B',
    description: 'AnyFetch companion is excited after consecutive downloads.',
  },
  downloading: {
    label: 'Fetching media…',
    moodBadgeColor: '#3B82F6',
    description: 'AnyFetch companion is actively fetching stream bytes.',
  },
  success: {
    label: 'Saved to gallery!',
    moodBadgeColor: '#10B981',
    description: 'AnyFetch companion successfully saved your media.',
  },
  failed: {
    label: 'Download stalled',
    moodBadgeColor: '#EF4444',
    description: 'AnyFetch companion encountered a stream error.',
  },
  sleepy: {
    label: 'A bit sleepy…',
    moodBadgeColor: '#8B5CF6',
    description: 'AnyFetch companion has been resting for over a day.',
  },
  sad: {
    label: 'Missing you…',
    moodBadgeColor: '#60A5FA',
    description: 'AnyFetch companion has not seen you in 2 days.',
  },
  crying: {
    label: 'So lonely…',
    moodBadgeColor: '#38BDF8',
    description: 'AnyFetch companion has been waiting for 3+ days.',
  },
  pleading: {
    label: 'Fetch something?',
    moodBadgeColor: '#F472B6',
    description: 'AnyFetch companion hopes you have a link to download.',
  },
  angry: {
    label: 'Grrr… stream failed',
    moodBadgeColor: '#DC2626',
    description: 'AnyFetch companion is frustrated by repeated errors.',
  },
  celebrating: {
    label: 'Level up!',
    moodBadgeColor: '#EAB308',
    description: 'AnyFetch companion is celebrating your downloads streak.',
  },
};
