/**
 * mascotState.ts — Central State Controller and State Resolver for AnyFetch Pixel Mascot
 *
 * Implements deterministic priority hierarchy:
 * Priority 1: ACTIVE DOWNLOAD ('downloading') — never overridden by reactions
 * Priority 2: TEMPORARY REACTION ('success', 'failed', 'angry', 'celebrating', 'excited', 'happy', 'pleading')
 * Priority 3: INACTIVITY ABSENCE ('sleepy', 'sad', 'crying')
 * Priority 4: BASE IDLE ('idle')
 */

import { MASCOT_CONFIG } from './mascotConfig';
import {
  getMascotNow,
  loadMascotStorage,
  saveMascotStorage,
  recordMascotActivity,
} from './mascotStorage';
import {
  InactivityState,
  MascotReturnGreetingType,
  MascotState,
} from './mascotTypes';

type StateListener = (state: MascotState, greeting: MascotReturnGreetingType) => void;

class MascotController {
  private currentState: MascotState = 'idle';
  private activeDownloadCount: number = 0;
  private temporaryReaction: MascotState | null = null;
  private reactionTimeout: ReturnType<typeof setTimeout> | null = null;
  private listeners: Set<StateListener> = new Set();
  private returnGreeting: MascotReturnGreetingType = 'none';

  // In-session tracking
  private sessionSuccessCount: number = 0;
  private consecutiveFailureCount: number = 0;

  private isInitialized: boolean = false;

  constructor() {
    this.init();
  }

  /**
   * Initializes controller and reads stored activity timestamp.
   */
  public async init(): Promise<void> {
    if (this.isInitialized) return;
    const data = await loadMascotStorage();
    this.sessionSuccessCount = data.sessionSuccessfulDownloads ?? 0;
    this.consecutiveFailureCount = data.consecutiveFailures ?? 0;
    this.isInitialized = true;
    this.recalculateState();
  }

  /**
   * Subscribes a component to state updates.
   */
  public subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    listener(this.currentState, this.returnGreeting);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Returns current active mascot state synchronously.
   */
  public getState(): MascotState {
    return this.currentState;
  }

  /**
   * Returns current return-after-absence greeting type if applicable.
   */
  public getReturnGreeting(): MascotReturnGreetingType {
    return this.returnGreeting;
  }

  /**
   * Resolves inactivity state based on elapsed time since last meaningful interaction.
   */
  public resolveInactivityState(lastActivityTimestamp: number, now: number): InactivityState {
    const elapsed = Math.max(0, now - lastActivityTimestamp);
    const { thresholds } = { thresholds: MASCOT_CONFIG.inactivityThresholds };

    if (elapsed >= thresholds.crying) {
      return 'crying';
    }
    if (elapsed >= thresholds.sad) {
      return 'sad';
    }
    if (elapsed >= thresholds.sleepy) {
      return 'sleepy';
    }
    return 'idle';
  }

  /**
   * Recalculates state using the strict priority hierarchy.
   */
  public async recalculateState(): Promise<void> {
    const data = await loadMascotStorage();
    const now = getMascotNow();
    const inactivity = this.resolveInactivityState(data.lastActivityTimestamp, now);

    // Compute return greeting if absence >= 24h and not already dismissed today
    if (inactivity !== 'idle') {
      const lastDismissed = data.lastDismissedGreetingTimestamp ?? 0;
      // Show greeting only once per 12 hours of absence
      if (now - lastDismissed > 12 * 60 * 60 * 1000) {
        if (inactivity === 'crying') this.returnGreeting = 'crying';
        else if (inactivity === 'sad') this.returnGreeting = 'sad';
        else if (inactivity === 'sleepy') this.returnGreeting = 'sleepy';
      }
    } else {
      this.returnGreeting = 'none';
    }

    let nextState: MascotState = 'idle';

    // ── Priority 1: Active Download
    if (this.activeDownloadCount > 0) {
      nextState = 'downloading';
    }
    // ── Priority 2: Temporary Reaction
    else if (this.temporaryReaction) {
      nextState = this.temporaryReaction;
    }
    // ── Priority 3: Inactivity State
    else if (inactivity !== 'idle') {
      nextState = inactivity;
    }
    // ── Priority 4: Base Idle
    else {
      nextState = 'idle';
    }

    if (this.currentState !== nextState) {
      this.currentState = nextState;
      this.notifyListeners();
    }
  }

  /**
   * Called when an active download starts.
   */
  public onDownloadStart(): void {
    this.activeDownloadCount++;
    this.clearTemporaryReaction();
    recordMascotActivity().catch(() => {});
    this.recalculateState();
  }

  /**
   * Called when a download succeeds.
   */
  public onDownloadSuccess(): void {
    this.activeDownloadCount = Math.max(0, this.activeDownloadCount - 1);
    this.sessionSuccessCount++;
    this.consecutiveFailureCount = 0;
    saveMascotStorage({
      sessionSuccessfulDownloads: this.sessionSuccessCount,
      consecutiveFailures: 0,
      lastActivityTimestamp: getMascotNow(),
    }).catch(() => {});

    // Milestone bonus: every N downloads in session -> celebrating or excited!
    if (this.sessionSuccessCount % MASCOT_CONFIG.downloadsForMilestone === 0) {
      this.setTemporaryReaction('celebrating', MASCOT_CONFIG.reactionDurations.celebrating);
    } else if (this.sessionSuccessCount > 1 && Math.random() > 0.5) {
      this.setTemporaryReaction('excited', MASCOT_CONFIG.reactionDurations.excited);
    } else {
      this.setTemporaryReaction('success', MASCOT_CONFIG.reactionDurations.success);
    }
  }

  /**
   * Called when a download fails.
   */
  public onDownloadError(): void {
    this.activeDownloadCount = Math.max(0, this.activeDownloadCount - 1);
    this.consecutiveFailureCount++;
    saveMascotStorage({
      consecutiveFailures: this.consecutiveFailureCount,
      lastActivityTimestamp: getMascotNow(),
    }).catch(() => {});

    // Repeated failures -> angry expression
    if (this.consecutiveFailureCount >= MASCOT_CONFIG.failureThresholdForAngry) {
      this.setTemporaryReaction('angry', MASCOT_CONFIG.reactionDurations.angry);
    } else {
      this.setTemporaryReaction('failed', MASCOT_CONFIG.reactionDurations.failed);
    }
  }

  /**
   * Sets a temporary visual reaction with auto-expiry.
   * Cancels any pending reaction timer.
   */
  public setTemporaryReaction(state: MascotState, durationMs?: number): void {
    this.clearTemporaryReaction();
    this.temporaryReaction = state;
    this.recalculateState();

    const duration = durationMs ?? MASCOT_CONFIG.reactionDurations[state] ?? 3500;
    this.reactionTimeout = setTimeout(() => {
      this.temporaryReaction = null;
      this.reactionTimeout = null;
      this.recalculateState();
    }, duration);
  }

  /**
   * Manually records meaningful user activity (e.g. navigation, manual tap, paste).
   */
  public recordActivity(): void {
    recordMascotActivity().catch(() => {});
    if (this.currentState === 'sleepy' || this.currentState === 'sad' || this.currentState === 'crying') {
      // Warm recovery greeting
      this.setTemporaryReaction('happy', 3500);
    } else {
      this.recalculateState();
    }
  }

  /**
   * Dismisses the return-after-absence greeting.
   */
  public dismissReturnGreeting(): void {
    const now = getMascotNow();
    this.returnGreeting = 'none';
    saveMascotStorage({
      lastDismissedGreetingTimestamp: now,
      lastActivityTimestamp: now,
    }).catch(() => {});
    this.setTemporaryReaction('happy', 3500);
  }

  /**
   * Cancels active temporary reaction timer safely.
   */
  private clearTemporaryReaction(): void {
    if (this.reactionTimeout) {
      clearTimeout(this.reactionTimeout);
      this.reactionTimeout = null;
    }
    this.temporaryReaction = null;
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener(this.currentState, this.returnGreeting);
    }
  }
}

// Single persistent singleton controller instance
export const mascotController = new MascotController();
