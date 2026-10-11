/**
 * HoldToContinueButton.tsx — Custom Hold-to-Continue Action Button
 *
 * Implements a hold-gesture activation button with animated fill,
 * haptic tick feedback, completion lockout, and accessible fallbacks.
 */

import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  Easing,
  AccessibilityActionEvent,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Sparkles, ArrowRight } from 'reicon-react-native';
import { FONTS } from '../../theme/typography';

export interface HoldToContinueProps {
  onComplete: () => void;
  disabled?: boolean;
  label?: string;
  durationMs?: number;
  accentColor?: string;
}

export default function HoldToContinueButton({
  onComplete,
  disabled = false,
  label = 'Hold to Continue',
  durationMs = 1200,
  accentColor = '#FF9F0A',
}: HoldToContinueProps) {
  const [isPressing, setIsPressing] = useState(false);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const isCompletedRef = useRef(false);
  const hapticIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startHolding = () => {
    if (disabled || isCompletedRef.current) return;
    setIsPressing(true);

    // Initial light feedback
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

    // Periodic subtle haptic ticks while holding
    hapticIntervalRef.current = setInterval(() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }, 280);

    Animated.timing(progressAnim, {
      toValue: 1,
      duration: durationMs,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (hapticIntervalRef.current) {
        clearInterval(hapticIntervalRef.current);
        hapticIntervalRef.current = null;
      }

      if (finished && !isCompletedRef.current) {
        isCompletedRef.current = true;
        setIsPressing(false);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        onComplete();
      }
    });
  };

  const cancelHolding = () => {
    if (isCompletedRef.current) return;
    setIsPressing(false);

    if (hapticIntervalRef.current) {
      clearInterval(hapticIntervalRef.current);
      hapticIntervalRef.current = null;
    }

    // Cancel and smoothly spring back to 0
    Animated.spring(progressAnim, {
      toValue: 0,
      stiffness: 300,
      damping: 24,
      useNativeDriver: false,
    }).start();
  };

  // Accessible fallback for assistive technologies
  const handleAccessibilityAction = (event: AccessibilityActionEvent) => {
    if (disabled || isCompletedRef.current) return;
    if (event.nativeEvent.actionName === 'activate') {
      isCompletedRef.current = true;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onComplete();
    }
  };

  const widthInterpolation = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <Pressable
      disabled={disabled}
      onPressIn={startHolding}
      onPressOut={cancelHolding}
      accessible={true}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Press and hold down to continue, or activate to proceed immediately"
      accessibilityActions={[{ name: 'activate', label: 'Activate and continue' }]}
      onAccessibilityAction={handleAccessibilityAction}
      style={({ pressed }) => [
        s.container,
        { borderColor: isPressing ? accentColor : 'rgba(255, 255, 255, 0.14)' },
        disabled && s.disabledContainer,
        pressed && s.pressedContainer,
      ]}
    >
      {/* Background Fill Progress Bar */}
      <Animated.View
        style={[
          s.progressFill,
          {
            width: widthInterpolation,
            backgroundColor: accentColor,
          },
        ]}
      />

      {/* Button Content */}
      <View style={s.contentRow}>
        <Sparkles
          size={18}
          color={isPressing ? '#000000' : accentColor}
        />
        <Text
          style={[
            s.buttonLabel,
            { color: isPressing ? '#000000' : '#FFFFFF' },
          ]}
        >
          {label}
        </Text>
        <ArrowRight
          size={18}
          color={isPressing ? '#000000' : '#A1A1AA'}
        />
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  container: {
    height: 56,
    borderRadius: 16,
    backgroundColor: '#16161A',
    borderWidth: 1.5,
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  progressFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    borderRadius: 14,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    zIndex: 2,
    paddingHorizontal: 20,
  },
  buttonLabel: {
    fontFamily: FONTS.sans,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  disabledContainer: {
    opacity: 0.45,
  },
  pressedContainer: {
    transform: [{ scale: 0.99 }],
  },
});
