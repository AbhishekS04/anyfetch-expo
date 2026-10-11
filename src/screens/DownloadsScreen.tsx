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
  Linking,
  BackHandler,
  ScrollView,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Platform,
  ActivityIndicator,
  PanResponder,
  Easing,
} from 'react-native';
import { customAlert as Alert } from '../components/common/CustomAlert';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useVideoPlayer, VideoView } from 'expo-video';
import {
  documentDirectory,
  cacheDirectory,
  getInfoAsync,
  readDirectoryAsync,
} from 'expo-file-system/legacy';
import Svg, {
  Circle,
  Path,
  Rect,
  G,
  Defs,
  LinearGradient,
  RadialGradient,
  Stop,
  Ellipse,
} from 'react-native-svg';
import { Trash, Play, Share as ShareIcon } from 'reicon-react-native';
import * as Haptics from 'expo-haptics';

import { useDownloadHistory, HistoryItem } from '../hooks/useDownloadHistory';
import { downloadMedia, DOWNLOADS_DIRECTORY } from '../utils/download';
import { mascotController } from '../features/mascot';
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

// Responsive Hero Card dimensions (Prevents vertical squeezing & dialer clipping)
const HERO_WIDTH = Math.min(SCREEN_WIDTH - 48, 330);
const MAX_HERO_HEIGHT = Math.round(SCREEN_HEIGHT * 0.44);
const HERO_HEIGHT = Math.min(Math.round(HERO_WIDTH * 1.18), MAX_HERO_HEIGHT);
const HERO_GAP = 14;
const HERO_SNAP_INTERVAL = HERO_WIDTH + HERO_GAP;
const HERO_PADDING_HORIZONTAL = Math.round((SCREEN_WIDTH - HERO_WIDTH) / 2);

// Dialer dimensions
const DIALER_ITEM_WIDTH = 58;
const DIALER_ITEM_HEIGHT = 74;
const DIALER_ITEM_GAP = 10;
const DIALER_SNAP_INTERVAL = DIALER_ITEM_WIDTH + DIALER_ITEM_GAP;
const DIALER_PADDING_HORIZONTAL = Math.round((SCREEN_WIDTH - DIALER_ITEM_WIDTH) / 2);

export type PlatformCategory = 'youtube' | 'instagram' | 'facebook' | 'twitter' | 'pinterest' | 'tiktok' | 'reddit' | 'web';

export interface CategoryMediaItem {
  id: string;
  title: string;
  date: string;
  src: string;
  url?: string;
  localUri?: string;
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
  pinterest: [
    {
      id: 'pin-1',
      title: 'Minimalist Japandi Loft Interior',
      date: '16 May, 2025',
      src: photo('1618221195710-dd6b41faaea6'),
      duration: 'Photo',
      platform: 'pinterest',
    },
    {
      id: 'pin-2',
      title: 'Editorial Typography Moodboard',
      date: '13 May, 2025',
      src: photo('1507238691740-187a5b1d37b8'),
      duration: 'Photo',
      platform: 'pinterest',
    },
    {
      id: 'pin-3',
      title: 'Scandinavian Ceramic Architecture',
      date: '08 May, 2025',
      src: photo('1513694203232-719a280e022f'),
      duration: 'Photo',
      platform: 'pinterest',
    },
    {
      id: 'pin-4',
      title: 'Monochrome Film Aesthetic 35mm',
      date: '02 May, 2025',
      src: photo('1516035069371-29a1b244cc32'),
      duration: 'Photo',
      platform: 'pinterest',
    },
  ],
  tiktok: [
    {
      id: 'tt-1',
      title: 'Cinematic Tokyo Street Food 4K',
      date: '16 May, 2025',
      src: photo('1555396273-367ea4eb4db5'),
      duration: '0:32',
      platform: 'tiktok',
    },
    {
      id: 'tt-2',
      title: 'Hyperlapse Drone Night Flight',
      date: '12 May, 2025',
      src: photo('1519501025264-65ba15a82390'),
      duration: '0:18',
      platform: 'tiktok',
    },
    {
      id: 'tt-3',
      title: 'Cyberpunk Neon Alley Transitions',
      date: '07 May, 2025',
      src: photo('1508739773434-c26b3d09e071'),
      duration: '0:45',
      platform: 'tiktok',
    },
    {
      id: 'tt-4',
      title: 'Acoustic Lo-Fi Beats Production',
      date: '01 May, 2025',
      src: photo('1511379938547-c1f69419868d'),
      duration: '0:58',
      platform: 'tiktok',
    },
  ],
  reddit: [
    {
      id: 'rd-1',
      title: 'Top Discussion on r/technology',
      date: '15 May, 2025',
      src: photo('1618005182384-a83a8bd57fbe'),
      duration: '1:10',
      platform: 'reddit',
    },
    {
      id: 'rd-2',
      title: 'r/gaming Masterpiece Showcase',
      date: '11 May, 2025',
      src: photo('1550745165-9bc0b252726f'),
      duration: '0:42',
      platform: 'reddit',
    },
    {
      id: 'rd-3',
      title: 'r/space Deep Sky Nebula 4K',
      date: '06 May, 2025',
      src: photo('1534447677768-be436bb09401'),
      duration: '2:15',
      platform: 'reddit',
    },
    {
      id: 'rd-4',
      title: 'r/earthporn Cinematic Mountain Drone',
      date: '01 May, 2025',
      src: photo('1507525428034-b723cf961d3e'),
      duration: '0:50',
      platform: 'reddit',
    },
  ],
  web: [
    {
      id: 'web-1',
      title: 'Cinematic Visuals Showcase 4K',
      date: '15 May, 2025',
      src: photo('1579546929518-9e396f3cc809'),
      duration: '1:45',
      platform: 'web',
    },
    {
      id: 'web-2',
      title: 'Direct Stream Video Capture',
      date: '10 May, 2025',
      src: photo('1614850523459-c2f4c699c52e'),
      duration: '0:35',
      platform: 'web',
    },
  ],
};

export default function DownloadsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { navigateWithCascade } = useCascadeNavigation();
  useCascadeBackTransition(navigation);

  const { history, removeHistoryItem, updateHistoryItem } = useDownloadHistory();

  // Active Category State
  const [selectedCategory, setSelectedCategory] = useState<PlatformCategory | null>(null);
  const [activeMediaIndex, setActiveMediaIndex] = useState(0);

  // In-place Video Player with safe wrappers
  const videoPlayer = useVideoPlayer('', p => {
    p.loop = true;
    p.timeUpdateEventInterval = 0.25;
  });
  const [isPlayingInline, setIsPlayingInline] = useState(false);
  const [localPlayableUri, setLocalPlayableUri] = useState<string | null>(null);
  const [isCheckingMedia, setIsCheckingMedia] = useState(false);

  const isPlayerUsable = useCallback(() => {
    try {
      return Boolean(videoPlayer && typeof (videoPlayer as any).pause === 'function');
    } catch {
      return false;
    }
  }, [videoPlayer]);

  const safePause = useCallback(() => {
    try {
      if (isPlayerUsable()) {
        videoPlayer.pause();
      }
    } catch {}
  }, [videoPlayer, isPlayerUsable]);

  const safePlay = useCallback(() => {
    try {
      if (isPlayerUsable()) {
        videoPlayer.play();
      }
    } catch {}
  }, [videoPlayer, isPlayerUsable]);

  const safeReplace = useCallback(
    async (uri: string) => {
      try {
        if (typeof (videoPlayer as any).replaceAsync === 'function') {
          await (videoPlayer as any).replaceAsync(uri);
        } else if (typeof (videoPlayer as any).replace === 'function') {
          videoPlayer.replace(uri);
        }
      } catch {}
    },
    [videoPlayer]
  );

  // Animated viewer visibility & synchronized scroll state
  const viewerAnim = useRef(new Animated.Value(0)).current;
  const dialerScrollRef = useRef<ScrollView>(null);
  const heroScrollRef = useRef<ScrollView>(null);
  const dialerScrollX = useRef(new Animated.Value(0)).current;
  const heroScrollX = useRef(new Animated.Value(0)).current;
  const isSyncingRef = useRef(false);

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
    if (p === 'pinterest' || url.includes('pinterest.com') || url.includes('pin.it')) {
      return 'pinterest';
    }
    if (p === 'tiktok' || url.includes('tiktok.com')) {
      return 'tiktok';
    }
    if (p === 'facebook' || url.includes('facebook.com') || url.includes('fb.watch') || url.includes('fb.com')) {
      return 'facebook';
    }
    if (p === 'reddit' || url.includes('reddit.com') || url.includes('redd.it')) {
      return 'reddit';
    }
    if (p === 'youtube' || url.includes('youtube.com') || url.includes('youtu.be')) {
      return 'youtube';
    }
    return 'web';
  }, []);

  // Track real download count per platform accurately
  const realCounts = useMemo(() => {
    const counts: Record<PlatformCategory, number> = {
      youtube: 0,
      instagram: 0,
      facebook: 0,
      twitter: 0,
      pinterest: 0,
      tiktok: 0,
      reddit: 0,
      web: 0,
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
      pinterest: [],
      tiktok: [],
      reddit: [],
      web: [],
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

      const dateStr = item.downloadedAt
        ? new Date(item.downloadedAt).toLocaleDateString('en-US', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })
        : '';

      map[plat].unshift({
        id: item.url || `history-${idx}`,
        title,
        date: dateStr,
        src: thumb,
        url: item.url,
        localUri: item.localUri,
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
    activeMediaIndexRef.current = 0;
    setIsPlayingInline(false);
    setLocalPlayableUri(null);
    dialerScrollX.setValue(0);
    heroScrollX.setValue(0);

    Animated.timing(viewerAnim, {
      toValue: 1,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

    // Reset scroll positions
    requestAnimationFrame(() => {
      dialerScrollRef.current?.scrollTo({ x: 0, animated: false });
      heroScrollRef.current?.scrollTo({ x: 0, animated: false });
    });
  };

  const closeCategoryViewer = () => {
    safePause();
    setIsPlayingInline(false);
    setLocalPlayableUri(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    Animated.timing(viewerAnim, {
      toValue: 0,
      duration: 220,
      easing: Easing.in(Easing.cubic),
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
            safePause();
            setIsPlayingInline(false);
            setLocalPlayableUri(null);
            if (activeMedia.historyRef?.url) {
              removeHistoryItem(activeMedia.historyRef.url);
            }
            // Move to previous or next item in dialer
            if (activeMediaList.length <= 1) {
              closeCategoryViewer();
            } else {
              const nextIdx = Math.max(0, activeMediaIndex - 1);
              setActiveMediaIndex(nextIdx);
              activeMediaIndexRef.current = nextIdx;
              dialerScrollRef.current?.scrollTo({
                x: nextIdx * DIALER_SNAP_INTERVAL,
                animated: true,
              });
              heroScrollRef.current?.scrollTo({
                x: nextIdx * HERO_SNAP_INTERVAL,
                animated: true,
              });
            }
          },
        },
      ]
    );
  };

  // Strictly check if media file actually exists on the device storage
  const findMediaOnDevice = useCallback(
    async (media: CategoryMediaItem): Promise<string | null> => {
      // 1. Direct localUri recorded on the item
      const targetLocalUri = media.localUri || media.historyRef?.localUri;
      if (targetLocalUri) {
        try {
          const info = await getInfoAsync(targetLocalUri);
          if (info.exists && (info.size == null || info.size > 0)) {
            return targetLocalUri;
          }
        } catch {}
      }

      // 2. Check in app's persistent downloads directory
      try {
        const downloadsDir = DOWNLOADS_DIRECTORY;
        const dirInfo = await getInfoAsync(downloadsDir).catch(() => null);
        if (dirInfo?.exists) {
          const files = await readDirectoryAsync(downloadsDir);
          const rawUrl = media.historyRef?.url || media.url || '';
          const clean = rawUrl.split('?')[0];
          const seg = clean.split('/').filter(Boolean).pop()?.replace(/[^a-zA-Z0-9_-]/g, '');

          if (seg && seg.length >= 4) {
            const matchedFile = files.find(f => f.includes(seg));
            if (matchedFile) {
              const fullUri = downloadsDir + matchedFile;
              const fInfo = await getInfoAsync(fullUri);
              if (fInfo.exists && (fInfo.size == null || fInfo.size > 0)) {
                return fullUri;
              }
            }
          }
        }
      } catch {}

      // 3. Check in cache directory
      try {
        if (cacheDirectory) {
          const rawUrl = media.historyRef?.url || media.url || '';
          const clean = rawUrl.split('?')[0];
          const seg = clean.split('/').filter(Boolean).pop()?.replace(/[^a-zA-Z0-9_-]/g, '');
          if (seg && seg.length >= 4) {
            const files = await readDirectoryAsync(cacheDirectory).catch(() => []);
            const matchedCache = files.find(f => f.startsWith('anyfetch_') && f.includes(seg));
            if (matchedCache) {
              const fullUri = cacheDirectory + matchedCache;
              const cInfo = await getInfoAsync(fullUri);
              if (cInfo.exists && (cInfo.size ?? 0) > 50000) {
                return fullUri;
              }
            }
          }
        }
      } catch {}

      return null;
    },
    []
  );

  const handleDownloadAndPlay = async (media: CategoryMediaItem) => {
    const directUrl = media.historyRef?.singleResult?.url;
    if (!directUrl) return;

    setIsCheckingMedia(true);
    mascotController.onDownloadStart();
    try {
      const res = await downloadMedia(directUrl, 'video');
      if (res.ok && res.uri) {
        mascotController.onDownloadSuccess();
        if (media.historyRef?.url) {
          updateHistoryItem(media.historyRef.url, {
            localUri: res.uri,
            downloadedAt: Date.now(),
          });
        }
        setLocalPlayableUri(res.uri);
        await safeReplace(res.uri);
        safePlay();
        setIsPlayingInline(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      } else {
        mascotController.onDownloadError();
        Alert.alert('Download Failed', res.error || 'Could not save video to device.');
      }
    } catch (e: any) {
      mascotController.onDownloadError();
      Alert.alert('Download Error', e?.message || 'Download failed.');
    } finally {
      setIsCheckingMedia(false);
    }
  };

  const handlePlayMedia = async (targetMedia?: CategoryMediaItem, targetIndex?: number) => {
    const media = targetMedia || activeMedia;
    if (!media) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

    if (targetIndex !== undefined && targetIndex !== activeMediaIndexRef.current) {
      handleSelectThumbnail(targetIndex);
    }

    setIsCheckingMedia(true);
    try {
      const onDeviceUri = await findMediaOnDevice(media);

      if (!onDeviceUri) {
        setIsCheckingMedia(false);
        const canDownload = Boolean(media.historyRef?.singleResult?.url);
        Alert.alert(
          'Video Not On Device',
          'This video has not been downloaded to your device storage yet. Download it first to play offline.',
          [
            { text: 'Cancel', style: 'cancel' },
            ...(canDownload
              ? [
                  {
                    text: 'Download Now',
                    onPress: () => handleDownloadAndPlay(media),
                  },
                ]
              : []),
          ]
        );
        return;
      }

      // Media is on device! Play in-place inside the hero card
      setLocalPlayableUri(onDeviceUri);
      await safeReplace(onDeviceUri);
      safePlay();
      setIsPlayingInline(true);
    } catch (err: any) {
      Alert.alert('Playback Error', err?.message || 'Could not play video on device.');
    } finally {
      setIsCheckingMedia(false);
    }
  };

  const activeMediaIndexRef = useRef(0);

  useEffect(() => {
    activeMediaIndexRef.current = activeMediaIndex;
  }, [activeMediaIndex]);

  // Synchronized Hero momentum scroll end
  const handleHeroScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (isSyncingRef.current) return;
      const offsetX = e.nativeEvent.contentOffset.x;
      const idx = Math.max(
        0,
        Math.min(
          activeMediaList.length - 1,
          Math.round(offsetX / HERO_SNAP_INTERVAL)
        )
      );
      if (idx !== activeMediaIndexRef.current) {
        activeMediaIndexRef.current = idx;
        safePause();
        setIsPlayingInline(false);
        setLocalPlayableUri(null);
        setActiveMediaIndex(idx);
        Haptics.selectionAsync().catch(() => {});
        isSyncingRef.current = true;
        dialerScrollRef.current?.scrollTo({
          x: idx * DIALER_SNAP_INTERVAL,
          animated: true,
        });
        setTimeout(() => {
          isSyncingRef.current = false;
        }, 350);
      }
    },
    [activeMediaList.length, safePause]
  );

  // Synchronized Dialer momentum scroll end
  const handleDialerScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (isSyncingRef.current) return;
      const offsetX = e.nativeEvent.contentOffset.x;
      const idx = Math.max(
        0,
        Math.min(
          activeMediaList.length - 1,
          Math.round(offsetX / DIALER_SNAP_INTERVAL)
        )
      );
      if (idx !== activeMediaIndexRef.current) {
        activeMediaIndexRef.current = idx;
        safePause();
        setIsPlayingInline(false);
        setLocalPlayableUri(null);
        setActiveMediaIndex(idx);
        Haptics.selectionAsync().catch(() => {});
        isSyncingRef.current = true;
        heroScrollRef.current?.scrollTo({
          x: idx * HERO_SNAP_INTERVAL,
          animated: true,
        });
        setTimeout(() => {
          isSyncingRef.current = false;
        }, 350);
      }
    },
    [activeMediaList.length, safePause]
  );

  const handleSelectThumbnail = useCallback(
    (index: number) => {
      Haptics.selectionAsync().catch(() => {});
      if (index !== activeMediaIndexRef.current) {
        activeMediaIndexRef.current = index;
        safePause();
        setIsPlayingInline(false);
        setLocalPlayableUri(null);
        setActiveMediaIndex(index);
      }
      isSyncingRef.current = true;
      dialerScrollRef.current?.scrollTo({
        x: index * DIALER_SNAP_INTERVAL,
        animated: true,
      });
      heroScrollRef.current?.scrollTo({
        x: index * HERO_SNAP_INTERVAL,
        animated: true,
      });
      setTimeout(() => {
        isSyncingRef.current = false;
      }, 350);
    },
    [safePause]
  );

  const handleSelectTab = (tab: TabRoute) => {
    if (tab === 'Downloads') return;
    navigateWithCascade(tab);
  };

  return (
    <View style={s.root}>
      {/* ═══ 1. MAIN DOWNLOADS SCREEN: 2x3 PLATFORM CARDS ═══ */}
      <ScrollView
        style={s.mainScrollView}
        contentContainerStyle={[
          s.mainContainer,
          {
            paddingTop: Math.max(insets.top, 16) + 10,
            paddingBottom: Math.max(insets.bottom + 90, 110),
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Minimal Centered Header Pill */}
        <View style={s.headerPillWrap}>
          <View style={s.headerPill}>
            <Text style={s.headerPillText}>Downloads</Text>
            <Text style={s.headerPillChevron}>›</Text>
          </View>
        </View>

        {/* 2x3 Squircle Cards Grid (YouTube, Instagram, Twitter/X, Facebook, Pinterest, TikTok) */}
        <View style={s.gridContainer}>
          {/* ── CARD 1: YOUTUBE ── */}
          <TouchableOpacity
            activeOpacity={0.78}
            delayPressIn={0}
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
            activeOpacity={0.78}
            delayPressIn={0}
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

          {/* ── CARD 3: TWITTER / X ── */}
          <TouchableOpacity
            activeOpacity={0.78}
            delayPressIn={0}
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

          {/* ── CARD 4: FACEBOOK ── */}
          <TouchableOpacity
            activeOpacity={0.78}
            delayPressIn={0}
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

          {/* ── CARD 5: PINTEREST ── */}
          <TouchableOpacity
            activeOpacity={0.78}
            delayPressIn={0}
            style={[s.cardBase, s.pinCard]}
            onPress={() => openCategoryViewer('pinterest')}
          >
            <View style={s.cardHeader}>
              <Text style={s.platformTitle}>Pinterest</Text>
              <View style={[s.badgePill, s.pinBadge]}>
                <Text style={s.badgePillText}>
                  {realCounts.pinterest} Saved
                </Text>
              </View>
            </View>

            <View style={s.graphicBox}>
              <PinterestCardIcon />
            </View>

            <View style={s.cardFooter}>
              <Text style={s.platformSub}>Pins & Media</Text>
              <Text style={[s.cardChevron, { color: '#E60023' }]}>›</Text>
            </View>
          </TouchableOpacity>

          {/* ── CARD 6: TIKTOK ── */}
          <TouchableOpacity
            activeOpacity={0.78}
            delayPressIn={0}
            style={[s.cardBase, s.ttCard]}
            onPress={() => openCategoryViewer('tiktok')}
          >
            <View style={s.cardHeader}>
              <Text style={s.platformTitle}>TikTok</Text>
              <View style={[s.badgePill, s.ttBadge]}>
                <Text style={s.badgePillText}>
                  {realCounts.tiktok} Saved
                </Text>
              </View>
            </View>

            <View style={s.graphicBox}>
              <TikTokCardIcon />
            </View>

            <View style={s.cardFooter}>
              <Text style={s.platformSub}>Clips & Trends</Text>
              <Text style={[s.cardChevron, { color: '#00F2FE' }]}>›</Text>
            </View>
          </TouchableOpacity>

          {/* ── CARD 7: REDDIT ── */}
          <TouchableOpacity
            activeOpacity={0.78}
            delayPressIn={0}
            style={[s.cardBase, s.redditCard]}
            onPress={() => openCategoryViewer('reddit')}
          >
            <View style={s.cardHeader}>
              <Text style={s.platformTitle}>Reddit</Text>
              <View style={[s.badgePill, s.redditBadge]}>
                <Text style={s.badgePillText}>
                  {realCounts.reddit} Saved
                </Text>
              </View>
            </View>

            <View style={s.graphicBox}>
              <RedditCardIcon />
            </View>

            <View style={s.cardFooter}>
              <Text style={s.platformSub}>Posts & Videos</Text>
              <Text style={[s.cardChevron, { color: '#FF4500' }]}>›</Text>
            </View>
          </TouchableOpacity>

          {/* ── CARD 8: WEB & OTHER ── */}
          <TouchableOpacity
            activeOpacity={0.78}
            delayPressIn={0}
            style={[s.cardBase, s.webCard]}
            onPress={() => openCategoryViewer('web')}
          >
            <View style={s.cardHeader}>
              <Text style={s.platformTitle}>Web Media</Text>
              <View style={[s.badgePill, s.webBadge]}>
                <Text style={s.badgePillText}>
                  {realCounts.web} Saved
                </Text>
              </View>
            </View>

            <View style={s.graphicBox}>
              <WebCardIcon />
            </View>

            <View style={s.cardFooter}>
              <Text style={s.platformSub}>Direct & Others</Text>
              <Text style={[s.cardChevron, { color: '#00E5FF' }]}>›</Text>
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>

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

          {/* Center Stage: Hero Preview Carousel with Native GPU Snapping */}
          <View style={s.heroStage}>
            <Animated.ScrollView
              ref={heroScrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              snapToInterval={HERO_SNAP_INTERVAL}
              snapToAlignment="center"
              decelerationRate="fast"
              overScrollMode="never"
              bounces={true}
              scrollEventThrottle={16}
              contentContainerStyle={{
                paddingHorizontal: HERO_PADDING_HORIZONTAL,
                alignItems: 'center',
              }}
              onScroll={Animated.event(
                [{ nativeEvent: { contentOffset: { x: heroScrollX } } }],
                { useNativeDriver: true }
              )}
              onMomentumScrollEnd={handleHeroScrollEnd}
            >
              {activeMediaList.map((item, index) => {
                const isSelected = index === activeMediaIndex;
                const inputRange = [
                  (index - 1) * HERO_SNAP_INTERVAL,
                  index * HERO_SNAP_INTERVAL,
                  (index + 1) * HERO_SNAP_INTERVAL,
                ];
                const scale = heroScrollX.interpolate({
                  inputRange,
                  outputRange: [0.92, 1.0, 0.92],
                  extrapolate: 'clamp',
                });
                const opacity = heroScrollX.interpolate({
                  inputRange,
                  outputRange: [0.65, 1.0, 0.65],
                  extrapolate: 'clamp',
                });

                return (
                  <Animated.View
                    key={item.id}
                    style={[
                      s.heroCard,
                      {
                        width: HERO_WIDTH,
                        height: HERO_HEIGHT,
                        marginRight: index === activeMediaList.length - 1 ? 0 : HERO_GAP,
                        transform: [{ scale }],
                        opacity,
                      },
                    ]}
                  >
                    {isPlayingInline && localPlayableUri && isSelected ? (
                      <View style={StyleSheet.absoluteFill}>
                        <VideoView
                          player={videoPlayer}
                          style={StyleSheet.absoluteFill}
                          nativeControls={true}
                          contentFit="contain"
                        />
                      </View>
                    ) : (
                      <>
                        <Image
                          source={{ uri: item.src }}
                          style={StyleSheet.absoluteFill}
                          resizeMode="cover"
                        />

                        {/* Soft Vignette Overlay */}
                        <View style={s.heroImageOverlay} />

                        {/* Center Frosted Glass Play Button */}
                        <TouchableOpacity
                          activeOpacity={0.8}
                          onPress={() => handlePlayMedia(item, index)}
                          style={s.playBtnWrap}
                          disabled={isCheckingMedia}
                        >
                          <View style={s.playBtnFrosted}>
                            {isCheckingMedia && isSelected ? (
                              <ActivityIndicator size="small" color="#FFFFFF" />
                            ) : (
                              <Play size={28} color="#FFFFFF" style={{ marginLeft: 3 }} />
                            )}
                          </View>
                        </TouchableOpacity>
                      </>
                    )}
                  </Animated.View>
                );
              })}
            </Animated.ScrollView>

            {/* Clean Date Text */}
            {activeMedia?.date && activeMedia.date !== 'Recent Download' ? (
              <Text style={s.heroDateText}>{activeMedia.date}</Text>
            ) : null}
          </View>

          {/* Bottom Dialer Filmstrip Wheel (Matching Image 2) */}
          <View
            style={[
              s.dialerContainer,
              {
                paddingBottom: Math.max(insets.bottom, 24) + 14,
              },
            ]}
          >
            <Animated.ScrollView
              ref={dialerScrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              snapToInterval={DIALER_SNAP_INTERVAL}
              snapToAlignment="center"
              decelerationRate="fast"
              overScrollMode="never"
              bounces={true}
              onScroll={Animated.event(
                [{ nativeEvent: { contentOffset: { x: dialerScrollX } } }],
                { useNativeDriver: true }
              )}
              onMomentumScrollEnd={handleDialerScrollEnd}
              scrollEventThrottle={16}
              contentContainerStyle={{
                paddingHorizontal: DIALER_PADDING_HORIZONTAL,
                alignItems: 'center',
                paddingVertical: 12,
              }}
            >
              {activeMediaList.map((item, index) => {
                const isSelected = index === activeMediaIndex;

                const inputRange = [
                  (index - 1) * DIALER_SNAP_INTERVAL,
                  index * DIALER_SNAP_INTERVAL,
                  (index + 1) * DIALER_SNAP_INTERVAL,
                ];

                const scale = dialerScrollX.interpolate({
                  inputRange,
                  outputRange: [0.82, 1.15, 0.82],
                  extrapolate: 'clamp',
                });

                const opacity = dialerScrollX.interpolate({
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

/**
 * Pinterest Card Icon:
 * Signature crimson circle with iconic bold white 'P' monogram
 */
function PinterestCardIcon() {
  return (
    <View style={widgetStyles.iconCenterWrap}>
      <Svg width={64} height={64} viewBox="0 0 64 64">
        <Defs>
          <LinearGradient id="pinGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#E60023" stopOpacity="1" />
            <Stop offset="100%" stopColor="#A80018" stopOpacity="1" />
          </LinearGradient>
        </Defs>
        <Circle cx={32} cy={32} r={30} fill="url(#pinGrad)" />
        <Path
          d="M 32,12 C 21,12 16,19.8 16,26.5 C 16,30.5 17.5,34.2 20.8,35.5 C 21.3,35.7 21.7,35.5 21.9,34.8 C 22.1,34.1 22.5,32.3 22.7,31.4 C 22.8,30.8 22.7,30.5 22.3,30 C 21.2,28.7 20.5,26.8 20.5,24.5 C 20.5,18 25.3,14 31.4,14 C 36.6,14 40.5,17.4 40.5,22.8 C 40.5,28.6 37.1,33.5 32.5,33.5 C 29.8,33.5 27.8,31.3 28.5,28.5 C 29.3,25.2 30.8,21.6 30.8,19.2 C 30.8,17.2 29.8,15.6 27.7,15.6 C 25.1,15.6 23,18.2 23,21.8 C 23,24 23.8,25.6 23.8,25.6 L 20.5,39.5 C 19.5,43.8 20.8,49.1 21,49.5 C 21.1,49.7 21.3,49.8 21.5,49.6 C 21.8,49.2 25.6,44.2 26.8,39.5 L 28.2,34 C 29.1,35.6 31.3,37 33.7,37 C 41.5,37 47,29.8 47,22.2 C 47,15.8 41.5,12 32,12 Z"
          fill="#FFFFFF"
        />
      </Svg>
    </View>
  );
}

/**
 * TikTok Card Icon:
 * Pitch-black card with glowing neon cyan & magenta offset note glyph
 */
function TikTokCardIcon() {
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
          fill="#06080C"
          stroke="rgba(0, 242, 254, 0.28)"
          strokeWidth={1.5}
        />
        <Path
          d="M 39.5,14 C 40.7,18.2 43.6,21.2 47.8,22.2 L 47.8,27.5 C 44.5,27.3 41.7,25.8 39.5,23.8 L 39.5,37.5 C 39.5,45.2 33.2,50.8 25.8,49.8 C 20.3,49.1 16,44.2 16.2,38.5 C 16.5,32.8 21.2,28.5 27,28.8 L 27,34.2 C 24.2,34 21.8,36 21.5,38.8 C 21.2,41.8 23.6,44.5 26.7,44.5 C 29.8,44.5 32.5,42 32.5,38.5 L 32.5,14 L 39.5,14 Z"
          fill="#00F2FE"
          transform="translate(-1.5, -1)"
          opacity={0.88}
        />
        <Path
          d="M 39.5,14 C 40.7,18.2 43.6,21.2 47.8,22.2 L 47.8,27.5 C 44.5,27.3 41.7,25.8 39.5,23.8 L 39.5,37.5 C 39.5,45.2 33.2,50.8 25.8,49.8 C 20.3,49.1 16,44.2 16.2,38.5 C 16.5,32.8 21.2,28.5 27,28.8 L 27,34.2 C 24.2,34 21.8,36 21.5,38.8 C 21.2,41.8 23.6,44.5 26.7,44.5 C 29.8,44.5 32.5,42 32.5,38.5 L 32.5,14 L 39.5,14 Z"
          fill="#FE2C55"
          transform="translate(1.5, 1)"
          opacity={0.88}
        />
        <Path
          d="M 39.5,14 C 40.7,18.2 43.6,21.2 47.8,22.2 L 47.8,27.5 C 44.5,27.3 41.7,25.8 39.5,23.8 L 39.5,37.5 C 39.5,45.2 33.2,50.8 25.8,49.8 C 20.3,49.1 16,44.2 16.2,38.5 C 16.5,32.8 21.2,28.5 27,28.8 L 27,34.2 C 24.2,34 21.8,36 21.5,38.8 C 21.2,41.8 23.6,44.5 26.7,44.5 C 29.8,44.5 32.5,42 32.5,38.5 L 32.5,14 L 39.5,14 Z"
          fill="#FFFFFF"
        />
      </Svg>
    </View>
  );
}

/**
 * Reddit Card Icon:
 * Vibrant orange circle with Snoo silhouette
 */
function RedditCardIcon() {
  return (
    <View style={widgetStyles.iconCenterWrap}>
      <Svg width={64} height={64} viewBox="0 0 64 64">
        <Defs>
          <LinearGradient id="rdGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0%" stopColor="#FF5722" stopOpacity="1" />
            <Stop offset="100%" stopColor="#FF4500" stopOpacity="1" />
          </LinearGradient>
        </Defs>
        <Circle cx={32} cy={32} r={30} fill="url(#rdGrad)" />
        {/* Snoo antenna */}
        <Circle cx={44} cy={16} r={3.2} fill="#FFFFFF" />
        <Path
          d="M 32,22 L 36,13 L 42,15.5"
          stroke="#FFFFFF"
          strokeWidth={2.8}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Snoo ears */}
        <Circle cx={15} cy={34} r={4.5} fill="#FFFFFF" />
        <Circle cx={49} cy={34} r={4.5} fill="#FFFFFF" />
        {/* Snoo head */}
        <Ellipse cx={32} cy={35} rx={16} ry={12} fill="#FFFFFF" />
        {/* Eyes */}
        <Circle cx={26} cy={34} r={2.8} fill="#FF4500" />
        <Circle cx={38} cy={34} r={2.8} fill="#FF4500" />
        {/* Smile */}
        <Path
          d="M 27,40 Q 32,44 37,40"
          stroke="#FF4500"
          strokeWidth={2.2}
          fill="none"
          strokeLinecap="round"
        />
      </Svg>
    </View>
  );
}

/**
 * Web Media Card Icon:
 * Cyan to royal blue globe emblem
 */
function WebCardIcon() {
  return (
    <View style={widgetStyles.iconCenterWrap}>
      <Svg width={64} height={64} viewBox="0 0 64 64">
        <Defs>
          <LinearGradient id="webGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#00E5FF" stopOpacity="1" />
            <Stop offset="100%" stopColor="#0077FE" stopOpacity="1" />
          </LinearGradient>
        </Defs>
        <Circle cx={32} cy={32} r={30} fill="url(#webGrad)" />
        <Circle cx={32} cy={32} r={18} fill="none" stroke="#FFFFFF" strokeWidth={2.6} />
        <Ellipse cx={32} cy={32} rx={9} ry={18} fill="none" stroke="#FFFFFF" strokeWidth={2.2} />
        <Path d="M 14,32 L 50,32" stroke="#FFFFFF" strokeWidth={2.2} />
        <Path d="M 17,23 L 47,23" stroke="#FFFFFF" strokeWidth={2} />
        <Path d="M 17,41 L 47,41" stroke="#FFFFFF" strokeWidth={2} />
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
  mainScrollView: {
    flex: 1,
    width: '100%',
  },
  mainContainer: {
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

  // 2x3 Grid
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
  // Card 5: Pinterest
  pinCard: {
    backgroundColor: '#140608',
    borderWidth: 1,
    borderColor: 'rgba(230, 0, 35, 0.26)',
  },
  // Card 6: TikTok
  ttCard: {
    backgroundColor: '#060B12',
    borderWidth: 1,
    borderColor: 'rgba(0, 242, 254, 0.24)',
  },
  // Card 7: Reddit
  redditCard: {
    backgroundColor: '#160B08',
    borderWidth: 1,
    borderColor: 'rgba(255, 69, 0, 0.26)',
  },
  // Card 8: Web
  webCard: {
    backgroundColor: '#07131D',
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.24)',
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
  pinBadge: {
    backgroundColor: 'rgba(230, 0, 35, 0.22)',
  },
  ttBadge: {
    backgroundColor: 'rgba(0, 242, 254, 0.2)',
  },
  redditBadge: {
    backgroundColor: 'rgba(255, 69, 0, 0.22)',
  },
  webBadge: {
    backgroundColor: 'rgba(0, 229, 255, 0.2)',
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
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 4,
  },
  heroCard: {
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
    marginTop: 12,
    textAlign: 'center',
  },

  // Bottom Dialer Wheel
  dialerContainer: {
    width: '100%',
    paddingTop: 8,
    justifyContent: 'center',
  },
  dialerTouch: {
    marginRight: DIALER_ITEM_GAP,
    paddingVertical: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dialerThumbCard: {
    width: DIALER_ITEM_WIDTH,
    height: DIALER_ITEM_HEIGHT,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#27272A',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  dialerThumbActive: {
    borderWidth: 2,
    borderColor: '#FFFFFF',
    shadowColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 6,
  },
});
