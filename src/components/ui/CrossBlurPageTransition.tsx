/**
 * CrossBlurPageTransition.tsx — React Native / Expo implementation of Great UI's CrossBlur
 * Reference: https://www.great-ui.com/r/cross-blur-page-transition.json
 *
 * Utilizes soft blur filters and cross-fading overlays to create a gentle,
 * cinematic transition between pages with a midpoint onViewSwap trigger.
 */

import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  StyleSheet,
  Animated,
  Modal,
  Easing,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';

export interface CrossBlurPageTransitionProps {
  /** Value key to programmatically trigger the transition overlay */
  trigger: number;
  /** Callback fired at mid-transition to perform state/view swaps */
  onViewSwap?: () => void;
  /** Callback fired when transition completes and resets to idle */
  onComplete?: () => void;
  /** Total duration in seconds (default: 0.6) */
  duration?: number;
  /** Maximum blur intensity (default: 20) */
  maxBlur?: number;
  /** Background veil color (default: 'rgba(0, 0, 0, 0.38)') */
  overlayColor?: string;
  /** Optional custom container style */
  style?: StyleProp<ViewStyle>;
}

export type TransitionState = 'idle' | 'entering' | 'exiting';

export const CrossBlurPageTransition: React.FC<CrossBlurPageTransitionProps> = ({
  trigger,
  onViewSwap,
  onComplete,
  duration = 0.22,
  maxBlur = 16,
  overlayColor = 'rgba(0, 0, 0, 0.35)',
  style,
}) => {
  const [transitionState, setTransitionState] = useState<TransitionState>('idle');

  const onViewSwapRef = useRef(onViewSwap);
  const onCompleteRef = useRef(onComplete);

  // GPU-accelerated opacity animation
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    onViewSwapRef.current = onViewSwap;
    onCompleteRef.current = onComplete;
  }, [onViewSwap, onComplete]);

  useEffect(() => {
    if (trigger > 0) {
      setTransitionState('entering');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

      const totalMs = Math.round(duration * 1000);
      const enterMs = Math.round(totalMs * 0.45);
      const exitMs = totalMs - enterMs;
      const easeCurve = Easing.bezier(0.25, 0.1, 0.25, 1);

      opacityAnim.setValue(0);

      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: enterMs,
        easing: easeCurve,
        useNativeDriver: true,
      }).start();

      if (onViewSwapRef.current) {
        onViewSwapRef.current();
      }

      const exitTimeout = setTimeout(() => {
        setTransitionState('exiting');
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: exitMs,
          easing: easeCurve,
          useNativeDriver: true,
        }).start();
      }, enterMs);

      const doneTimeout = setTimeout(() => {
        setTransitionState('idle');
        if (onCompleteRef.current) {
          onCompleteRef.current();
        }
      }, totalMs);

      return () => {
        clearTimeout(exitTimeout);
        clearTimeout(doneTimeout);
      };
    }
  }, [trigger, duration, opacityAnim]);

  if (transitionState === 'idle') {
    return null;
  }

  return (
    <Animated.View
      style={[
        styles.overlay,
        {
          opacity: opacityAnim,
        },
        style,
      ]}
      pointerEvents="none"
    >
      {/* Soft Background Blur Layer */}
      <BlurView
        tint="dark"
        intensity={maxBlur}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* Cross-fading Soft Color Veil */}
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: overlayColor,
          },
        ]}
      />
    </Animated.View>
  );
};

export default CrossBlurPageTransition;

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'transparent',
    overflow: 'hidden',
    zIndex: 9999,
  },
});

