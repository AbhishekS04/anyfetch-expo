/**
 * WhatsNewScreen.tsx — Full-Screen What's New & Release Highlights Experience
 *
 * Dedicated onboarding route displayed immediately after installing qualifying major releases.
 * Features customizable release highlights, dark glassmorphism theme, and hold-to-continue completion.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  BackHandler,
  Dimensions,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import {
  Compass,
  InfoCircle,
  Cpu,
  ShieldSecurity,
  Sparkles,
  Flash,
  Download,
} from 'reicon-react-native';
import * as Haptics from 'expo-haptics';

import { FONTS } from '../theme/typography';
import { useAppTheme } from '../theme/ThemeContext';
import {
  ReleaseConfig,
  ReleaseHighlight,
  getReleaseConfigForVersion,
} from '../config/releaseNotes';
import {
  getInstalledApplicationVersion,
  acknowledgeReleaseVersion,
} from '../services/whatsNewService';
import HoldToContinueButton from '../components/common/HoldToContinueButton';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function WhatsNewScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { colors: themeColors } = useAppTheme();

  const installedVersion = getInstalledApplicationVersion();
  const isBeta = installedVersion.toLowerCase().includes('beta');

  // Load configured release notes for this version
  const [releaseConfig, setReleaseConfig] = useState<ReleaseConfig>(() => {
    return (
      getReleaseConfigForVersion(installedVersion) || {
        version: installedVersion,
        title: 'A New AnyFetch Experience',
        subtitle: "We've improved performance and redesigned core interactions.",
        requireWhatsNew: true,
        highlights: [],
      }
    );
  });

  const isAcknowledgingRef = useRef(false);

  // Entrance animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(24)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 320,
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        stiffness: 260,
        damping: 24,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  // Prevent accidental dismissal through Android Back button
  useEffect(() => {
    const handleBackPress = () => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      return true; // Consume event to prevent back-navigation bypass
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', handleBackPress);
    return () => sub.remove();
  }, []);

  const handleHoldComplete = async () => {
    if (isAcknowledgingRef.current) return;
    isAcknowledgingRef.current = true;

    try {
      await acknowledgeReleaseVersion(installedVersion);
    } catch (err) {
      console.warn('[WhatsNewScreen] Error acknowledging release:', err);
    }

    // Reset root navigation stack so Home becomes the permanent root
    navigation.reset({
      index: 0,
      routes: [{ name: 'Home' }],
    });
  };

  const accentColor = themeColors.accent || '#FF9F0A';

  const renderHighlightIcon = (iconName?: string) => {
    switch (iconName) {
      case 'compass':
        return <Compass size={20} color={accentColor} />;
      case 'info':
        return <InfoCircle size={20} color={accentColor} />;
      case 'cpu':
        return <Cpu size={20} color={accentColor} />;
      case 'shield':
        return <ShieldSecurity size={20} color={accentColor} />;
      case 'flash':
        return <Flash size={20} color={accentColor} />;
      case 'download':
        return <Download size={20} color={accentColor} />;
      default:
        return <Sparkles size={20} color={accentColor} />;
    }
  };

  return (
    <View style={s.container}>
      <Animated.View
        style={[
          s.innerContainer,
          {
            paddingTop: Math.max(insets.top + 16, 32),
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        <ScrollView
          style={s.scrollView}
          contentContainerStyle={[
            s.scrollContent,
            { paddingBottom: insets.bottom + 96 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* ── TOP BRAND HERO ── */}
          <View style={s.heroSection}>
            <View style={[s.iconBox, { borderColor: `${accentColor}40` }]}>
              <Image
                source={require('../../logo/mainlogo.png')}
                style={s.appLogo}
                resizeMode="contain"
              />
            </View>

            <View style={s.badgeRow}>
              <View style={[s.versionPill, { borderColor: `${accentColor}33` }]}>
                <View style={[s.pulseDot, { backgroundColor: accentColor }]} />
                <Text style={[s.versionText, { color: accentColor }]}>
                  v{installedVersion}
                </Text>
              </View>

              {isBeta && (
                <View style={[s.betaPill, { backgroundColor: `${accentColor}22` }]}>
                  <Text style={[s.betaText, { color: accentColor }]}>BETA</Text>
                </View>
              )}
            </View>

            <Text style={s.headline}>{releaseConfig.title}</Text>
            <Text style={s.subtitle}>{releaseConfig.subtitle}</Text>
          </View>

          {/* ── RELEASE HIGHLIGHTS ── */}
          <View style={s.highlightsList}>
            {releaseConfig.highlights.map((item: ReleaseHighlight) => (
              <View key={item.id} style={s.highlightCard}>
                <View style={[s.highlightIconWrapper, { backgroundColor: `${accentColor}18` }]}>
                  {renderHighlightIcon(item.icon)}
                </View>
                <View style={s.highlightTextCol}>
                  <Text style={s.highlightTitle}>{item.title}</Text>
                  <Text style={s.highlightDesc}>{item.description}</Text>
                </View>
              </View>
            ))}
          </View>
        </ScrollView>

        {/* ── FIXED BOTTOM ACTION DOCK ── */}
        <View
          style={[
            s.bottomDock,
            {
              paddingBottom: Math.max(insets.bottom + 12, 20),
            },
          ]}
        >
          <HoldToContinueButton
            label="Hold to Continue"
            accentColor={accentColor}
            durationMs={1200}
            onComplete={handleHoldComplete}
          />
          <Text style={s.dockHint}>Press and hold to acknowledge release & enter</Text>
        </View>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  innerContainer: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 22,
    alignItems: 'center',
  },
  heroSection: {
    alignItems: 'center',
    marginBottom: 24,
    width: '100%',
    maxWidth: 420,
  },
  iconBox: {
    width: 76,
    height: 76,
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1.5,
    marginBottom: 14,
    backgroundColor: '#09090b',
    shadowColor: '#FF9F0A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  appLogo: {
    width: '100%',
    height: '100%',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  versionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  versionText: {
    fontFamily: FONTS.sans,
    fontSize: 12.5,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  betaPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  betaText: {
    fontFamily: FONTS.sans,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  headline: {
    fontFamily: FONTS.display,
    color: '#FFFFFF',
    fontSize: 26,
    letterSpacing: -0.5,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: FONTS.sans,
    color: '#A1A1AA',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  highlightsList: {
    width: '100%',
    maxWidth: 420,
    gap: 12,
  },
  highlightCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    backgroundColor: '#111114',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.07)',
  },
  highlightIconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  highlightTextCol: {
    flex: 1,
    gap: 3,
  },
  highlightTitle: {
    fontFamily: FONTS.sans,
    color: '#FFFFFF',
    fontSize: 14.5,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  highlightDesc: {
    fontFamily: FONTS.sans,
    color: '#94949E',
    fontSize: 12.5,
    lineHeight: 18,
  },
  bottomDock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 22,
    paddingTop: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.94)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  dockHint: {
    fontFamily: FONTS.sans,
    fontSize: 11,
    color: '#71717A',
    textAlign: 'center',
    marginTop: 8,
  },
});
