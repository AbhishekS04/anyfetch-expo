/**
 * HomeScreen — Expo Go + Android SDK 56
 *
 * Implements a premium BlackHole music app dark aesthetic UI:
 *  - Immersive custom header with Info modal and Settings navigation
 *  - Central glowing "Black Hole" circle button with double pulsing wave rings
 *  - Dynamic platform color glows per platform
 *  - Static (non-scrollable) idle layout
 *  - Glassmorphic manual TextInput
 *  - Premium horizontal Recent History cards with chip-filter tabs
 *  - Immersive Result screen featuring rounded media preview and solid action buttons
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Easing,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  documentDirectory,
  getInfoAsync,
  readAsStringAsync,
  writeAsStringAsync,
} from 'expo-file-system/legacy';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useEvent } from 'expo';

import { extractInstagram, IgExtractResult, IgMediaItem } from '../extractors/instagram';
import { extractPinterest, PtExtractResult } from '../extractors/pinterest';
import { extractTwitter, TwExtractResult } from '../extractors/twitter';
import { detectPlatform, downloadMedia, DownloadProgress } from '../utils/download';

const { width: W, height: H } = Dimensions.get('window');
// Persistent file path for recent download history (no native module needed)
const HISTORY_FILE = (documentDirectory ?? '') + 'download_history.json';

const CARD_WIDTH = W - 90;
const CARD_GAP = 12;
const CARD_PADDING = (W - CARD_WIDTH) / 2; // 45

type AppPhase = 'idle' | 'loading' | 'result' | 'error';

interface CarouselItem extends IgMediaItem {
  index: number;
  selected: boolean;
}

type SupportedPlatform =
  | 'instagram'
  | 'pinterest'
  | 'twitter';

type HistoryFilter = 'all' | SupportedPlatform;

interface HistoryItem {
  url: string;
  platform: SupportedPlatform;
  singleResult: {
    type: 'video' | 'image';
    url: string;
    thumbnail?: string;
    hlsNote?: string;
    title?: string;
  } | null;
  carouselItems: CarouselItem[];
}

const formatTime = (secs: number) => {
  if (isNaN(secs) || secs < 0) return '00:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

export default function HomeScreen() {
  const navigation = useNavigation<any>();
  const [phase, setPhase] = useState<AppPhase>('idle');
  const [urlInput, setUrlInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [singleResult, setSingleResult] = useState<{
    type: 'video' | 'image';
    url: string;
    thumbnail?: string;
    hlsNote?: string;
    title?: string;
  } | null>(null);
  const [carouselItems, setCarouselItems] = useState<CarouselItem[]>([]);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [infoVisible, setInfoVisible] = useState(false);
  const [controlsActive, setControlsActive] = useState(true);
  const controlsOpacity = useRef(new Animated.Value(1)).current;
  const [isLooping, setIsLooping] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seekerWidthRef = useRef(0);
  const scrollX = useRef(new Animated.Value(0)).current;
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const buttonColorAnim = useRef(new Animated.Value(0)).current;



  // History filter chip
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('all');

  // historyReady flips to true after the initial disk read finishes.
  // It MUST be useState (not useRef) — only state changes re-trigger effects.
  const [historyReady, setHistoryReady] = useState(false);

  // ── Load saved history from disk once on mount ─────────────────────
  useEffect(() => {
    (async () => {
      try {
        if (!documentDirectory) return; // safety: no FS available
        const info = await getInfoAsync(HISTORY_FILE);
        if (info.exists) {
          const raw = await readAsStringAsync(HISTORY_FILE);
          const parsed = JSON.parse(raw) as HistoryItem[];
          if (Array.isArray(parsed) && parsed.length > 0) {
            setHistory(parsed);
          }
        }
      } catch {
        // corrupt / missing file — start fresh, no crash
      } finally {
        setHistoryReady(true); // ← triggers save effect to run correctly
      }
    })();
  }, []);

  // ── Persist every change to disk ───────────────────────────────────
  // Depends on both `history` and `historyReady` so it runs when either
  // changes. The guard stops it writing an empty array before load finishes.
  useEffect(() => {
    if (!historyReady) return;
    writeAsStringAsync(HISTORY_FILE, JSON.stringify(history)).catch(() => {});
  }, [history, historyReady]);


  const fadeAnim = useRef(new Animated.Value(1)).current;

  const transitionToPhase = useCallback((newPhase: AppPhase, updateState?: () => void) => {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 250,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      useNativeDriver: true,
    }).start(() => {
      if (updateState) updateState();
      setPhase(newPhase);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
        useNativeDriver: true,
      }).start();
    });
  }, [fadeAnim]);

  // Use a ref so circle button always has the latest urlInput without stale closure
  const urlInputRef = useRef('');
  useEffect(() => {
    urlInputRef.current = urlInput;
  }, [urlInput]);

  const platform = detectPlatform(urlInput);

  // ── Colors based on active platform ──────────────────────────────────────
  const getPlatformColors = () => {
    if (platform === 'instagram') return { primary: '#E1306C', glow: 'rgba(225,48,108,0.25)', glowLight: 'rgba(225,48,108,0.08)' };
    if (platform === 'pinterest') return { primary: '#E60023', glow: 'rgba(230,0,35,0.25)', glowLight: 'rgba(230,0,35,0.08)' };
    if (platform === 'twitter')   return { primary: '#1D9BF0', glow: 'rgba(29,155,240,0.25)', glowLight: 'rgba(29,155,240,0.08)' };
    if (urlInput.trim().length > 0) return { primary: '#FF9F0A', glow: 'rgba(255,159,10,0.25)', glowLight: 'rgba(255,159,10,0.08)' };
    return { primary: '#333333', glow: 'rgba(255,255,255,0.06)', glowLight: 'rgba(255,255,255,0.02)' };
  };

  const themeColors = getPlatformColors();

  const btnBgColor = buttonColorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [themeColors.primary, '#34C759'],
  });

  // ── Breathing / Pulsing event horizon animation ─────────────────────────
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.15, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [pulseAnim]);

  // ── Video player ─────────────────────────────────────────────────────────
  const videoPlayer = useVideoPlayer('', p => {
    p.loop = true;
    p.timeUpdateEventInterval = 0.25;
  });

  const playingEvent = useEvent(videoPlayer, 'playingChange', { isPlaying: videoPlayer.playing });
  const isPlaying = playingEvent ? playingEvent.isPlaying : videoPlayer.playing;

  const timeUpdateEvent = useEvent(videoPlayer, 'timeUpdate', {
    currentTime: videoPlayer.currentTime,
    currentLiveTimestamp: null,
    currentOffsetFromLive: null,
    bufferedPosition: 0,
  });
  const currentTime = timeUpdateEvent ? timeUpdateEvent.currentTime : videoPlayer.currentTime;

  const mutedEvent = useEvent(videoPlayer, 'mutedChange', { muted: videoPlayer.muted });
  const isMuted = mutedEvent ? mutedEvent.muted : videoPlayer.muted;

  const showControlsAndResetTimeout = useCallback((forcePlaying?: boolean) => {
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    setControlsActive(true);
    Animated.timing(controlsOpacity, {
      toValue: 1,
      duration: 250,
      useNativeDriver: true,
    }).start();

    const isActuallyPlaying = forcePlaying !== undefined ? forcePlaying : videoPlayer.playing;
    if (isActuallyPlaying) {
      controlsTimeoutRef.current = setTimeout(() => {
        setControlsActive(false);
        Animated.timing(controlsOpacity, {
          toValue: 0,
          duration: 350,
          useNativeDriver: true,
        }).start();
      }, 2000);
    }
  }, [videoPlayer, controlsOpacity]);

  useEffect(() => {
    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, []);

  // Sync controls visibility with playback state
  useEffect(() => {
    if (isPlaying) {
      showControlsAndResetTimeout(true);
    } else {
      setControlsActive(true);
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
      Animated.timing(controlsOpacity, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }
  }, [isPlaying, showControlsAndResetTimeout, controlsOpacity]);

  const togglePlayPause = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const nextPlaying = !isPlaying;
    if (isPlaying) {
      videoPlayer.pause();
    } else {
      videoPlayer.play();
    }
    showControlsAndResetTimeout(nextPlaying);
  }, [isPlaying, videoPlayer, showControlsAndResetTimeout]);

  const toggleMute = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    videoPlayer.muted = !videoPlayer.muted;
    showControlsAndResetTimeout(isPlaying);
  }, [videoPlayer, isPlaying, showControlsAndResetTimeout]);

  const toggleLoop = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const nextLoop = !isLooping;
    setIsLooping(nextLoop);
    videoPlayer.loop = nextLoop;
    showControlsAndResetTimeout(isPlaying);
  }, [isLooping, isPlaying, videoPlayer, showControlsAndResetTimeout]);

  const handleVideoPress = useCallback(() => {
    if (!controlsActive) {
      showControlsAndResetTimeout(isPlaying);
    } else {
      setControlsActive(false);
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
      Animated.timing(controlsOpacity, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }
  }, [controlsActive, isPlaying, showControlsAndResetTimeout]);

  const skipBackward = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    videoPlayer.currentTime = Math.max(0, videoPlayer.currentTime - 5);
    showControlsAndResetTimeout(isPlaying);
  }, [videoPlayer, isPlaying, showControlsAndResetTimeout]);

  const skipForward = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    videoPlayer.currentTime = Math.min(videoPlayer.duration, videoPlayer.currentTime + 5);
    showControlsAndResetTimeout(isPlaying);
  }, [videoPlayer, isPlaying, showControlsAndResetTimeout]);

  const handleSeek = useCallback((event: any) => {
    const { locationX } = event.nativeEvent;
    const duration = videoPlayer.duration || 0;
    if (seekerWidthRef.current > 0 && duration > 0) {
      const newPct = Math.max(0, Math.min(1, locationX / seekerWidthRef.current));
      videoPlayer.currentTime = newPct * duration;
      showControlsAndResetTimeout(isPlaying);
    }
  }, [videoPlayer, isPlaying, showControlsAndResetTimeout]);

  // Reset activeIndex when carouselItems length changes
  useEffect(() => {
    setActiveIndex(0);
  }, [carouselItems.length]);

  const handleScroll = useCallback((event: any) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const interval = CARD_WIDTH + CARD_GAP;
    const index = Math.round(offsetX / interval);
    const clampedIndex = Math.max(0, Math.min(carouselItems.length - 1, index));
    if (clampedIndex !== activeIndex) {
      setActiveIndex(clampedIndex);
    }
  }, [activeIndex, carouselItems.length]);



  useEffect(() => {
    if (singleResult?.type === 'video' && singleResult.url) {
      videoPlayer.replace(singleResult.url);
      videoPlayer.play();
    } else if (carouselItems.length > 0) {
      const activeItem = carouselItems[activeIndex];
      if (activeItem && activeItem.type === 'video') {
        videoPlayer.replace(activeItem.url);
        videoPlayer.play();
      } else {
        videoPlayer.pause();
      }
    } else {
      videoPlayer.pause();
    }
  }, [singleResult, carouselItems, activeIndex, videoPlayer]);

  // ── When urlInput changes while viewing result → reset to idle ───────────
  const prevUrlRef = useRef('');
  useEffect(() => {
    if (prevUrlRef.current !== urlInput && phase === 'result') {
      transitionToPhase('idle', () => {
        setSingleResult(null);
        setCarouselItems([]);
        setErrorMsg('');
      });
    }
    prevUrlRef.current = urlInput;
  }, [urlInput, phase, transitionToPhase]);

  // ── Clipboard auto-detect ────────────────────────────────────────────────
  const checkClipboard = useCallback(async () => {
    try {
      const text = await Clipboard.getStringAsync();
      if (!text?.trim()) return;
      const p = detectPlatform(text.trim());
      if (p && text.trim() !== urlInputRef.current) {
        setUrlInput(text.trim());
      }
    } catch {
      /* ignore */
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      checkClipboard();
    }, [checkClipboard])
  );

  // ── Extract ──────────────────────────────────────────────────────────────
  const handleExtract = useCallback(async (overrideUrl?: string) => {
    const activeUrl = (overrideUrl ?? urlInputRef.current).trim();
    const activePlatform = detectPlatform(activeUrl);

    if (!activeUrl || !activePlatform) {
      Alert.alert('No link', 'Copy any Instagram, Pinterest, or Twitter/X link first.');
      return;
    }

    setPhase('loading');
    setSingleResult(null);
    setCarouselItems([]);
    setErrorMsg('');

    try {
      let extractedSingle: {
        type: 'video' | 'image';
        url: string;
        thumbnail?: string;
        hlsNote?: string;
        title?: string;
      } | null = null;
      let extractedCarousel: CarouselItem[] = [];

      if (activePlatform === 'instagram') {
        const ig: IgExtractResult = await extractInstagram(activeUrl);
        if (ig.type === 'carousel') {
          extractedCarousel = ig.items.map((item, i) => ({ ...item, index: i, selected: false }));
          setCarouselItems(extractedCarousel);
        } else {
          extractedSingle = { type: ig.items[0].type as 'video' | 'image', url: ig.items[0].url, thumbnail: ig.items[0].thumbnail };
          setSingleResult(extractedSingle);
        }
      } else if (activePlatform === 'twitter') {
        const tw: TwExtractResult = await extractTwitter(activeUrl);
        if (tw.items.length > 1) {
          extractedCarousel = tw.items.map((item, i) => ({ ...item, index: i, selected: false }));
          setCarouselItems(extractedCarousel);
        } else if (tw.items.length === 1) {
          extractedSingle = { type: tw.items[0].type as 'video' | 'image', url: tw.items[0].url, thumbnail: tw.items[0].thumbnail };
          setSingleResult(extractedSingle);
        } else {
          throw new Error('Twitter: no media found in this tweet.');
        }
      } else if (activePlatform === 'pinterest') {
        const pt: PtExtractResult = await extractPinterest(activeUrl);
        if (pt.type === 'video_hls') {
          extractedSingle = { type: 'image', url: pt.thumbnail ?? '', thumbnail: pt.thumbnail, hlsNote: pt.hlsNote };
        } else {
          extractedSingle = { type: pt.type as 'video' | 'image', url: pt.url ?? '', thumbnail: pt.thumbnail };
        }
        setSingleResult(extractedSingle);
      } else {
        throw new Error('Unsupported platform');
      }

      setHistory(prev => {
        const filtered = prev.filter(h => h.url !== activeUrl);
        return [
          { url: activeUrl, platform: activePlatform, singleResult: extractedSingle, carouselItems: extractedCarousel },
          ...filtered,
        ].slice(0, 20);
      });

      transitionToPhase('result');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      transitionToPhase('error', () => { setErrorMsg(e?.message ?? 'Something went wrong'); });
    }
  }, [transitionToPhase]);

  // ── Download ─────────────────────────────────────────────────────────────
  const doDownload = useCallback(async (url: string, type: 'video' | 'image' | 'audio') => {
    if (!url || downloadSuccess) return;
    setDownloading(true);
    setProgress(null);
    const result = await downloadMedia(url, type, p => setProgress(p));
    setDownloading(false);
    setProgress(null);
    if (result.ok) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setDownloadSuccess(true);
      Animated.timing(buttonColorAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: false,
      }).start();

      setTimeout(() => {
        Animated.timing(buttonColorAnim, {
          toValue: 0,
          duration: 500,
          useNativeDriver: false,
        }).start(() => {
          setDownloadSuccess(false);
        });
      }, 9500); // 10s total cooldown
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Download failed', result.error ?? 'Unknown error');
    }
  }, [downloadSuccess]);

  const downloadCarouselSelected = useCallback(async () => {
    const selected = carouselItems.filter(i => i.selected);
    if (!selected.length || downloadSuccess) {
      Alert.alert('Select items first');
      return;
    }
    setDownloading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    let successCount = 0;
    for (const item of selected) {
      const res = await downloadMedia(item.url, item.type, p => setProgress(p));
      if (res.ok) successCount++;
    }
    setDownloading(false);
    setProgress(null);

    if (successCount > 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setDownloadSuccess(true);
      Animated.timing(buttonColorAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: false,
      }).start();

      setTimeout(() => {
        Animated.timing(buttonColorAnim, {
          toValue: 0,
          duration: 500,
          useNativeDriver: false,
        }).start(() => {
          setDownloadSuccess(false);
        });
      }, 9500); // 10s total cooldown
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Download failed', 'None of the selected items could be downloaded.');
    }
  }, [carouselItems, downloadSuccess]);

  const allSelected = carouselItems.length > 0 && carouselItems.every(i => i.selected);
  const selectedCount = carouselItems.filter(i => i.selected).length;

  const toggleSelectAll = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCarouselItems(prev => prev.map(i => ({ ...i, selected: !allSelected })));
  }, [allSelected]);

  const reset = useCallback(() => {
    transitionToPhase('idle', () => {
      setSingleResult(null);
      setCarouselItems([]);
      setErrorMsg('');
      setDownloading(false);
      setProgress(null);
      setDownloadSuccess(false);
      buttonColorAnim.setValue(0);
      setControlsActive(true);
      controlsOpacity.setValue(1);
    });
  }, [transitionToPhase, controlsOpacity]);

  // ── Circle button handler — reads from ref ───────────────────────────────
  const handleCirclePress = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const text = (await Clipboard.getStringAsync())?.trim();
      const isNewLinkValid = text && detectPlatform(text);

      if (isNewLinkValid && text !== urlInputRef.current) {
        // If there's a new valid link in the clipboard, update state and extract it
        setUrlInput(text);
        handleExtract(text);
      } else if (urlInputRef.current && detectPlatform(urlInputRef.current)) {
        // No new link on clipboard, but current text in input is valid
        handleExtract(urlInputRef.current);
      } else if (isNewLinkValid) {
        // Clipboard link is valid but matches current input, just extract it
        handleExtract(text);
      } else {
        Alert.alert('No valid link', 'Copy any supported link first.');
      }
    } catch {
      // Fallback
      if (urlInputRef.current && detectPlatform(urlInputRef.current)) {
        handleExtract(urlInputRef.current);
      } else {
        Alert.alert('No valid link', 'Copy any supported link first.');
      }
    }
  }, [handleExtract]);

  // ── Render Helpers ───────────────────────────────────────────────────────
  const isIdle = phase === 'idle' || phase === 'error';
  const isResult = phase === 'result';
  const isLoading = phase === 'loading';

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />

      {/* ═══ CUSTOM IMMERSIVE HEADER ═══ */}
      <View style={s.header}>
        {isResult ? (
          <Pressable style={s.headerLeft} onPress={reset} hitSlop={12}>
            <Ionicons name="chevron-back" size={24} color="#FF9F0A" />
            <Text style={s.headerBackText}>Back</Text>
          </Pressable>
        ) : (
          <Pressable style={s.headerLeft} onPress={() => setInfoVisible(true)} hitSlop={12}>
            <Ionicons name="information-circle-outline" size={24} color="#8E8E93" />
          </Pressable>
        )}

        <Text style={s.headerTitle}>{isResult ? 'PREVIEW' : 'ANYFETCH'}</Text>

        {!isResult && (
          <Pressable
            style={s.headerRight}
            onPress={() => navigation.navigate('Settings')}
            hitSlop={12}>
            <Ionicons name="settings-outline" size={22} color="#8E8E93" />
          </Pressable>
        )}
        {isResult && <View style={s.headerRightDummy} />}
      </View>

      <Animated.View style={[s.mainWrapper, { opacity: fadeAnim }]}>
        {/* ═══ IDLE / INPUT PHASE ═══ */}
        {(isIdle || isLoading) && (
          <ScrollView
            style={s.idleContainer}
            contentContainerStyle={s.idleContent}
            scrollEnabled={false}
            keyboardShouldPersistTaps="handled">

            {/* Main Visual: Pulsing Black Hole Circular Button */}
            <View style={s.centerSection}>
              <View style={s.circleWrapper}>
                {/* Outer pulsing ring 2 */}
                <Animated.View
                  style={[
                    s.pulseRing,
                    {
                      borderColor: themeColors.primary,
                      backgroundColor: themeColors.glowLight,
                      transform: [
                        {
                          scale: pulseAnim.interpolate({
                            inputRange: [1, 1.15],
                            outputRange: [1, 1.45],
                          }),
                        },
                      ],
                      opacity: pulseAnim.interpolate({
                        inputRange: [1, 1.15],
                        outputRange: [0.25, 0],
                      }),
                    },
                  ]}
                />
                {/* Outer pulsing ring 1 */}
                <Animated.View
                  style={[
                    s.pulseRing,
                    {
                      borderColor: themeColors.primary,
                      backgroundColor: themeColors.glow,
                      transform: [
                        {
                          scale: pulseAnim.interpolate({
                            inputRange: [1, 1.15],
                            outputRange: [1, 1.25],
                          }),
                        },
                      ],
                      opacity: pulseAnim.interpolate({
                        inputRange: [1, 1.15],
                        outputRange: [0.45, 0.05],
                      }),
                    },
                  ]}
                />

                {/* Main Action Circle */}
                <Pressable
                  style={[
                    s.circleButton,
                    {
                      borderColor: themeColors.primary,
                      shadowColor: themeColors.primary,
                    },
                  ]}
                  onPress={handleCirclePress}
                  android_ripple={{ color: 'rgba(255,255,255,0.1)', borderless: true }}>
                  {isLoading ? (
                    <ActivityIndicator size="large" color="#FFFFFF" />
                  ) : (
                    <Ionicons
                      name="cloud-download"
                      size={48}
                      color={urlInput.trim().length > 0 ? themeColors.primary : '#FFFFFF'}
                    />
                  )}
                </Pressable>
              </View>

              <Text style={s.centerHint}>
                {platform
                  ? `Tap to fetch ${platform}`
                  : urlInput.trim().length > 0
                    ? 'Tap to process link'
                    : 'Copy link & tap circle'}
              </Text>
            </View>

            {/* Input Box Card */}
            <View style={s.inputContainer}>
              <View style={s.inputCard}>
                <Ionicons
                  name={
                    platform === 'instagram'
                      ? 'logo-instagram'
                      : platform === 'pinterest'
                        ? 'logo-pinterest'
                        : platform === 'twitter'
                          ? 'logo-twitter'
                          : 'link-outline'
                  }
                  size={20}
                  color={themeColors.primary}
                  style={s.inputIcon}
                />
                <TextInput
                  style={s.input}
                  placeholder="Paste Instagram, Pinterest, or Twitter/X link..."
                  placeholderTextColor="#5E5E62"
                  value={urlInput}
                  onChangeText={setUrlInput}
                  editable={!isLoading}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="go"
                  onSubmitEditing={() => handleExtract(urlInput)}
                />
                {urlInput.length > 0 ? (
                  <TouchableOpacity onPress={() => setUrlInput('')} hitSlop={12}>
                    <Ionicons name="close-circle" size={20} color="#5E5E62" />
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    onPress={async () => {
                      const t = (await Clipboard.getStringAsync())?.trim();
                      if (t) setUrlInput(t);
                    }}
                    hitSlop={12}
                    style={s.pasteBadge}>
                    <Ionicons name="clipboard-outline" size={16} color="#8E8E93" />
                    <Text style={s.pasteBadgeTxt}>PASTE</Text>
                  </TouchableOpacity>
                )}
              </View>

              {phase === 'error' && <Text style={s.errorText} numberOfLines={3}>{errorMsg}</Text>}
            </View>

            {/* Recent History section */}
            {history.length > 0 && (
              <View style={s.historySection}>
                {/* Filter chips */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterChipsRow}>
                  {(['all','instagram','twitter','pinterest'] as HistoryFilter[]).map(f => {
                    const labels: Record<HistoryFilter, string> = {
                      all: 'All', instagram: 'Instagram',
                      twitter: 'Twitter', pinterest: 'Pinterest'
                    };
                    const active = historyFilter === f;
                    const hasItems = f === 'all' ? history.length > 0 : history.some(h => h.platform === f);
                    if (!hasItems) return null;
                    return (
                      <Pressable
                        key={f}
                        style={[s.filterChip, active && { backgroundColor: themeColors.primary, borderColor: themeColors.primary }]}
                        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setHistoryFilter(f); }}>
                        <Text style={[s.filterChipTxt, active && { color: '#000' }]}>{labels[f]}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>

                {/* Unified history row */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.historyRow}>
                  {history
                    .filter(item => historyFilter === 'all' || item.platform === historyFilter)
                    .map((item, idx) => {
                      const firstItem = item.singleResult ?? item.carouselItems?.[0];
                      const thumb = firstItem?.thumbnail ?? firstItem?.url;
                      const badgeColors: Record<string, string> = {
                        instagram: '#E1306C', twitter: '#1D9BF0', pinterest: '#E60023'
                      };
                      const iconNames: Record<string, any> = {
                        instagram: 'logo-instagram', twitter: 'logo-twitter', pinterest: 'logo-pinterest'
                      };
                      return (
                        <View key={item.url + idx} style={s.historyCardContainer}>
                          <Pressable
                            style={s.historyCard}
                            onPress={() => {
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                              transitionToPhase('result', () => {
                                setUrlInput(item.url);
                                setSingleResult(item.singleResult);
                                setCarouselItems(item.carouselItems);
                              });
                            }}>
                            {thumb ? (
                              <Image source={{ uri: thumb }} style={s.historyThumb} />
                            ) : (
                              <View style={s.historyPlaceholder}>
                                <Ionicons name={iconNames[item.platform] ?? 'link-outline'} size={20} color="#48484A" />
                              </View>
                            )}
                            <View style={[s.historyPlatformBadge, { backgroundColor: badgeColors[item.platform] ?? '#FF9F0A' }]}>
                              <Ionicons name={iconNames[item.platform] ?? 'link-outline'} size={10} color="#FFFFFF" />
                            </View>
                          </Pressable>
                          <Pressable
                            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setHistory(prev => prev.filter(h => h.url !== item.url)); }}
                            hitSlop={12}
                            style={s.historyDeleteBtn}>
                            <Ionicons name="close" size={12} color="#FFFFFF" />
                          </Pressable>
                        </View>
                      );
                    })}
                </ScrollView>
              </View>
            )}
          </ScrollView>
        )}

        {/* ═══ RESULT PHASE ═══ */}
        {isResult && (
          <ScrollView
            style={s.resultScroll}
            contentContainerStyle={s.resultContent}
            showsVerticalScrollIndicator={false}>
            {/* Media Preview Container (Single Result or Swiper Carousel) */}
            {singleResult && (
              <View style={s.mediaContainer}>
                <View style={s.mediaCard}>
                  {singleResult.type === 'video' ? (
                    <View style={s.videoWrapper}>
                      <VideoView
                        player={videoPlayer}
                        style={s.mediaPrev}
                        nativeControls={false}
                        contentFit="contain"
                      />

                      {/* Transparent overlay covering the whole video to capture taps on Android */}
                      <Pressable style={StyleSheet.absoluteFill} onPress={handleVideoPress} />

                      {/* Custom Controls Overlay */}
                      <Animated.View
                        style={[s.controlsOverlay, { opacity: controlsOpacity }]}
                        pointerEvents={controlsActive ? 'box-none' : 'none'}
                      >
                        <View style={s.centerControlsRow}>
                          <TouchableOpacity onPress={skipBackward} style={s.iconButton}>
                            <Ionicons name="play-back-outline" size={20} color="#FFFFFF" />
                            <Text style={s.skipText}>5s</Text>
                          </TouchableOpacity>

                          <TouchableOpacity onPress={togglePlayPause} style={s.glassPlayBtn}>
                            <Ionicons name={isPlaying ? "pause" : "play"} size={28} color="#FFFFFF" />
                          </TouchableOpacity>

                          <TouchableOpacity onPress={skipForward} style={s.iconButton}>
                            <Ionicons name="play-forward-outline" size={20} color="#FFFFFF" />
                            <Text style={s.skipText}>5s</Text>
                          </TouchableOpacity>
                        </View>

                        <View style={s.bottomControlsPanel}>
                          <Pressable
                            style={s.seekerContainer}
                            onLayout={(e) => {
                              seekerWidthRef.current = e.nativeEvent.layout.width;
                            }}
                            onPress={handleSeek}
                          >
                            <View style={s.seekerBg} pointerEvents="none">
                              <View style={[s.seekerFill, { width: `${(videoPlayer.duration > 0 ? (currentTime || 0) / videoPlayer.duration : 0) * 100}%` }]} />
                              <View style={[s.seekerKnob, { left: `${(videoPlayer.duration > 0 ? (currentTime || 0) / videoPlayer.duration : 0) * 100}%` }]} />
                            </View>
                          </Pressable>

                          <View style={s.bottomPanelMetaRow}>
                            <Text style={s.timeText}>
                              {formatTime(currentTime)} • {formatTime(videoPlayer.duration)}
                            </Text>

                            <View style={s.rightActionsRow}>
                              <TouchableOpacity onPress={toggleMute} style={s.glassControlBtn}>
                                <Ionicons name={isMuted ? "volume-mute" : "volume-high"} size={14} color="#FFFFFF" />
                              </TouchableOpacity>

                              <TouchableOpacity 
                                onPress={toggleLoop} 
                                style={[
                                  s.glassControlBtn, 
                                  isLooping && { backgroundColor: themeColors.primary, borderColor: themeColors.primary }
                                ]}
                              >
                                <Ionicons name="repeat" size={14} color={isLooping ? "#000000" : "#FFFFFF"} />
                              </TouchableOpacity>
                            </View>
                          </View>
                        </View>
                      </Animated.View>
                    </View>
                  ) : singleResult.thumbnail ? (
                    <Image
                      source={{ uri: singleResult.thumbnail }}
                      style={s.mediaPrev}
                      resizeMode="cover"
                    />
                  ) : null}
                </View>



                {/* Title chip for YouTube / generic */}
                {singleResult.title ? (
                  <View style={s.titleBox}>
                    <Ionicons name="musical-notes-outline" size={14} color="#8E8E93" />
                    <Text style={s.titleTxt} numberOfLines={2}>{singleResult.title}</Text>
                  </View>
                ) : null}

                {singleResult.hlsNote ? (
                  <View style={s.hlsBox}>
                    <Ionicons name="alert-circle-outline" size={18} color="#FF9F0A" />
                    <Text style={s.hlsTxt}>{singleResult.hlsNote}</Text>
                  </View>
                ) : downloading ? (
                  <ProgressBar progress={progress} />
                ) : (
                  <Pressable
                    style={{ width: '100%' }}
                    disabled={downloading || downloadSuccess}
                    onPress={() => {
                      doDownload(singleResult.url, singleResult.type);
                    }}>
                    <Animated.View style={[s.mainDlBtn, { backgroundColor: btnBgColor }]}>
                      <Ionicons
                        name={downloadSuccess ? 'checkmark-circle' : 'download'}
                        size={18}
                        color={downloadSuccess ? '#FFFFFF' : '#000000'}
                        style={s.mainDlBtnIcon}
                      />
                      <Text style={[s.mainDlBtnTxt, downloadSuccess && { color: '#FFFFFF' }]}>
                        {downloadSuccess ? 'Completed' : 'Download Media'}
                      </Text>
                    </Animated.View>
                  </Pressable>
                )}
              </View>
            )}

            {carouselItems.length > 0 && (
              <View style={s.carouselSwiperContainer}>
                <FlatList
                  data={carouselItems}
                  horizontal
                  pagingEnabled={false}
                  decelerationRate="fast"
                  snapToInterval={CARD_WIDTH + CARD_GAP}
                  snapToAlignment="center"
                  contentContainerStyle={{ paddingHorizontal: CARD_PADDING }}
                  showsHorizontalScrollIndicator={false}
                  keyExtractor={item => String(item.index)}
                  onScroll={Animated.event(
                    [{ nativeEvent: { contentOffset: { x: scrollX } } }],
                    { useNativeDriver: false, listener: handleScroll }
                  )}
                  scrollEventThrottle={16}
                  renderItem={({ item }) => (
                    <View style={s.swiperCard}>
                      {item.type === 'video' ? (
                        item.index === activeIndex ? (
                          <View style={[s.videoWrapper, { height: '100%' }]}>
                            <Pressable style={{ flex: 1 }} onPress={togglePlayPause}>
                              <VideoView
                                player={videoPlayer}
                                style={[s.mediaPrev, { height: '100%' }]}
                                nativeControls={false}
                                contentFit="contain"
                              />
                            </Pressable>

                            {/* Center Play Overlay when Paused */}
                            {!isPlaying && (
                              <Pressable style={s.swiperPlayOverlay} onPress={togglePlayPause}>
                                <Ionicons name="play" size={44} color="rgba(255, 255, 255, 0.85)" />
                              </Pressable>
                            )}

                            {/* Volume Button Overlay */}
                            <TouchableOpacity
                              style={s.swiperVolumeBtn}
                              onPress={toggleMute}
                              activeOpacity={0.7}
                            >
                              <Ionicons
                                name={isMuted ? "volume-mute" : "volume-high"}
                                size={16}
                                color="#FFFFFF"
                              />
                            </TouchableOpacity>
                          </View>
                        ) : (
                          <View style={s.inactiveVideoWrapper}>
                            <Image
                              source={{ uri: item.thumbnail || item.url }}
                              style={[s.mediaPrev, { height: '100%' }]}
                              resizeMode="cover"
                            />
                            <View style={s.inactivePlayOverlay}>
                              <Ionicons name="play" size={40} color="rgba(255, 255, 255, 0.85)" />
                            </View>
                          </View>
                        )
                      ) : (
                        <Image
                          source={{ uri: item.url }}
                          style={[s.mediaPrev, { height: '100%' }]}
                          resizeMode="contain"
                        />
                      )}

                      {/* Slide Counter Overlay */}
                      <View style={s.slideCounter}>
                        <Text style={s.slideCounterText}>{item.index + 1} / {carouselItems.length}</Text>
                      </View>

                      {/* Selection Check Circle Overlay */}
                      <Pressable
                        style={s.slideSelectBadge}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setCarouselItems(prev =>
                            prev.map(i => (i.index === item.index ? { ...i, selected: !i.selected } : i))
                          );
                        }}
                      >
                        <Ionicons
                          name={item.selected ? 'checkmark-circle' : 'ellipse-outline'}
                          size={24}
                          color={item.selected ? themeColors.primary : '#FFFFFF'}
                        />
                      </Pressable>
                    </View>
                  )}
                />

                {/* Standard Pagination Dots */}
                <View style={s.dotsContainer}>
                  {carouselItems.map((_, idx) => {
                    const dotWidth = scrollX.interpolate({
                      inputRange: [
                        (idx - 1) * (CARD_WIDTH + CARD_GAP),
                        idx * (CARD_WIDTH + CARD_GAP),
                        (idx + 1) * (CARD_WIDTH + CARD_GAP),
                      ],
                      outputRange: [6, 14, 6],
                      extrapolate: 'clamp',
                    });

                    const dotOpacity = scrollX.interpolate({
                      inputRange: [
                        (idx - 1) * (CARD_WIDTH + CARD_GAP),
                        idx * (CARD_WIDTH + CARD_GAP),
                        (idx + 1) * (CARD_WIDTH + CARD_GAP),
                      ],
                      outputRange: [0.35, 1, 0.35],
                      extrapolate: 'clamp',
                    });

                    return (
                      <Animated.View
                        key={idx}
                        style={[
                          s.dot,
                          {
                            width: dotWidth,
                            opacity: dotOpacity,
                            backgroundColor: themeColors.primary,
                          }
                        ]}
                      />
                    );
                  })}
                </View>
              </View>
            )}

            {/* Carousel Section Actions */}
            {carouselItems.length > 0 && (
              <View style={s.carouselSection}>
                {downloading ? (
                  <ProgressBar progress={progress} />
                ) : (
                  <View style={s.carouselActions}>
                    <Pressable
                      style={[s.actionBtn, s.actionBtnOutline]}
                      onPress={toggleSelectAll}>
                      <Ionicons 
                        name={allSelected ? "close-circle-outline" : "checkmark-done"} 
                        size={16} 
                        color="#FFFFFF" 
                        style={s.actionBtnIcon} 
                      />
                      <Text style={s.actionBtnOutlineTxt}>
                        {allSelected ? "Deselect All" : "Select All"}
                      </Text>
                    </Pressable>

                    <Pressable
                      style={{ flex: 1 }}
                      disabled={downloading || downloadSuccess || selectedCount === 0}
                      onPress={() => {
                        if (selectedCount === 0) {
                          Alert.alert('Select items first');
                          return;
                        }
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        downloadCarouselSelected();
                      }}>
                      <Animated.View
                        style={[
                          s.actionBtn,
                          selectedCount === 0 && { backgroundColor: '#3A3A3C', shadowColor: 'transparent' },
                          selectedCount > 0 && { backgroundColor: btnBgColor }
                        ]}
                      >
                        <Ionicons
                          name={downloadSuccess ? "checkmark-circle" : "download"}
                          size={16}
                          color={selectedCount === 0 ? "#8E8E93" : (downloadSuccess ? "#FFFFFF" : "#000000")}
                          style={s.actionBtnIcon}
                        />
                        <Text
                          style={[
                            s.actionBtnTxt,
                            selectedCount === 0 && { color: '#8E8E93' },
                            downloadSuccess && { color: '#FFFFFF' }
                          ]}
                        >
                          {downloadSuccess 
                            ? "Completed" 
                            : (selectedCount > 0 ? `Download (${selectedCount})` : "Download")}
                        </Text>
                      </Animated.View>
                    </Pressable>
                  </View>
                )}
              </View>
            )}
          </ScrollView>
        )}
      </Animated.View>

      {/* ═══ INFORMATION MODAL ═══ */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={infoVisible}
        onRequestClose={() => setInfoVisible(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>ANYFETCH</Text>
            <Text style={s.modalSub}>Universal Media Downloader</Text>
            <View style={s.modalDivider} />
            <Text style={s.modalDesc}>
              Download videos & images from Instagram, Pinterest, and Twitter/X.
            </Text>
            <Text style={s.modalInstructions}>
              1. Copy any supported link.{"\n"}
              2. Open Anyfetch — clipboard is auto-read.{"\n"}
              3. Tap the glowing circle to preview.{"\n"}
              4. Tap Download to save locally.
            </Text>
            <Pressable style={s.modalCloseBtn} onPress={() => setInfoVisible(false)}>
              <Text style={s.modalCloseTxt}>Dismiss</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function ProgressBar({ progress }: { progress: DownloadProgress | null }) {
  const pct = Math.round((progress?.fraction ?? 0) * 100);
  const animWidth = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(animWidth, {
      toValue: progress?.fraction ?? 0,
      duration: 350,
      useNativeDriver: false,
    }).start();
  }, [progress?.fraction]);

  const widthStyle = animWidth.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={s.progWrap}>
      <View style={s.progInfoRow}>
        <Text style={s.progTxt}>Downloading...</Text>
        <Text style={s.progTxt}>{pct}%</Text>
      </View>
      <View style={s.progBg}>
        <Animated.View style={[s.progFill, { width: widthStyle }]} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  mainWrapper: { flex: 1 },

  // Header styling
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginTop: Platform.OS === 'android' ? StatusBar.currentHeight ?? 24 : 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 64,
  },
  headerBackText: {
    color: '#FF9F0A',
    fontSize: 15,
    marginLeft: 4,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 4,
    textAlign: 'center',
  },
  headerRight: {
    minWidth: 64,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  headerRightDummy: {
    width: 64,
  },

  // Idle state layout
  idleContainer: { flex: 1 },
  idleContent: {
    paddingHorizontal: 24,
    paddingTop: H * 0.06,
    paddingBottom: 48,
    alignItems: 'center' as const,
    gap: 28,
  },
  scrollContainer: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: H * 0.06,
    paddingBottom: 48,
    alignItems: 'center' as const,
    gap: 36,
  },

  // History filter chips
  filterChipsRow: {
    flexDirection: 'row' as const,
    gap: 8,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  filterChip: {
    borderWidth: 1,
    borderColor: '#3A3A3C',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: '#1C1C1E',
  },
  filterChipTxt: {
    color: '#AEAEB2',
    fontSize: 12,
    fontWeight: '600' as const,
    letterSpacing: 0.3,
  },

  // YouTube quality chips
  ytControlsBox: {
    width: '100%',
    marginTop: 4,
    marginBottom: 2,
    paddingHorizontal: 4,
  },
  ytControlsLabel: {
    color: '#636366',
    fontSize: 10,
    fontWeight: '700' as const,
    letterSpacing: 1.2,
    marginBottom: 8,
    marginLeft: 2,
  },
  ytChipRow: {
    flexDirection: 'row' as const,
    gap: 8,
    flexWrap: 'wrap' as const,
  },
  ytChip: {
    borderWidth: 1,
    borderColor: '#3A3A3C',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: '#1C1C1E',
  },
  ytChipTxt: {
    color: '#AEAEB2',
    fontSize: 13,
    fontWeight: '600' as const,
  },

  // YouTube thumbnail preview badge
  ytThumbBadge: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center' as const,
    justifyContent: 'flex-end' as const,
    paddingBottom: 16,
  },
  ytPlayBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  ytPlayBadgeTxt: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600' as const,
  },

  // Title display (YouTube / generic)
  titleBox: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: 6,
    backgroundColor: '#1C1C1E',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 4,
    width: '100%',
  },
  titleTxt: {
    color: '#AEAEB2',
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },

  // Central Section
  centerSection: {
    alignItems: 'center',
    marginVertical: 12,
  },
  circleWrapper: {
    width: 220,
    height: 220,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseRing: {
    position: 'absolute',
    width: 170,
    height: 170,
    borderRadius: 85,
    borderWidth: 1.5,
  },
  circleButton: {
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: '#0A0A0A',
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerHint: {
    color: '#8E8E93',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginTop: 24,
  },

  // Input Box Card
  inputContainer: {
    width: '100%',
    gap: 12,
  },
  inputCard: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1C1E',
    borderRadius: 14,
    paddingHorizontal: 16,
    height: 56,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15,
  },
  pasteBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2C2C2E',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  pasteBadgeTxt: {
    color: '#8E8E93',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  errorText: {
    color: '#FF453A',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 16,
  },

  // Recent History section
  historySection: {
    width: '100%',
    marginTop: 12,
  },
  historyLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#48484A',
    letterSpacing: 1.5,
    marginBottom: 12,
  },
  historyRow: {
    gap: 12,
    paddingRight: 16,
  },
  historyCardContainer: {
    position: 'relative',
    paddingTop: 6,
    paddingRight: 6,
    marginRight: 8,
  },
  historyCard: {
    width: 68,
    height: 68,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#1C1C1E',
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  historyThumb: {
    width: '100%',
    height: '100%',
  },
  historyPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyPlatformBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 6,
    padding: 3,
  },
  historyDeleteBtn: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: '#2C2C2E',
    borderRadius: 11,
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#000000',
    zIndex: 10,
    elevation: 3,
  },

  // ── Result State ──────────────────────────────────────────────────────────
  resultScroll: { flex: 1 },
  resultContent: {
    paddingHorizontal: 0,
    paddingTop: 16,
    paddingBottom: 48,
    gap: 24,
  },
  mediaContainer: {
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 20,
    gap: 20,
  },
  mediaCard: {
    width: '100%',
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#0F0F10',
    borderWidth: 1,
    borderColor: '#1C1C1E',
    alignItems: 'center',
  },
  mediaPrev: {
    width: '100%',
    height: W * 1.15,
    backgroundColor: '#000000',
  },
  hlsBox: {
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    padding: 14,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  hlsTxt: {
    color: '#8E8E93',
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },
  mainDlBtn: {
    backgroundColor: '#FF9F0A',
    borderRadius: 14,
    height: 56,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#FF9F0A',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  mainDlBtnIcon: { marginRight: 8 },
  mainDlBtnTxt: { color: '#000000', fontWeight: '800', fontSize: 16 },

  // Carousel sections
  carouselSection: {
    gap: 14,
    marginTop: 8,
    paddingHorizontal: 20,
  },
  carouselHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  carouselLabel: {
    color: '#8E8E93',
    fontSize: 12,
    fontWeight: '500',
  },
  carouselList: {
    paddingRight: 16,
  },
  carouselCell: {
    width: 120,
    height: 160,
    borderRadius: 14,
    overflow: 'hidden',
    marginRight: 12,
    backgroundColor: '#1C1C1E',
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  carouselImg: {
    width: '100%',
    height: '100%',
  },
  carouselCellOverlay: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 12,
    padding: 2,
  },
  carouselNum: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    backgroundColor: 'rgba(0,0,0,0.65)',
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  carouselActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  actionBtn: {
    flex: 1,
    height: 48,
    backgroundColor: '#FF9F0A',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnIcon: { marginRight: 6 },
  actionBtnTxt: { color: '#000000', fontWeight: '700', fontSize: 14 },
  actionBtnOutline: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  actionBtnOutlineTxt: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },

  // Download Progress Bar
  progWrap: { width: '100%', gap: 8 },
  progInfoRow: { flexDirection: 'row', justifyContent: 'space-between' },
  progTxt: { color: '#8E8E93', fontSize: 12, fontWeight: '500' },
  progBg: { width: '100%', height: 4, backgroundColor: '#1C1C1E', borderRadius: 2, overflow: 'hidden' },
  progFill: { height: '100%', backgroundColor: '#FF9F0A', borderRadius: 2 },

  // Modal Info Overlay
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#1C1C1E',
    borderWidth: 1,
    borderColor: '#2C2C2E',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 4,
    marginBottom: 6,
  },
  modalSub: {
    fontSize: 12,
    color: '#FF9F0A',
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  modalDivider: {
    width: 40,
    height: 2,
    backgroundColor: '#2C2C2E',
    marginVertical: 18,
  },
  modalDesc: {
    color: '#E5E5EA',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 16,
  },
  modalInstructions: {
    color: '#8E8E93',
    fontSize: 13,
    lineHeight: 22,
    marginBottom: 24,
  },
  modalCloseBtn: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    height: 46,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseTxt: {
    color: '#000000',
    fontWeight: '700',
    fontSize: 14,
  },

  // Custom Video Player Controls Styles
  videoWrapper: {
    position: 'relative',
    width: '100%',
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#000000',
    borderWidth: 1,
    borderColor: '#1C1C1E',
  },
  videoPressable: {
    width: '100%',
  },
  controlsOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'space-between',
    padding: 16,
  },
  centerControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 28,
    flex: 1,
  },
  iconButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
  },
  skipText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
    marginTop: -1,
  },
  glassPlayBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
  },
  bottomControlsPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 15, 15, 0.82)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 12,
  },
  timeText: {
    color: '#E5E5EA',
    fontSize: 11,
    fontWeight: '700',
    minWidth: 78,
  },
  seekerContainer: {
    flex: 1,
    height: 24,
    justifyContent: 'center',
  },
  seekerBg: {
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    borderRadius: 2,
    position: 'relative',
    width: '100%',
  },
  seekerFill: {
    height: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 2,
  },
  seekerKnob: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FFFFFF',
    position: 'absolute',
    top: -3,
    marginLeft: -5,
  },
  rightActionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  glassControlBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  swiperWrapper: {
    width: '100%',
    height: W * 1.15,
  },
  slideCounter: {
    position: 'absolute',
    bottom: 14,
    left: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  slideCounterText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  slideSelectBadge: {
    position: 'absolute',
    top: 14,
    right: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    borderRadius: 18,
    padding: 3,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
  },
  bottomPanelMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
  },
  carouselSwiperContainer: {
    width: W,
    marginVertical: 10,
    alignItems: 'center',
  },
  swiperCard: {
    width: CARD_WIDTH,
    height: CARD_WIDTH * 1.25,
    marginRight: CARD_GAP,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#0F0F10',
    borderWidth: 1,
    borderColor: '#1C1C1E',
    position: 'relative',
  },
  inactiveVideoWrapper: {
    position: 'relative',
    width: '100%',
    height: '100%',
    backgroundColor: '#000000',
  },
  inactivePlayOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
  },
  dotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    height: 20,
    marginTop: 18,
    marginBottom: 6,
    gap: 6,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
  swiperVolumeBtn: {
    position: 'absolute',
    bottom: 14,
    right: 14,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  swiperPlayOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
  },
});
