/**
 * MascotGreetingCard.tsx — Tasteful, Dismissible Return Greeting Card
 *
 * Appears when user returns after 24h, 48h, or 72h+ of inactivity.
 * Never takes over the full screen. Does not guilt-trip or create false urgency.
 * Smoothly dismissible with native haptic feedback.
 */

import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  Dimensions,
} from 'react-native';
import { CloseCircle, Sparkles } from 'reicon-react-native';
import * as Haptics from 'expo-haptics';
import { Mascot } from './Mascot';
import { useMascot } from './useMascot';
import { FONTS } from '../../theme/typography';
import { useAppTheme } from '../../theme/ThemeContext';

const { width: W } = Dimensions.get('window');

interface MascotGreetingCardProps {
  onDismiss?: () => void;
}

export const MascotGreetingCard: React.FC<MascotGreetingCardProps> = ({ onDismiss }) => {
  const { state, returnGreeting, showReturnGreeting, dismissReturnGreeting } = useMascot();
  const { colors: appColors } = useAppTheme();

  const translateY = useRef(new Animated.Value(-20)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (showReturnGreeting) {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.spring(translateY, {
          toValue: 0,
          friction: 6,
          tension: 60,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [showReturnGreeting, opacity, translateY]);

  if (!showReturnGreeting) return null;

  const handleDismiss = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: -15,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(() => {
      dismissReturnGreeting();
      if (onDismiss) onDismiss();
    });
  };

  const getGreetingContent = () => {
    switch (returnGreeting) {
      case 'crying':
        return {
          title: "Welcome back!",
          body: "It's so good to see you again. Ready to fetch high-res media?",
          badge: 'Missed you',
          state: 'crying' as const,
        };
      case 'sad':
        return {
          title: 'Hey there friend!',
          body: "AnyFetch has been keeping your cache ready. Let's grab some links!",
          badge: 'Ready to help',
          state: 'sad' as const,
        };
      case 'sleepy':
      default:
        return {
          title: '*Yawn…* Welcome back!',
          body: 'Your companion is waking up and ready to download.',
          badge: 'Waking up',
          state: 'sleepy' as const,
        };
    }
  };

  const content = getGreetingContent();

  return (
    <Animated.View
      style={[
        s.container,
        {
          opacity,
          transform: [{ translateY }],
        },
      ]}
    >
      <View style={s.card}>
        {/* Companion Avatar */}
        <Mascot state={content.state} size={54} animated showBadgeFrame={true} />

        <View style={s.textCol}>
          <View style={s.headerRow}>
            <Text style={s.title}>{content.title}</Text>
            <View style={[s.badgePill, { borderColor: `${appColors.accent}44` }]}>
              <Text style={[s.badgeText, { color: appColors.accent }]}>{content.badge}</Text>
            </View>
          </View>
          <Text style={s.body}>{content.body}</Text>
        </View>

        {/* Dismiss Button */}
        <Pressable
          onPress={handleDismiss}
          style={s.dismissBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityLabel="Dismiss return greeting"
        >
          <CloseCircle size={20} color="#71717A" />
        </Pressable>
      </View>
    </Animated.View>
  );
};

export default MascotGreetingCard;

const s = StyleSheet.create({
  container: {
    width: '100%',
    paddingHorizontal: 20,
    marginBottom: 14,
    zIndex: 50,
  },
  card: {
    backgroundColor: '#121215',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 10,
  },
  textCol: {
    flex: 1,
    gap: 3,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontFamily: FONTS.display,
    fontSize: 15,
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  badgePill: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
    borderWidth: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  badgeText: {
    fontFamily: FONTS.sans,
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  body: {
    fontFamily: FONTS.sans,
    fontSize: 12,
    color: '#A1A1AA',
    lineHeight: 16,
  },
  dismissBtn: {
    padding: 4,
    alignSelf: 'flex-start',
  },
});
