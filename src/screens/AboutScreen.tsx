/**
 * AboutScreen.tsx — Dedicated About & Developer Showcase Page
 *
 * Replaces the old popup modal with a full-fledged dedicated page:
 * - App identity, core privacy principles & 100% on-device engine info
 * - Supported platforms (YouTube, Instagram, X, Pinterest, TikTok, Reddit, etc.)
 * - Step-by-step usage guide
 * - Interactive GitHub & Twitter developer showcase cards (Abhishek Singh)
 * - Open source license, architecture specs, and external project links
 * - Integrated FluidTabs bottom dock navigation
 */

import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TouchableOpacity,
  Linking,
  Share,
  Platform,
  BackHandler,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import {
  ChevronLeft,
  ArrowUpRight,
  Share as ShareIcon,
  ShieldTick,
  Cpu,
  Code,
  InfoCircle,
  DirectRight,
  Heart,
} from 'reicon-react-native';
import * as Haptics from 'expo-haptics';

import { useAppTheme } from '../theme/ThemeContext';
import { FONTS } from '../theme/typography';
import { useDownloadHistory } from '../hooks/useDownloadHistory';
import BottomTabBar, { TabRoute } from '../components/navigation/BottomTabBar';
import {
  useCascadeNavigation,
  useCascadeBackTransition,
} from '../components/navigation/CascadePageTransition';
import GithubCard from '../components/common/GithubCard';
import TwitterCard from '../components/common/TwitterCard';

const APP_VERSION = '1.1.1';
const GITHUB_REPO = 'AbhishekS04/anyfetch-expo';
const GITHUB_URL = `https://github.com/${GITHUB_REPO}`;
const TWITTER_URL = 'https://x.com/abhi3hekk';

export default function AboutScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { colors: appColors } = useAppTheme();
  const { navigateWithCascade } = useCascadeNavigation();
  useCascadeBackTransition(navigation);

  const { history } = useDownloadHistory();

  useEffect(() => {
    const handleHardwareBack = () => {
      navigateWithCascade('Home');
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', handleHardwareBack);
    return () => sub.remove();
  }, [navigateWithCascade]);

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    navigateWithCascade('Home');
  };

  const handleShareApp = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    Share.share({
      title: 'AnyFetch — Universal Media Downloader',
      message: `Check out AnyFetch, a private, 100% on-device universal media downloader for Android & iOS:\n${GITHUB_URL}`,
    }).catch(() => {});
  };

  const handleOpenLink = (url: string) => {
    Haptics.selectionAsync().catch(() => {});
    Linking.openURL(url).catch(() => {});
  };

  const handleSelectTab = (tab: TabRoute) => {
    if (tab === 'About') return;
    navigateWithCascade(tab);
  };

  return (
    <View style={s.root}>
      {/* ═══ TOP APP BAR ═══ */}
      <View
        style={[
          s.header,
          {
            paddingTop: Math.max(insets.top, 16) + 4,
          },
        ]}
      >
        <TouchableOpacity
          style={s.headerBtn}
          onPress={handleBack}
          activeOpacity={0.7}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <ChevronLeft size={22} color="#FFFFFF" />
        </TouchableOpacity>

        <View style={s.headerTitleWrap}>
          <Text style={s.headerTitle}>ABOUT</Text>
        </View>

        <TouchableOpacity
          style={s.headerBtn}
          onPress={handleShareApp}
          activeOpacity={0.7}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <ShareIcon size={19} color="#A1A1AA" />
        </TouchableOpacity>
      </View>

      {/* ═══ SCROLLABLE BODY ═══ */}
      <ScrollView
        style={s.scrollView}
        contentContainerStyle={[
          s.scrollContent,
          {
            paddingBottom: Math.max(insets.bottom + 110, 120),
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── 1. HERO IDENTITY ── */}
        <View style={s.heroCard}>
          <View style={[s.heroBadge, { borderColor: `${appColors.accent}44` }]}>
            <View style={[s.heroDot, { backgroundColor: appColors.accent }]} />
            <Text style={s.heroBadgeText}>ANYFETCH</Text>
          </View>

          <Text style={s.heroTitle}>Universal Media Downloader</Text>
          <Text style={s.heroTagline}>
            Download high-res videos, audio, and images directly to your gallery
            without third-party trackers or servers.
          </Text>

          <View style={s.metaPillRow}>
            <View style={s.metaPill}>
              <Text style={s.metaPillText}>v{APP_VERSION}</Text>
            </View>
            <View style={s.metaPill}>
              <Text style={s.metaPillText}>100% Local</Text>
            </View>
            <View style={s.metaPill}>
              <Text style={s.metaPillText}>Open Source</Text>
            </View>
          </View>
        </View>

        {/* ── 2. PRIVACY FIRST ARCHITECTURE ── */}
        <View style={s.sectionHeader}>
          <ShieldTick size={15} color={appColors.accent} />
          <Text style={s.sectionTitle}>PRIVACY & ARCHITECTURE</Text>
        </View>
        <View style={s.card}>
          <View style={s.featureRow}>
            <View style={[s.iconBox, { backgroundColor: `${appColors.accent}18` }]}>
              <Cpu size={18} color={appColors.accent} />
            </View>
            <View style={s.featureTextWrap}>
              <Text style={s.featureTitle}>100% On-Device Processing</Text>
              <Text style={s.featureDesc}>
                All link parsing, stream extraction, and media downloads occur
                entirely on your device. No remote proxy servers inspect your links.
              </Text>
            </View>
          </View>

          <View style={s.cardDivider} />

          <View style={s.featureRow}>
            <View style={[s.iconBox, { backgroundColor: 'rgba(255, 255, 255, 0.08)' }]}>
              <ShieldTick size={18} color="#FFFFFF" />
            </View>
            <View style={s.featureTextWrap}>
              <Text style={s.featureTitle}>Zero Telemetry & Zero Ads</Text>
              <Text style={s.featureDesc}>
                No analytics trackers, no tracking SDKs, no behavioral cookies, and
                zero ad banners. Your downloads stay completely private.
              </Text>
            </View>
          </View>
        </View>

        {/* ── 3. SUPPORTED PLATFORMS ── */}
        <View style={s.sectionHeader}>
          <DirectRight size={15} color={appColors.accent} />
          <Text style={s.sectionTitle}>SUPPORTED PLATFORMS</Text>
        </View>
        <View style={s.card}>
          <Text style={s.cardIntro}>
            Extract single videos, audio tracks, and multi-image carousel albums at full native quality:
          </Text>
          <View style={s.platformGrid}>
            {[
              { name: 'YouTube', type: 'Videos & Audio' },
              { name: 'Instagram', type: 'Reels, Posts & Carousels' },
              { name: 'X / Twitter', type: 'Videos & GIFs' },
              { name: 'Pinterest', type: 'Pins & Videos' },
              { name: 'TikTok', type: 'Watermark-Free' },
              { name: 'Reddit', type: 'Videos with Sound' },
            ].map((p) => (
              <View key={p.name} style={s.platformChip}>
                <Text style={s.platformName}>{p.name}</Text>
                <Text style={s.platformType}>{p.type}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── 4. HOW IT WORKS ── */}
        <View style={s.sectionHeader}>
          <InfoCircle size={15} color={appColors.accent} />
          <Text style={s.sectionTitle}>HOW TO USE</Text>
        </View>
        <View style={s.card}>
          {[
            {
              step: '1',
              title: 'Copy any supported link',
              desc: 'Copy a video or image link from YouTube, Instagram, X, TikTok, etc.',
            },
            {
              step: '2',
              title: 'Open AnyFetch',
              desc: 'AnyFetch automatically detects copied links and pastes them into the fetch box.',
            },
            {
              step: '3',
              title: 'Tap Fetch to preview',
              desc: 'Inspect media thumbnail, author, duration, and download in your desired quality.',
            },
            {
              step: '4',
              title: 'Save to Gallery',
              desc: 'Files are saved straight to your Pictures/Movies folder or custom directory.',
            },
          ].map((item, idx, arr) => (
            <React.Fragment key={item.step}>
              <View style={s.stepRow}>
                <View style={[s.stepBadge, { backgroundColor: `${appColors.accent}20` }]}>
                  <Text style={[s.stepNum, { color: appColors.accent }]}>{item.step}</Text>
                </View>
                <View style={s.stepTextWrap}>
                  <Text style={s.stepTitle}>{item.title}</Text>
                  <Text style={s.stepDesc}>{item.desc}</Text>
                </View>
              </View>
              {idx < arr.length - 1 && <View style={s.cardDivider} />}
            </React.Fragment>
          ))}
        </View>

        {/* ── 5. CREATOR & DEVELOPER SHOWCASE ── */}
        <View style={s.sectionHeader}>
          <Heart size={15} color="#FF6B6B" />
          <Text style={s.sectionTitle}>CREATED BY</Text>
        </View>
        <Text style={s.devSubtitle}>
          Designed and engineered by Abhishek Singh. Follow on X and star on GitHub:
        </Text>

        {/* Twitter Developer Card */}
        <View style={s.devCardWrap}>
          <TwitterCard
            username="abhi3hekk"
            name="Abhishek Singh"
            staticCard={true}
            style={s.socialCard}
          />
        </View>

        {/* GitHub Developer Card */}
        <View style={s.devCardWrap}>
          <GithubCard
            username="AbhishekS04"
            name="Abhishek Singh"
            style={s.socialCard}
          />
        </View>

        {/* ── 6. PROJECT SPECS & SYSTEM INFO ── */}
        <View style={s.sectionHeader}>
          <Code size={15} color={appColors.accent} />
          <Text style={s.sectionTitle}>SYSTEM SPECIFICATIONS</Text>
        </View>
        <View style={s.card}>
          <SpecRow label="Application" value="AnyFetch Mobile" />
          <View style={s.cardDivider} />
          <SpecRow label="Version" value={`v${APP_VERSION}`} />
          <View style={s.cardDivider} />
          <SpecRow label="Runtime" value="Expo SDK 52 • React Native 0.76" />
          <View style={s.cardDivider} />
          <SpecRow label="Graphics Engine" value="React Native Skia (GPU Shaders)" />
          <View style={s.cardDivider} />
          <SpecRow label="Storage Architecture" value="Scoped Storage & SAF (Android)" />
          <View style={s.cardDivider} />
          <SpecRow label="License" value="MIT Open Source License" />
        </View>

        {/* ── 7. EXTERNAL LINKS ── */}
        <View style={s.linksCard}>
          <TouchableOpacity
            style={s.linkRow}
            activeOpacity={0.7}
            onPress={() => handleOpenLink(GITHUB_URL)}
          >
            <View style={s.linkLeft}>
              <Code size={16} color="#FFFFFF" />
              <Text style={s.linkTitle}>GitHub Repository</Text>
            </View>
            <ArrowUpRight size={15} color="#71717A" />
          </TouchableOpacity>

          <View style={s.cardDivider} />

          <TouchableOpacity
            style={s.linkRow}
            activeOpacity={0.7}
            onPress={() => handleOpenLink(`${GITHUB_URL}/issues`)}
          >
            <View style={s.linkLeft}>
              <InfoCircle size={16} color="#FFFFFF" />
              <Text style={s.linkTitle}>Report an Issue / Feedback</Text>
            </View>
            <ArrowUpRight size={15} color="#71717A" />
          </TouchableOpacity>

          <View style={s.cardDivider} />

          <TouchableOpacity
            style={s.linkRow}
            activeOpacity={0.7}
            onPress={() => handleOpenLink(TWITTER_URL)}
          >
            <View style={s.linkLeft}>
              <ShareIcon size={16} color="#FFFFFF" />
              <Text style={s.linkTitle}>Connect on X (@abhi3hekk)</Text>
            </View>
            <ArrowUpRight size={15} color="#71717A" />
          </TouchableOpacity>
        </View>

        {/* ── FOOTER NOTE ── */}
        <Text style={s.footerText}>
          Crafted with care • Free and Open Source forever.
        </Text>
      </ScrollView>

      {/* ═══ BOTTOM TAB BAR DOCK ═══ */}
      <BottomTabBar
        activeTab="About"
        onSelectTab={handleSelectTab}
        downloadsCount={history.length}
      />
    </View>
  );
}

function SpecRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.specRow}>
      <Text style={s.specLabel}>{label}</Text>
      <Text style={s.specValue}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#18181B',
    backgroundColor: '#000000',
    zIndex: 10,
  },
  headerBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  btnPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.95 }],
  },
  headerTitleWrap: {
    alignItems: 'center',
  },
  headerTitle: {
    fontFamily: FONTS.sans,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 2,
    color: '#FFFFFF',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  heroCard: {
    backgroundColor: '#0E0E11',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#222227',
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 100,
    marginBottom: 14,
  },
  heroDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  heroBadgeText: {
    fontFamily: FONTS.sans,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.8,
    color: '#FFFFFF',
  },
  heroTitle: {
    fontFamily: FONTS.display,
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 8,
  },
  heroTagline: {
    fontFamily: FONTS.sans,
    fontSize: 13,
    color: '#A1A1AA',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 18,
    maxWidth: 320,
  },
  metaPillRow: {
    flexDirection: 'row',
    gap: 8,
  },
  metaPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  metaPillText: {
    fontFamily: FONTS.sans,
    fontSize: 11,
    fontWeight: '600',
    color: '#D4D4D8',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
    marginTop: 8,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    fontFamily: FONTS.sans,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.4,
    color: '#71717A',
  },
  devSubtitle: {
    fontFamily: FONTS.sans,
    fontSize: 13,
    color: '#A1A1AA',
    marginBottom: 14,
    paddingHorizontal: 4,
    lineHeight: 18,
  },
  devCardWrap: {
    marginBottom: 16,
  },
  socialCard: {
    width: '100%',
  },
  card: {
    backgroundColor: '#0E0E11',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#1F1F24',
    padding: 18,
    marginBottom: 24,
  },
  cardIntro: {
    fontFamily: FONTS.sans,
    fontSize: 13,
    color: '#A1A1AA',
    lineHeight: 19,
    marginBottom: 14,
  },
  cardDivider: {
    height: 1,
    backgroundColor: '#1C1C21',
    marginVertical: 14,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureTextWrap: {
    flex: 1,
  },
  featureTitle: {
    fontFamily: FONTS.sans,
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  featureDesc: {
    fontFamily: FONTS.sans,
    fontSize: 12,
    color: '#8E8E93',
    lineHeight: 18,
  },
  platformGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  platformChip: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    width: '48%',
  },
  platformName: {
    fontFamily: FONTS.sans,
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  platformType: {
    fontFamily: FONTS.sans,
    fontSize: 11,
    color: '#71717A',
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  stepBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNum: {
    fontFamily: FONTS.sans,
    fontSize: 13,
    fontWeight: '700',
  },
  stepTextWrap: {
    flex: 1,
  },
  stepTitle: {
    fontFamily: FONTS.sans,
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 3,
  },
  stepDesc: {
    fontFamily: FONTS.sans,
    fontSize: 12,
    color: '#8E8E93',
    lineHeight: 17,
  },
  specRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 3,
  },
  specLabel: {
    fontFamily: FONTS.sans,
    fontSize: 13,
    color: '#8E8E93',
  },
  specValue: {
    fontFamily: FONTS.sans,
    fontSize: 13,
    fontWeight: '500',
    color: '#FFFFFF',
  },
  linksCard: {
    backgroundColor: '#0E0E11',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#1F1F24',
    padding: 16,
    marginBottom: 20,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  rowPressed: {
    opacity: 0.6,
  },
  linkLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  linkTitle: {
    fontFamily: FONTS.sans,
    fontSize: 13,
    fontWeight: '600',
    color: '#E4E4E7',
  },
  footerText: {
    fontFamily: FONTS.sans,
    fontSize: 12,
    color: '#52525B',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
});
