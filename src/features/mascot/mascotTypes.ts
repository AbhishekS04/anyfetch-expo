/**
 * mascotTypes.ts — AnyFetch Dynamic Pixel Mascot Types
 */

export type MascotState =
  | 'idle'
  | 'happy'
  | 'excited'
  | 'downloading'
  | 'success'
  | 'failed'
  | 'sleepy'
  | 'sad'
  | 'crying'
  | 'pleading'
  | 'angry'
  | 'celebrating';

export type InactivityState = 'idle' | 'sleepy' | 'sad' | 'crying';

export type MascotAssetKey = 'main' | 'sad' | 'angry' | 'dramatic';

export interface MascotStorageData {
  lastActivityTimestamp: number;
  lastDismissedGreetingTimestamp?: number;
  sessionSuccessfulDownloads?: number;
  consecutiveFailures?: number;
}

export interface MascotConfig {
  inactivityThresholds: {
    sleepy: number; // e.g. 24h
    sad: number;    // e.g. 48h
    crying: number; // e.g. 72h
  };
  reactionDurations: Record<string, number>;
  failureThresholdForAngry: number;
  downloadsForMilestone: number;
}

export type MascotReturnGreetingType = 'none' | 'sleepy' | 'sad' | 'crying' | 'dramatic';
