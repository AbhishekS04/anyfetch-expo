/**
 * Mascot.tsx — Reusable Dynamic Pixel Mascot Component
 *
 * Implements restrained, performant 60fps animations via React Native Animated:
 * - Idle: subtle floating
 * - Happy: small single bounce
 * - Excited: quick double bounce
 * - Downloading: gentle anticipation pulse
 * - Success: celebratory spring bounce
 * - Failed: short horizontal shake
 * - Sleepy: slow, subtle nodding
 * - Sad / Crying: gentle downward slump
 * - Pleading: small subtle pulse
 * - Angry: brief energetic shake
 * - Celebrating: joyous bounce with slight tilt
 *
 * Features:
 * - Safe fallback to mainlogo.png on image error
 * - Pauses animations when app is backgrounded
 * - Accessible labels & roles
 * - Light/Dark theme awareness
 */

import React, { useRef, useEffect, useState, useMemo } from 'react';
import {
  View,
  Image,
  Animated,
  StyleSheet,
  Pressable,
  AppState,
  AccessibilityInfo,
  type ViewStyle,
  type StyleProp,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { MASCOT_ASSETS, STATE_TO_ASSET_MAP, MASCOT_STATE_META } from './mascotConfig';
import { MascotAssetKey, MascotState } from './mascotTypes';

export interface MascotProps {
  /** Active mascot state (defaults to 'idle') */
  state?: MascotState;
  /** Size in pixels (both width & height of the container). Default: 80 */
  size?: number;
  /** Whether restrained animations are enabled. Default: true */
  animated?: boolean;
  /** Whether to enclose inside a sleek squircle card badge. Default: true */
  showBadgeFrame?: boolean;
  /** Optional custom container style */
  style?: StyleProp<ViewStyle>;
  /** Optional press handler (triggers haptic + gentle bounce if provided) */
  onPress?: () => void;
  /** Custom accessibility label override */
  accessibilityLabel?: string;
}

export const Mascot: React.FC<MascotProps> = ({
  state = 'idle',
  size = 80,
  animated = true,
  showBadgeFrame = true,
  style,
  onPress,
  accessibilityLabel,
}) => {
  const [reduceMotion, setReduceMotion] = useState(false);
  const [assetLoadError, setAssetLoadError] = useState(false);

  // Animated values
  const translateY = useRef(new Animated.Value(0)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const rotate = useRef(new Animated.Value(0)).current;

  // Active looping animation controller
  const loopAnimRef = useRef<Animated.CompositeAnimation | null>(null);

  // Check reduced motion settings
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then(enabled => setReduceMotion(enabled))
      .catch(() => {});
  }, []);

  // Resolve target asset key with defensive fallback to 'main'
  const assetKey = useMemo<MascotAssetKey>(() => {
    if (assetLoadError) return 'main';
    return STATE_TO_ASSET_MAP[state] || 'main';
  }, [state, assetLoadError]);

  const source = MASCOT_ASSETS[assetKey] || MASCOT_ASSETS.main;
  const meta = MASCOT_STATE_META[state] || MASCOT_STATE_META.idle;

  // Reset transforms helper
  const resetTransforms = () => {
    if (loopAnimRef.current) {
      loopAnimRef.current.stop();
      loopAnimRef.current = null;
    }
    translateY.setValue(0);
    translateX.setValue(0);
    scale.setValue(1);
    rotate.setValue(0);
  };

  // Run animations per state
  useEffect(() => {
    resetTransforms();

    if (!animated || reduceMotion) return;

    let isSubscribed = true;

    // Listen to AppState to pause animations when in background
    const appStateSub = AppState.addEventListener('change', nextState => {
      if (nextState !== 'active') {
        if (loopAnimRef.current) {
          loopAnimRef.current.stop();
        }
      }
    });

    switch (state) {
      case 'idle': {
        // Subtle floating loop
        const floatLoop = Animated.loop(
          Animated.sequence([
            Animated.timing(translateY, {
              toValue: -3.5,
              duration: 1400,
              useNativeDriver: true,
            }),
            Animated.timing(translateY, {
              toValue: 2,
              duration: 1400,
              useNativeDriver: true,
            }),
          ])
        );
        loopAnimRef.current = floatLoop;
        floatLoop.start();
        break;
      }

      case 'downloading': {
        // Gentle anticipation pulse
        const pulseLoop = Animated.loop(
          Animated.sequence([
            Animated.timing(scale, {
              toValue: 1.05,
              duration: 750,
              useNativeDriver: true,
            }),
            Animated.timing(scale, {
              toValue: 0.96,
              duration: 750,
              useNativeDriver: true,
            }),
          ])
        );
        loopAnimRef.current = pulseLoop;
        pulseLoop.start();
        break;
      }

      case 'sleepy': {
        // Slow subtle nodding
        const nodLoop = Animated.loop(
          Animated.sequence([
            Animated.timing(translateY, {
              toValue: 2.5,
              duration: 2000,
              useNativeDriver: true,
            }),
            Animated.timing(translateY, {
              toValue: -1,
              duration: 2000,
              useNativeDriver: true,
            }),
          ])
        );
        loopAnimRef.current = nodLoop;
        nodLoop.start();
        break;
      }

      case 'happy': {
        // Small single bounce
        Animated.sequence([
          Animated.timing(translateY, {
            toValue: -8,
            duration: 180,
            useNativeDriver: true,
          }),
          Animated.spring(translateY, {
            toValue: 0,
            friction: 4,
            tension: 50,
            useNativeDriver: true,
          }),
        ]).start();
        break;
      }

      case 'excited': {
        // Quick double bounce
        Animated.sequence([
          Animated.timing(translateY, {
            toValue: -7,
            duration: 140,
            useNativeDriver: true,
          }),
          Animated.timing(translateY, {
            toValue: 0,
            duration: 140,
            useNativeDriver: true,
          }),
          Animated.timing(translateY, {
            toValue: -9,
            duration: 150,
            useNativeDriver: true,
          }),
          Animated.spring(translateY, {
            toValue: 0,
            friction: 4,
            useNativeDriver: true,
          }),
        ]).start();
        break;
      }

      case 'success': {
        // Celebratory spring bounce
        Animated.sequence([
          Animated.spring(scale, {
            toValue: 1.14,
            friction: 3,
            tension: 70,
            useNativeDriver: true,
          }),
          Animated.spring(scale, {
            toValue: 1,
            friction: 5,
            useNativeDriver: true,
          }),
        ]).start();
        break;
      }

      case 'failed':
      case 'angry': {
        // Short horizontal shake
        Animated.sequence([
          Animated.timing(translateX, { toValue: -5, duration: 60, useNativeDriver: true }),
          Animated.timing(translateX, { toValue: 5, duration: 60, useNativeDriver: true }),
          Animated.timing(translateX, { toValue: -4, duration: 60, useNativeDriver: true }),
          Animated.timing(translateX, { toValue: 4, duration: 60, useNativeDriver: true }),
          Animated.timing(translateX, { toValue: 0, duration: 60, useNativeDriver: true }),
        ]).start();
        break;
      }

      case 'sad':
      case 'crying': {
        // Gentle downward movement/slump
        Animated.timing(translateY, {
          toValue: 4.5,
          duration: 400,
          useNativeDriver: true,
        }).start();
        break;
      }

      case 'pleading': {
        // Gentle soft upward pulse
        Animated.sequence([
          Animated.timing(scale, { toValue: 1.06, duration: 250, useNativeDriver: true }),
          Animated.timing(scale, { toValue: 1, duration: 250, useNativeDriver: true }),
        ]).start();
        break;
      }

      case 'celebrating': {
        // Short controlled celebration: bounce + subtle tilt
        Animated.parallel([
          Animated.sequence([
            Animated.timing(translateY, { toValue: -8, duration: 180, useNativeDriver: true }),
            Animated.spring(translateY, { toValue: 0, friction: 3, useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.timing(rotate, { toValue: 1, duration: 140, useNativeDriver: true }),
            Animated.timing(rotate, { toValue: -1, duration: 140, useNativeDriver: true }),
            Animated.timing(rotate, { toValue: 0, duration: 140, useNativeDriver: true }),
          ]),
        ]).start();
        break;
      }
    }

    return () => {
      isSubscribed = false;
      appStateSub.remove();
      resetTransforms();
    };
  }, [state, animated, reduceMotion]);

  // Handle tap on mascot
  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    // Tap reaction animation
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.92, duration: 80, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 4, tension: 80, useNativeDriver: true }),
    ]).start();

    if (onPress) onPress();
  };

  const spin = rotate.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: ['-8deg', '0deg', '8deg'],
  });

  const borderRadius = Math.round(size * 0.28);

  const containerContent = (
    <Animated.View
      style={[
        s.imageWrapper,
        showBadgeFrame && [
          s.badgeFrame,
          {
            width: size,
            height: size,
            borderRadius,
            borderColor: `${meta.moodBadgeColor}33`,
          },
        ],
        {
          transform: [
            { translateY },
            { translateX },
            { scale },
            { rotate: spin },
          ],
        },
      ]}
    >
      <Image
        source={source}
        style={{
          width: showBadgeFrame ? size - 4 : size,
          height: showBadgeFrame ? size - 4 : size,
          borderRadius: showBadgeFrame ? borderRadius - 2 : 0,
        }}
        resizeMode="contain"
        onError={() => setAssetLoadError(true)}
      />
    </Animated.View>
  );

  return (
    <Pressable
      onPress={handlePress}
      style={[s.root, style]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel || `AnyFetch Mascot: ${meta.label}. ${meta.description}`}
    >
      {containerContent}
    </Pressable>
  );
};

export default Mascot;

const s = StyleSheet.create({
  root: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageWrapper: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeFrame: {
    backgroundColor: '#121215',
    borderWidth: 1.5,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 8,
  },
});
