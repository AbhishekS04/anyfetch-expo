/**
 * useMascot.ts — Central Hook for AnyFetch Pixel Mascot
 *
 * Integrates:
 * - Deterministic state subscription
 * - AppState foreground/background monitoring (recalculates on foreground return)
 * - Safe manual activity dispatch
 * - Download lifecycle triggers
 */

import { useState, useEffect, useCallback } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { mascotController } from './mascotState';
import { MASCOT_STATE_META } from './mascotConfig';
import {
  simulateInactivityHours as simulateInactivityHoursHelper,
  setSimulatedClockOffset,
} from './mascotStorage';
import { MascotReturnGreetingType, MascotState } from './mascotTypes';

export function useMascot() {
  const [state, setState] = useState<MascotState>(mascotController.getState());
  const [returnGreeting, setReturnGreeting] = useState<MascotReturnGreetingType>(
    mascotController.getReturnGreeting()
  );

  useEffect(() => {
    // 1. Subscribe to controller state changes
    const unsubscribe = mascotController.subscribe((newState, newGreeting) => {
      setState(newState);
      setReturnGreeting(newGreeting);
    });

    // 2. Listen to AppState (foreground return triggers recalculation)
    const handleAppStateChange = (nextStatus: AppStateStatus) => {
      if (nextStatus === 'active') {
        mascotController.recalculateState();
      }
    };

    const sub = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      unsubscribe();
      sub.remove();
    };
  }, []);

  const recordActivity = useCallback(() => {
    mascotController.recordActivity();
  }, []);

  const triggerDownloadStart = useCallback(() => {
    mascotController.onDownloadStart();
  }, []);

  const triggerDownloadSuccess = useCallback(() => {
    mascotController.onDownloadSuccess();
  }, []);

  const triggerDownloadError = useCallback(() => {
    mascotController.onDownloadError();
  }, []);

  const triggerReaction = useCallback((reaction: MascotState, durationMs?: number) => {
    mascotController.setTemporaryReaction(reaction, durationMs);
  }, []);

  const dismissReturnGreeting = useCallback(() => {
    mascotController.dismissReturnGreeting();
  }, []);

  const simulateInactivity = useCallback((hours: number) => {
    simulateInactivityHoursHelper(hours);
    mascotController.recalculateState();
  }, []);

  const resetSimulation = useCallback(() => {
    setSimulatedClockOffset(0);
    mascotController.recalculateState();
  }, []);

  return {
    state,
    returnGreeting,
    showReturnGreeting: returnGreeting !== 'none',
    meta: MASCOT_STATE_META[state],
    recordActivity,
    triggerDownloadStart,
    triggerDownloadSuccess,
    triggerDownloadError,
    triggerReaction,
    dismissReturnGreeting,
    simulateInactivity,
    resetSimulation,
  };
}
