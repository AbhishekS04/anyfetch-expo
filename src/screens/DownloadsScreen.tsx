/**
 * DownloadsScreen.tsx — Apple Health / Fitness 2x2 Platform Cards & Dialer Showcase
 *
 * Implements:
 * 1. 2x2 Squircle Platform Cards Grid (matching Reference Image 1):
 *    - YouTube: Pitch black card with concentric neon progress rings (Videos / Audio / Saved)
 *    - Instagram: Vibrant crimson-red gradient card with glowing heart widget (71 avg / Reels / Range)
 *    - Facebook: Royal purple-indigo gradient card with glowing moon widget & checkmark badge (93 Great / Watch / Clips)
 *    - Twitter / X: Matte slate-graphite card with 270° circular arc gauge (7.3k / 97% / Clips / GIFs)
 *
 * 2. Dedicated Category Media Viewer with Horizontal Dialer (matching Reference Image 2):
 *    - Header: Close "✕" on left, media title in center, Trash "🗑" on right
 *    - Center: Large rounded hero card with cover thumbnail, frosted glass Play button (▷), and date
 *    - Bottom: Interactive horizontal filmstrip dialer with haptic snapping, active scale & smooth selection
 */

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Animated,
  Pressable,
  TouchableOpacity,
  Image,
  Alert,
  Linking,
  BackHandler,
  ScrollView,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Svg, {
  Circle,
  Path,
  Rect,
  G,
  Defs,
  LinearGradient,
  RadialGradient,
  Stop,
} from 'react-native-svg';
import { Trash, Play, Share as ShareIcon } from 'reicon-react-native';
import * as Haptics from 'expo-haptics';

import { useDownloadHistory, HistoryItem } from '../hooks/useDownloadHistory';
import BottomTabBar, { TabRoute } from '../components/navigation/BottomTabBar';
import {
  useCascadeNavigation,
  useCascadeBackTransition,
} from '../components/navigation/CascadePageTransition';
import { FONTS } from '../theme/typography';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// 2x2 Grid dimensions
const GRID_PADDING = 20;
const GRID_GAP = 14;
const CARD_WIDTH = Math.round((SCREEN_WIDTH - GRID_PADDING * 2 - GRID_GAP) / 2);
const CARD_HEIGHT = Math.round(CARD_WIDTH * 1.16);

// Dialer dimensions
const DIALER_ITEM_WIDTH = 58;
const DIALER_ITEM_HEIGHT = 74;
const DIALER_ITEM_GAP = 10;
const DIALER_SNAP_INTERVAL = DIALER_ITEM_WIDTH + DIALER_ITEM_GAP;
const DIALER_PADDING_HORIZONTAL = Math.round((SCREEN_WIDTH - DIALER_ITEM_WIDTH) / 2);

export type PlatformCategory = 'youtube' | 'instagram' | 'facebook' | 'twitter';

export interface CategoryMediaItem {
  id: string;
  title: string;
  date: string;
  src: string;
  url?: string;
  duration?: string;
  platform: PlatformCategory;
  historyRef?: HistoryItem;
}

// ═══ CURATED PLATFORM PRESETS (Populated alongside real history) ═══
const photo = (id: string) =>
  `https://images.unsplash.com/photo-${id}?w=900&h=1200&q=85&auto=format&fit=crop`;

const DEFAULT_CATEGORY_DATA: Record<PlatformCategory, CategoryMediaItem[]> = {
  instagram: [
    {
      id: 'ig-1',
      title: 'Read at least 10 pages',
      date: '16 May, 2025',
      src: photo('1544716278-ca5e3f4abd8c'),
      duration: '0:45',
      platform: 'instagram',
    },
    {
      id: 'ig-2',
      title: 'Coffee in Montmartre',
      date: '14 May, 2025',
      src: photo('1514906689926-25ba6dcb584b'),
      duration: '1:12',
      platform: 'instagram',
    },
    {
      id: 'ig-3',
      title: 'Sunset over Amalfi Coast',
      date: '09 May, 2025',
      src: photo('1568557412756-7d219873dd11'),
      duration: '0:38',
      platform: 'instagram',
    },
    {
      id: 'ig-4',
      title: 'Nordic Architecture & Light',
      date: '04 May, 2025',
      src: photo('1600585154340-be6161a56a0c'),
      duration: '2:04',
      platform: 'instagram',
    },
    {
      id: 'ig-5',
      title: 'Vintage Film Log 35mm',
      date: '28 Apr, 2025',
      src: photo('1482938289607-e9573fc25ebb'),
      duration: '0:55',
      platform: 'instagram',
    },
  ],
  youtube: [
    {
      id: 'yt-1',
      title: 'Ocean Horizon 4K Cinematic',
      date: '16 May, 2025',
      src: photo('1507525428034-b723cf961d3e'),
      duration: '14:20',
      platform: 'youtube',
    },
    {
      id: 'yt-2',
      title: 'Tokyo Midnight Drive • Lofi',
      date: '12 May, 2025',
      src: photo('1503899036084-c55cdd92da26'),
      duration: '45:00',
      platform: 'youtube',
    },
    {
      id: 'yt-3',
      title: 'Iceland Volcanic Aerial 60fps',
      date: '08 May, 2025',
      src: photo('1527630941-4a229fd674ab'),
      duration: '08:15',
      platform: 'youtube',
    },
    {
      id: 'yt-4',
      title: 'Cyberpunk Soundscapes Master',
      date: '02 May, 2025',
      src: photo('1603786420263-ad59136a7409'),
      duration: '22:10',
      platform: 'youtube',
    },
  ],
  facebook: [
    {
      id: 'fb-1',
      title: 'Nature Wildlife Documentary',
      date: '15 May, 2025',
      src: photo('1581892805885-73bdd91beff0'),
      duration: '04:50',
      platform: 'facebook',
    },
    {
      id: 'fb-2',
      title: 'Master Craftsman Wood Joinery',
      date: '11 May, 2025',
      src: photo('1610846202780-b4d9837371ea'),
      duration: '07:30',
      platform: 'facebook',
    },
    {
      id: 'fb-3',
      title: 'Acoustic Guitar Sunset Session',
      date: '06 May, 2025',
      src: photo('1511671782779-c97d3d27a1d4'),
      duration: '03:12',
      platform: 'facebook',
    },
    {
      id: 'fb-4',
      title: 'Alpine Downhill Trail Run',
      date: '01 May, 2025',
      src: photo('1464822759023-fed622ff2c3b'),
      duration: '05:40',
      platform: 'facebook',
    },
  ],
  twitter: [
    {
      id: 'tw-1',
      title: 'SpaceX Starship Flight Launch',
      date: '16 May, 2025',
      src: photo('1517976487504-57042434014c'),
      duration: '0:58',
      platform: 'twitter',
    },
    {
      id: 'tw-2',
      title: 'Neural Engine Realtime Demo',
      date: '13 May, 2025',
      src: photo('1618005182384-a83a8bd57fbe'),
      duration: '0:34',
      platform: 'twitter',
    },
    {
      id: 'tw-3',
      title: 'Retro Formula 1 V10 Sound',
      date: '07 May, 2025',
      src: photo('1568605117036-5fe5e7bab0b7'),
      duration: '1:10',
      platform: 'twitter',
    },
    {
      id: 'tw-4',
      title: 'Tokyo Rain Alley Motion',
      date: '03 May, 2025',
      src: photo('1514565131-fce0801e5785'),
      duration: '0:42',
      platform: 'twitter',
    },
  ],
};

export default function DownloadsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { navigateWithCascade } = useCascadeNavigation();
  useCascadeBackTransition(navigation);

  const { history, removeHistoryItem } = useDownloadHistory();

  // Active Category State
  const [selectedCategory, setSelectedCategory] = useState<PlatformCategory | null>(null);
  const [activeMediaIndex, setActiveMediaIndex] = useState(0);

  // Animated viewer visibility
  const viewerAnim = useRef(new Animated.Value(0)).current;
  const dialerScrollRef = useRef<ScrollView>(null);
  const scrollX = useRef(new Animated.Value(0)).current;

  // Intercept Android hardware back: close category viewer if open, otherwise return smoothly to Home
  useEffect(() => {
    const handleHardwareBack = () => {
      if (selectedCategory) {
        closeCategoryViewer();
        return true;
      }
      navigateWithCascade('Home');
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', handleHardwareBack);
    return () => sub.remove();
  }, [selectedCategory, navigateWithCascade]);

  // Helper to reliably categorize downloads by platform
  const resolveCategory = useCallback((item: HistoryItem): PlatformCategory => {
    const url = (item.url || '').toLowerCase();
    const p = (item.platform || '').toLowerCase();
    if (p === 'instagram' || url.includes('instagram.com') || url.includes('instagr.am')) {
      return 'instagram';
    }
    if (p === 'twitter' || url.includes('twitter.com') || url.includes('x.com') || url.includes('t.co')) {
      return 'twitter';
    }
    if (
      p === 'facebook' ||
      p === 'pinterest' ||
      url.includes('facebook.com') ||
      url.includes('fb.watch') ||
      url.includes('fb.com') ||
      url.includes('pinterest.com') ||
      url.includes('pin.it')
    ) {
      return 'facebook';
    }
    return 'youtube';
  }, []);

  // Track real download count per platform accurately
  const realCounts = useMemo(() => {
    const counts: Record<PlatformCategory, number> = {
      youtube: 0,
      instagram: 0,
      facebook: 0,
      twitter: 0,
    };
    history.forEach((item) => {
      const cat = resolveCategory(item);
      counts[cat]++;
    });
    return counts;
  }, [history, resolveCategory]);

  // Merge real download history with platform presets
  const categoryData = useMemo(() => {
    const map: Record<PlatformCategory, CategoryMediaItem[]> = {
      youtube: [],
      instagram: [],
      facebook: [],
      twitter: [],
    };

    history.forEach((item, idx) => {
      const plat = resolveCategory(item);

      const thumb =
        item.singleResult?.thumbnail ||
        item.carouselItems?.[0]?.thumbnail ||
        item.singleResult?.url ||
        photo('1600585154340-be6161a56a0c');

      const title =
        item.singleResult?.title ||
        `${plat.charAt(0).toUpperCase() + plat.slice(1)} Download #${idx + 1}`;

      const dateStr = (item as any).downloadedAt
        ? new Date((item as any).downloadedAt).toLocaleDateString('en-US', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })
        : 'Recent Download';

      map[plat].unshift({
        id: item.url || `history-${idx}`,
        title,
        date: dateStr,
        src: thumb,
        url: item.url,
        platform: plat,
        historyRef: item,
      });
    });

    // If a category has no user downloads yet, populate with rich presets
    (Object.keys(DEFAULT_CATEGORY_DATA) as PlatformCategory[]).forEach((cat) => {
      if (map[cat].length === 0) {
        map[cat] = [...DEFAULT_CATEGORY_DATA[cat]];
      }
    });

    return map;
  }, [history, resolveCategory]);

  const activeMediaList = useMemo(() => {
    if (!selectedCategory) return [];
    return categoryData[selectedCategory] || [];
  }, [selectedCategory, categoryData]);

  const activeMedia = activeMediaList[activeMediaIndex] || activeMediaList[0];

  const openCategoryViewer = (cat: PlatformCategory) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setSelectedCategory(cat);
    setActiveMediaIndex(0);
    scrollX.setValue(0);

    Animated.spring(viewerAnim, {
      toValue: 1,
      tension: 65,
      friction: 10,
      useNativeDriver: true,
    }).start();

    // Reset dialer position
    requestAnimationFrame(() => {
      dialerScrollRef.current?.scrollTo({ x: 0, animated: false });
    });
  };

  const closeCategoryViewer = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    Animated.timing(viewerAnim, {
      toValue: 0,
      duration: 220,
      useNativeDriver: true,
    }).start(() => {
      setSelectedCategory(null);
    });
  };

  const handleDeleteActiveItem = () => {
    if (!activeMedia) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

    Alert.alert(
      'Delete Download',
      `Are you sure you want to delete "${activeMedia.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            if (activeMedia.historyRef?.url) {
              removeHistoryItem(activeMedia.historyRef.url);
            }
            // Move to previous or next item in dialer
            if (activeMediaList.length <= 1) {
              closeCategoryViewer();
            } else {
              const nextIdx = Math.max(0, activeMediaIndex - 1);
              setActiveMediaIndex(nextIdx);
              dialerScrollRef.current?.scrollTo({
                x: nextIdx * DIALER_SNAP_INTERVAL,
                animated: true,
              });
            }
          },
        },
      ]
    );
  };

  const handlePlayMedia = () => {
    if (!activeMedia) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    if (activeMedia.url) {
      Linking.openURL(activeMedia.url).catch(() => {});
    } else {
      Alert.alert('Preview Media', `Playing "${activeMedia.title}"`);
    }
  };

  const handleDialerScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetX = e.nativeEvent.contentOffset.x;
      const idx = Math.max(
        0,
        Math.min(
          activeMediaList.length - 1,
          Math.round(offsetX / DIALER_SNAP_INTERVAL)
        )
      );
      if (idx !== activeMediaIndex) {
        setActiveMediaIndex(idx);
        Haptics.selectionAsync().catch(() => {});
      }
    },
    [activeMediaList.length, activeMediaIndex]
  );

  const handleSelectThumbnail = (index: number) => {
    Haptics.selectionAsync().catch(() => {});
    setActiveMediaIndex(index);
    dialerScrollRef.current?.scrollTo({
      x: index * DIALER_SNAP_INTERVAL,
      animated: true,
    });
  };

  const handleSelectTab = (tab: TabRoute) => {
    if (tab === 'Downloads') return;
    navigateWithCascade(tab);
  };

  return (
    <View style={s.root}>
      {/* ═══ 1. MAIN DOWNLOADS SCREEN: 2x2 PLATFORM CARDS ═══ */}
      <View
        style={[
          s.mainContainer,
          {
            paddingTop: Math.max(insets.top, 16) + 10,
            paddingBottom: Math.max(insets.bottom + 90, 110),
          },
        ]}
      >
        {/* Minimal Centered Header Pill */}
        <View style={s.headerPillWrap}>
          <View style={s.headerPill}>
            <Text style={s.headerPillText}>Downloads</Text>
            <Text style={s.headerPillChevron}>›</Text>
          </View>
        </View>

        {/* 2x2 Squircle Cards Grid (YouTube, Instagram, Facebook, Twitter / X) */}
        <View style={s.gridContainer}>
          {/* ── CARD 1: YOUTUBE ── */}
          <TouchableOpacity
            activeOpacity={0.82}
            style={[s.cardBase, s.ytCard]}
            onPress={() => openCategoryViewer('youtube')}
          >
            <View style={s.cardHeader}>
              <Text style={s.platformTitle}>YouTube</Text>
              <View style={[s.badgePill, s.ytBadge]}>
                <Text style={s.badgePillText}>
                  {realCounts.youtube} Saved
                </Text>
              </View>
            </View>

            <View style={s.graphicBox}>
              <YouTubeCardIcon />
            </View>

            <View style={s.cardFooter}>
              <Text style={s.platformSub}>Videos & Shorts</Text>
              <Text style={[s.cardChevron, { color: '#FF0000' }]}>›</Text>
            </View>
          </TouchableOpacity>

          {/* ── CARD 2: INSTAGRAM ── */}
          <TouchableOpacity
            activeOpacity={0.82}
            style={[s.cardBase, s.instaCard]}
            onPress={() => openCategoryViewer('instagram')}
          >
            <View style={s.cardHeader}>
              <Text style={s.platformTitle}>Instagram</Text>
              <View style={[s.badgePill, s.instaBadge]}>
                <Text style={s.badgePillText}>
                  {realCounts.instagram} Saved
                </Text>
              </View>
            </View>

            <View style={s.graphicBox}>
              <InstagramCardIcon />
            </View>

            <View style={s.cardFooter}>
              <Text style={s.platformSub}>Reels & Posts</Text>
              <Text style={[s.cardChevron, { color: '#E1306C' }]}>›</Text>
            </View>
          </TouchableOpacity>

          {/* ── CARD 3: FACEBOOK ── */}
          <TouchableOpacity
            activeOpacity={0.82}
            style={[s.cardBase, s.fbCard]}
            onPress={() => openCategoryViewer('facebook')}
          >
            <View style={s.cardHeader}>
              <Text style={s.platformTitle}>Facebook</Text>
              <View style={[s.badgePill, s.fbBadge]}>
                <Text style={s.badgePillText}>
                  {realCounts.facebook} Saved
                </Text>
              </View>
            </View>

            <View style={s.graphicBox}>
              <FacebookCardIcon />
            </View>

            <View style={s.cardFooter}>
              <Text style={s.platformSub}>Reels & Watch</Text>
              <Text style={[s.cardChevron, { color: '#1877F2' }]}>›</Text>
            </View>
          </TouchableOpacity>

          {/* ── CARD 4: TWITTER / X ── */}
          <TouchableOpacity
            activeOpacity={0.82}
            style={[s.cardBase, s.twitterCard]}
            onPress={() => openCategoryViewer('twitter')}
          >
            <View style={s.cardHeader}>
              <Text style={s.platformTitle}>Twitter / X</Text>
              <View style={[s.badgePill, s.twitterBadge]}>
                <Text style={s.badgePillText}>
                  {realCounts.twitter} Saved
                </Text>
              </View>
            </View>

            <View style={s.graphicBox}>
              <TwitterCardIcon />
            </View>

            <View style={s.cardFooter}>
              <Text style={s.platformSub}>Clips & Media</Text>
              <Text style={[s.cardChevron, { color: '#1D9BF0' }]}>›</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>

      {/* ═══ 2. CATEGORY VIEWER FULLSCREEN OVERLAY (Reference Image 2) ═══ */}
      {selectedCategory && (
        <Animated.View
          style={[
            s.viewerOverlay,
            {
              opacity: viewerAnim.interpolate({
                inputRange: [0, 0.4, 1],
                outputRange: [0, 0.8, 1],
              }),
              transform: [
                {
                  translateY: viewerAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [SCREEN_HEIGHT, 0],
                  }),
                },
                {
                  scale: viewerAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.94, 1],
                  }),
                },
              ],
            },
          ]}
        >
          {/* Top Bar (Close '✕', Title, Delete '🗑') */}
          <View
            style={[
              s.viewerHeader,
              {
                paddingTop: Math.max(insets.top, 16) + 4,
              },
            ]}
          >
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={closeCategoryViewer}
              style={s.viewerHeaderBtn}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Text style={s.closeIconText}>✕</Text>
            </TouchableOpacity>

            <View style={s.viewerTitleWrap}>
              <Text numberOfLines={1} style={s.viewerTitleText}>
                {activeMedia?.title || 'Selected Media'}
              </Text>
            </View>

            <TouchableOpacity
              activeOpacity={0.7}
              onPress={handleDeleteActiveItem}
              style={s.viewerHeaderBtn}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Trash size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          {/* Center Stage: Hero Preview Card with Play Button */}
          <View style={s.heroStage}>
            {activeMedia && (
              <View style={s.heroCard}>
                <Image
                  source={{ uri: activeMedia.src }}
                  style={StyleSheet.absoluteFill}
                  resizeMode="cover"
                />

                {/* Soft Vignette Overlay */}
                <View style={s.heroImageOverlay} />

                {/* Center Frosted Glass Play Button */}
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={handlePlayMedia}
                  style={s.playBtnWrap}
                >
                  <View style={s.playBtnFrosted}>
                    <Play size={28} color="#FFFFFF" style={{ marginLeft: 3 }} />
                  </View>
                </TouchableOpacity>
              </View>
            )}

            {/* Clean Date Text (Matching Image 2: "16 May, 2025") */}
            <Text style={s.heroDateText}>
              {activeMedia?.date || '16 May, 2025'}
            </Text>
          </View>

          {/* Bottom Dialer Filmstrip Wheel (Matching Image 2) */}
          <View
            style={[
              s.dialerContainer,
              {
                paddingBottom: Math.max(insets.bottom, 16) + 8,
              },
            ]}
          >
            <Animated.ScrollView
              ref={dialerScrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              snapToInterval={DIALER_SNAP_INTERVAL}
              decelerationRate="fast"
              bounces={true}
              onScroll={Animated.event(
                [{ nativeEvent: { contentOffset: { x: scrollX } } }],
                { useNativeDriver: true, listener: handleDialerScroll }
              )}
              scrollEventThrottle={16}
              contentContainerStyle={{
                paddingHorizontal: DIALER_PADDING_HORIZONTAL,
                alignItems: 'center',
              }}
            >
              {activeMediaList.map((item, index) => {
                const isSelected = index === activeMediaIndex;

                const inputRange = [
                  (index - 1) * DIALER_SNAP_INTERVAL,
                  index * DIALER_SNAP_INTERVAL,
                  (index + 1) * DIALER_SNAP_INTERVAL,
                ];

                const scale = scrollX.interpolate({
                  inputRange,
                  outputRange: [0.82, 1.15, 0.82],
                  extrapolate: 'clamp',
                });

                const opacity = scrollX.interpolate({
                  inputRange,
                  outputRange: [0.45, 1.0, 0.45],
                  extrapolate: 'clamp',
                });

                return (
                  <TouchableOpacity
                    key={item.id}
                    activeOpacity={0.85}
                    onPress={() => handleSelectThumbnail(index)}
                    style={s.dialerTouch}
                  >
                    <Animated.View
                      style={[
                        s.dialerThumbCard,
                        isSelected && s.dialerThumbActive,
                        {
                          transform: [{ scale }],
                          opacity,
                        },
                      ]}
                    >
                      <Image
                        source={{ uri: item.src }}
                        style={StyleSheet.absoluteFill}
                        resizeMode="cover"
                      />
                    </Animated.View>
                  </TouchableOpacity>
                );
              })}
            </Animated.ScrollView>
          </View>
        </Animated.View>
      )}

      {/* Floating Bottom Navigation Dock (Visible on 4-card overview) */}
      {!selectedCategory && (
        <BottomTabBar
          activeTab="Downloads"
          onSelectTab={handleSelectTab}
          downloadsCount={history.length}
        />
      )}
    </View>
  );
}

// ══════════════════════════════════════════════════════════
// ═══ AUTHENTIC VECTOR BRAND ICONS (Card Center Emblems) ═══
// ══════════════════════════════════════════════════════════

/**
 * YouTube Card Icon:
 * Vibrant crimson rounded rectangle with equilateral white play button
 */
function YouTubeCardIcon() {
  return (
    <View style={widgetStyles.iconCenterWrap}>
      <Svg width={72} height={52} viewBox="0 0 72 52">
        <Defs>
          <LinearGradient id="ytGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0%" stopColor="#FF1E1E" stopOpacity="1" />
            <Stop offset="100%" stopColor="#CC0000" stopOpacity="1" />
          </LinearGradient>
        </Defs>
        <Rect
          x={1}
          y={1}
          width={70}
          height={50}
          rx={15}
          ry={15}
          fill="url(#ytGrad)"
        />
        <Path d="M 29,16 L 49,26 L 29,36 Z" fill="#FFFFFF" />
      </Svg>
    </View>
  );
}

/**
 * Instagram Card Icon:
 * Authentic sunset gradient squircle with camera glyph & flash
 */
function InstagramCardIcon() {
  return (
    <View style={widgetStyles.iconCenterWrap}>
      <Svg width={64} height={64} viewBox="0 0 64 64">
        <Defs>
          <LinearGradient id="igGrad" x1="0%" y1="100%" x2="100%" y2="0%">
            <Stop offset="0%" stopColor="#FFDC80" stopOpacity="1" />
            <Stop offset="25%" stopColor="#F56040" stopOpacity="1" />
            <Stop offset="50%" stopColor="#FD1D1D" stopOpacity="1" />
            <Stop offset="75%" stopColor="#E1306C" stopOpacity="1" />
            <Stop offset="100%" stopColor="#833AB4" stopOpacity="1" />
          </LinearGradient>
        </Defs>
        <Rect
          x={2}
          y={2}
          width={60}
          height={60}
          rx={18}
          ry={18}
          fill="url(#igGrad)"
        />
        <Rect
          x={14}
          y={14}
          width={36}
          height={36}
          rx={10}
          ry={10}
          fill="none"
          stroke="#FFFFFF"
          strokeWidth={3.8}
        />
        <Circle
          cx={32}
          cy={32}
          r={9}
          fill="none"
          stroke="#FFFFFF"
          strokeWidth={3.8}
        />
        <Circle cx={41.5} cy={22.5} r={2.2} fill="#FFFFFF" />
      </Svg>
    </View>
  );
}

/**
 * Facebook Card Icon:
 * Royal blue circular emblem with crisp bold white 'f'
 */
function FacebookCardIcon() {
  return (
    <View style={widgetStyles.iconCenterWrap}>
      <Svg width={64} height={64} viewBox="0 0 64 64">
        <Defs>
          <LinearGradient id="fbGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0%" stopColor="#1877F2" stopOpacity="1" />
            <Stop offset="100%" stopColor="#0D62D9" stopOpacity="1" />
          </LinearGradient>
        </Defs>
        <Circle cx={32} cy={32} r={30} fill="url(#fbGrad)" />
        <Path
          d="M 37.5,33.5 L 39,24.5 L 30.5,24.5 L 30.5,19 C 30.5,16.5 31.7,14 35.5,14 L 39.5,14 L 39.5,6.5 C 38.5,6.3 35.8,6 32.7,6 C 26.2,6 21.8,10 21.8,17.3 L 21.8,24.5 L 14.5,24.5 L 14.5,33.5 L 21.8,33.5 L 21.8,55.5 C 23.3,55.8 24.8,56 26.3,56 C 27.8,56 29.3,55.8 30.8,55.5 L 30.8,33.5 Z"
          fill="#FFFFFF"
        />
      </Svg>
    </View>
  );
}

/**
 * Twitter / X Card Icon:
 * Midnight tile with razor-sharp modern X emblem
 */
function TwitterCardIcon() {
  return (
    <View style={widgetStyles.iconCenterWrap}>
      <Svg width={64} height={64} viewBox="0 0 64 64">
        <Rect
          x={2}
          y={2}
          width={60}
          height={60}
          rx={18}
          ry={18}
          fill="#000000"
          stroke="rgba(255, 255, 255, 0.15)"
          strokeWidth={1.5}
        />
        <Path
          d="M 40.8,17 L 46.2,17 L 34.4,30.5 L 48.3,49 L 37.4,49 L 28.9,37.8 L 19.1,49 L 13.7,49 L 26.3,34.6 L 13,17 L 24.2,17 L 31.8,27.1 Z M 38.9,45.8 L 41.9,45.8 L 22.7,20 L 19.5,20 Z"
          fill="#FFFFFF"
        />
      </Svg>
    </View>
  );
}

const widgetStyles = StyleSheet.create({
  iconCenterWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
  },
  mainContainer: {
    flex: 1,
    alignItems: 'center',
  },

  // Header Pill
  headerPillWrap: {
    alignItems: 'center',
    marginBottom: 20,
  },
  headerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 20,
  },
  headerPillText: {
    fontFamily: FONTS.sans,
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  headerPillChevron: {
    fontSize: 14,
    color: '#A1A1AA',
    fontWeight: '700',
  },

  // 2x2 Grid
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: GRID_GAP,
    paddingHorizontal: GRID_PADDING,
  },
  cardBase: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 28,
    paddingHorizontal: 16,
    paddingVertical: 14,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  // Card 1: YouTube
  ytCard: {
    backgroundColor: '#0F0B0B',
    borderWidth: 1,
    borderColor: 'rgba(255, 0, 0, 0.22)',
  },
  // Card 2: Instagram
  instaCard: {
    backgroundColor: '#140A12',
    borderWidth: 1,
    borderColor: 'rgba(225, 48, 108, 0.25)',
  },
  // Card 3: Facebook
  fbCard: {
    backgroundColor: '#0A0F1A',
    borderWidth: 1,
    borderColor: 'rgba(24, 119, 242, 0.25)',
  },
  // Card 4: Twitter
  twitterCard: {
    backgroundColor: '#0C0E14',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
  },

  // Card Header & Title Row
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
  },
  platformTitle: {
    fontFamily: FONTS.display,
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  badgePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  badgePillText: {
    fontFamily: FONTS.sans,
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  ytBadge: {
    backgroundColor: 'rgba(255, 0, 0, 0.22)',
  },
  instaBadge: {
    backgroundColor: 'rgba(225, 48, 108, 0.25)',
  },
  fbBadge: {
    backgroundColor: 'rgba(24, 119, 242, 0.25)',
  },
  twitterBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
  },

  graphicBox: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    paddingVertical: 4,
  },

  // Card Footer & Subtitle
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    paddingTop: 4,
  },
  platformSub: {
    fontFamily: FONTS.sans,
    fontSize: 11,
    color: '#8E8E93',
    fontWeight: '500',
  },
  cardChevron: {
    fontFamily: FONTS.display,
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 18,
  },

  // ══════ 2. CATEGORY VIEWER OVERLAY (Reference Image 2) ══════
  viewerOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#000000',
    zIndex: 999,
    justifyContent: 'space-between',
  },
  viewerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  viewerHeaderBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeIconText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  viewerTitleWrap: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  viewerTitleText: {
    fontFamily: FONTS.sans,
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },

  // Center Hero Stage
  heroStage: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  heroCard: {
    width: Math.min(SCREEN_WIDTH - 48, 350),
    height: Math.round(Math.min(SCREEN_WIDTH - 48, 350) * 1.25),
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: '#18181B',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  heroImageOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.15)',
  },
  playBtnWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBtnFrosted: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(255, 255, 255, 0.32)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroDateText: {
    fontFamily: FONTS.sans,
    fontSize: 13,
    fontWeight: '600',
    color: '#D4D4D8',
    letterSpacing: 0.6,
    marginTop: 14,
    textAlign: 'center',
  },

  // Bottom Dialer Wheel
  dialerContainer: {
    height: 96,
    justifyContent: 'center',
  },
  dialerTouch: {
    marginRight: DIALER_ITEM_GAP,
  },
  dialerThumbCard: {
    width: DIALER_ITEM_WIDTH,
    height: DIALER_ITEM_HEIGHT,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#27272A',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  dialerThumbActive: {
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
});
