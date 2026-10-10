/**
 * HomeScreen.tsx — anyfetch Universal Media Downloader
 * Modular orchestrator screen for Instagram, YouTube, Pinterest, and Twitter/X.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  BackHandler,
  Image,
  Linking,
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
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVideoPlayer } from 'expo-video';
import {
  XCircle,
  AlertCircle,
  CheckCircle,
  Download,
} from 'reicon-react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';

import { checkForGitHubUpdate, GitHubReleaseInfo } from '../services/githubUpdate';
import { detectPlatform, downloadMedia, DownloadProgress, extractUrlFromText } from '../utils/download';
import { extractMedia, ExtractedMediaItem, ExtractedResult } from '../extractors';
import { getPlatformTheme } from '../theme/platformColors';
import { useClipboardDetection } from '../hooks/useClipboardDetection';
import { useDownloadHistory, HistoryItem } from '../hooks/useDownloadHistory';

import ClipboardBanner from '../components/home/ClipboardBanner';
import HistorySection from '../components/home/HistorySection';
import QualitySelector from '../components/home/QualitySelector';
import CarouselSwiper from '../components/home/CarouselSwiper';
import CustomVideoPlayer from '../components/player/CustomVideoPlayer';
import ProgressBar from '../components/common/ProgressBar';
import UpdateModal from '../components/UpdateModal';
import BottomTabBar from '../components/navigation/BottomTabBar';
import FloatingMenu from '../components/navigation/FloatingMenu';
import { useCascadeNavigation } from '../components/navigation/CascadePageTransition';
import { useAppTheme } from '../theme/ThemeContext';
import { ShaderBackground } from '../components/theme/ShaderBackground';
import { Orb, type OrbVariant } from '../components/theme/Orb';
import { DEFAULT_THEME } from '../theme/platformColors';
import { FONTS } from '../theme/typography';

type AppPhase = 'idle' | 'loading' | 'result' | 'error';

export default function HomeScreen() {
  const navigation = useNavigation<any>();
  const { navigateWithCascade } = useCascadeNavigation();
  const { colors: appColors, appliedTheme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<AppPhase>('idle');
  const [urlInput, setUrlInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Detect whether surrounding background shader is light (e.g. Ghost light)
  // to dynamically activate deeper contrasting stops and ambient occlusion
  const isLightBackground = useMemo(() => {
    if (!appliedTheme) return false;
    if (
      appliedTheme.id === 'ghost-light' ||
      appliedTheme.label?.toLowerCase().includes('ghost')
    ) {
      return true;
    }
    const main = appliedTheme.tones?.main;
    if (main) {
      const lum = 0.299 * main[0] + 0.587 * main[1] + 0.114 * main[2];
      return lum > 0.58;
    }
    return false;
  }, [appliedTheme]);

  const [orbPreset, setOrbPreset] = useState<OrbVariant>('adaptive');
  const cycleOrbPreset = useCallback(() => {
    const sequence: OrbVariant[] = ['adaptive', 'bloom', 'glass', 'ember', 'drop'];
    setOrbPreset(prev => {
      const idx = sequence.indexOf(prev);
      return sequence[(idx + 1) % sequence.length];
    });
  }, []);

  // Media Result State
  const [singleResult, setSingleResult] = useState<ExtractedResult | null>(null);
  const [selectedQuality, setSelectedQuality] = useState<string>('720p');
  const [carouselItems, setCarouselItems] = useState<ExtractedMediaItem[]>([]);

  // Download State
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const buttonColorAnim = useRef(new Animated.Value(0)).current;

  // Modals
  const [githubRelease, setGithubRelease] = useState<GitHubReleaseInfo | null>(null);
  const [updateModalVisible, setUpdateModalVisible] = useState(false);

  // Custom Hooks
  const {
    detectedUrl,
    detectedPlatform,
    animValue: clipboardAnim,
    hideBanner: hideClipboardBanner,
    checkClipboard,
  } = useClipboardDetection();

  const {
    history,
    filter: historyFilter,
    setFilter: setHistoryFilter,
    filteredItems: historyFilteredItems,
    addHistoryItem,
    removeHistoryItem,
  } = useDownloadHistory();

  // Screen transition animations
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const transitionToPhase = useCallback((newPhase: AppPhase, updateState?: () => void) => {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 140,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start(() => {
      if (updateState) updateState();
      setPhase(newPhase);

      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    });
  }, [fadeAnim]);

  // Ref tracking URL input to prevent stale closure in circle button
  const urlInputRef = useRef('');
  useEffect(() => {
    urlInputRef.current = urlInput;
  }, [urlInput]);

  const platform = detectPlatform(urlInput);
  const platformTheme = getPlatformTheme(platform);
  const themeColors = platform
    ? platformTheme
    : {
        ...DEFAULT_THEME,
        primary: appColors.accent || DEFAULT_THEME.primary,
        glow: appColors.accentGlow || DEFAULT_THEME.glow,
        glowLight: appColors.accentGlowLight || DEFAULT_THEME.glowLight,
      };

  // Video Player instance
  const videoPlayer = useVideoPlayer('', p => {
    p.loop = true;
    p.timeUpdateEventInterval = 0.25;
  });

  // Keep video source synced with media result
  useEffect(() => {
    if (singleResult?.type === 'video' && singleResult.url) {
      if (typeof (videoPlayer as any).replaceAsync === 'function') {
        (videoPlayer as any).replaceAsync(singleResult.url).catch(() => {});
      } else {
        videoPlayer.replace(singleResult.url);
      }
      videoPlayer.play();
    } else {
      videoPlayer.pause();
    }
  }, [singleResult, videoPlayer]);

  // Check for GitHub Release updates on mount
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const release = await checkForGitHubUpdate();
        if (mounted && release.isAvailable) {
          setGithubRelease(release);
          setUpdateModalVisible(true);
        }
      } catch {
        // silent fallback
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const handleManualCheckUpdate = async () => {
    try {
      const release = await checkForGitHubUpdate();
      if (release.isAvailable) {
        setGithubRelease(release);
        setUpdateModalVisible(true);
      } else {
        Alert.alert('Up to Date', `AnyFetch v${release.currentVersion} is the latest version.`);
      }
    } catch {
      Alert.alert('Update Check Failed', 'Could not reach GitHub releases at this time.');
    }
  };

  // Android Share Intent listener
  useEffect(() => {
    const handleUrl = (event: { url: string }) => {
      if (!event.url) return;
      const detected = extractUrlFromText(event.url);
      if (detected && detectPlatform(detected)) {
        setUrlInput(detected);
        handleExtract(detected);
      }
    };

    Linking.getInitialURL().then(initial => {
      if (initial) handleUrl({ url: initial });
    });

    const sub = Linking.addEventListener('url', handleUrl);
    return () => sub.remove();
  }, []);

  useFocusEffect(
    useCallback(() => {
      checkClipboard();
    }, [checkClipboard])
  );

  // ── Media Extraction ───────────────────────────────────────────────────────
  const handleExtract = useCallback(
    async (overrideUrl?: string) => {
      hideClipboardBanner();
      const raw = (overrideUrl ?? urlInputRef.current).trim();
      const activeUrl = extractUrlFromText(raw);
      const activePlatform = detectPlatform(activeUrl);

      if (!activeUrl || !activePlatform) {
        Alert.alert('No link', 'Copy any Instagram, YouTube, TikTok, Reddit, Pinterest, or Twitter/X link first.');
        return;
      }

      setPhase('loading');
      setErrorMsg('');

      try {
        const extracted = await extractMedia(activeUrl);

        if (extracted.type === 'carousel' && extracted.carouselItems && extracted.carouselItems.length > 0) {
          setSingleResult(null);
          setCarouselItems(extracted.carouselItems);
        } else {
          setSingleResult(extracted);
          setCarouselItems([]);
          if (extracted.qualities && extracted.qualities.length > 0) {
            setSelectedQuality(extracted.qualities[0].id);
          }
        }

        // Add to history
        addHistoryItem({
          url: activeUrl,
          platform: activePlatform,
          singleResult: extracted.type === 'carousel' ? null : extracted,
          carouselItems: extracted.carouselItems || [],
        });

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        transitionToPhase('result');
      } catch (err: any) {
        const msg = err?.message || 'Could not fetch media. Check your network or try again.';
        setErrorMsg(msg);
        setPhase('error');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      }
    },
    [addHistoryItem, hideClipboardBanner, transitionToPhase]
  );

  // ── Download Execution ─────────────────────────────────────────────────────
  const doDownload = useCallback(
    async (url: string, type: 'video' | 'image' | 'audio', customFilename?: string) => {
      if (!url || downloadSuccess) return;
      setDownloading(true);
      setProgress(null);
      const result = await downloadMedia(url, type, p => setProgress(p), customFilename);
      setDownloading(false);
      setProgress(null);

      if (result.ok) {
        setDownloadSuccess(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        Animated.timing(buttonColorAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: false,
        }).start();

        setTimeout(() => {
          setDownloadSuccess(false);
          buttonColorAnim.setValue(0);
        }, 3000);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
        Alert.alert('Download Failed', result.error ?? 'Unknown error occurred.');
      }
    },
    [downloadSuccess, buttonColorAnim]
  );

  const downloadCarouselSelected = useCallback(async () => {
    const toDownload = carouselItems.filter(i => i.selected);
    if (toDownload.length === 0) {
      Alert.alert('Select items', 'Choose at least one item from the carousel.');
      return;
    }

    setDownloading(true);
    setProgress(null);
    let successCount = 0;

    for (const item of toDownload) {
      const res = await downloadMedia(item.url, item.type);
      if (res.ok) successCount++;
    }

    setDownloading(false);
    if (successCount === toDownload.length) {
      setDownloadSuccess(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setTimeout(() => setDownloadSuccess(false), 3000);
    } else {
      Alert.alert('Download Incomplete', `Saved ${successCount} of ${toDownload.length} items.`);
    }
  }, [carouselItems]);

  // Reset to idle screen
  const reset = useCallback(() => {
    videoPlayer.pause();
    transitionToPhase('idle', () => {
      setUrlInput('');
      setSingleResult(null);
      setCarouselItems([]);
      setErrorMsg('');
      setDownloadSuccess(false);
      buttonColorAnim.setValue(0);
    });
  }, [videoPlayer, transitionToPhase, buttonColorAnim]);

  // Circle button press action
  const handleCirclePress = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    try {
      const rawText = (await Clipboard.getStringAsync())?.trim();
      const cleanUrl = extractUrlFromText(rawText);
      const isNewLinkValid = cleanUrl && detectPlatform(cleanUrl);

      if (isNewLinkValid) {
        setUrlInput(cleanUrl);
        handleExtract(cleanUrl);
      } else if (urlInputRef.current && detectPlatform(urlInputRef.current)) {
        handleExtract(urlInputRef.current);
      } else if (cleanUrl) {
        setUrlInput(cleanUrl);
        Alert.alert('Unsupported Link', 'Please copy a YouTube, Instagram, TikTok, Reddit, Pinterest, or Twitter/X link.');
      } else {
        Alert.alert('No Link Copied', 'Copy any supported link, then tap the circle to download.');
      }
    } catch {
      if (urlInputRef.current && detectPlatform(urlInputRef.current)) {
        handleExtract(urlInputRef.current);
      }
    }
  }, [handleExtract]);

  const handleSelectHistoryItem = useCallback((item: HistoryItem) => {
    setUrlInput(item.url);
    if (item.singleResult) {
      setSingleResult(item.singleResult);
      setCarouselItems([]);
    } else if (item.carouselItems) {
      setSingleResult(null);
      setCarouselItems(item.carouselItems);
    }
    transitionToPhase('result');
  }, [transitionToPhase]);

  const btnBgColor = buttonColorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [themeColors.primary, '#30D158'],
  });

  const isIdle = phase === 'idle' || phase === 'error';
  const isResult = phase === 'result';
  const isLoading = phase === 'loading';

  useEffect(() => {
    const handleHardwareBack = () => {
      if (isResult) {
        reset();
        return true;
      }
      return false;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', handleHardwareBack);
    return () => sub.remove();
  }, [isResult, reset]);

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />

      {/* ═══ LIVE ATMOSPHERIC WEBGL SHADER BACKGROUND ═══ */}
      <ShaderBackground
        theme={appliedTheme}
        overlayOpacity={0.20}
        style={StyleSheet.absoluteFill}
      />

      {/* ═══ FLOATING MENU HEADER ═══ */}
      <FloatingMenu
        title={
          isResult ? (
            <Text style={s.floatingMenuTitle}>PREVIEW</Text>
          ) : (
            <View style={s.brandBadge}>
              <View style={[s.brandDot, { backgroundColor: appColors.accent }]} />
              <Text style={s.floatingMenuTitle}>ANYFETCH</Text>
            </View>
          )
        }
        backButton={isResult ? { label: 'Back', onPress: reset } : undefined}
        primaryLinks={[
          {
            label: 'Fetch Media',
            onPress: () => {
              if (isResult) reset();
            },
          },
          {
            label: 'Downloads Showcase',
            onPress: () => navigateWithCascade('Downloads'),
          },
          {
            label: 'Theme Studio (Arc Dial)',
            onPress: () => navigateWithCascade('Theme'),
          },
          {
            label: 'Settings',
            onPress: () => navigateWithCascade('Settings'),
          },
        ]}
        secondaryLinks={[
          {
            label: 'Check for Updates',
            onPress: handleManualCheckUpdate,
          },
          {
            label: 'About AnyFetch',
            onPress: () => navigateWithCascade('About'),
          },
        ]}
        socialLinks={[
          {
            label: 'Twitter / X (@abhi3hekk)',
            href: 'https://x.com/abhi3hekk',
          },
          {
            label: 'GitHub Repository',
            href: 'https://github.com/AbhishekS04/anyfetch-expo',
          },
          {
            label: 'Report an Issue',
            href: 'https://github.com/AbhishekS04/anyfetch-expo/issues',
          },
        ]}
      />

      <Animated.View
        style={[
          s.mainWrapper,
          {
            opacity: fadeAnim,
          },
        ]}>
        {/* ═══ IDLE / INPUT PHASE ═══ */}
        {(isIdle || isLoading) && (
          <ScrollView
            style={s.idleContainer}
            contentContainerStyle={[
              s.idleContent,
              {
                paddingTop: insets.top + 116,
                paddingBottom: Math.max(insets.bottom, 16) + 80,
              },
            ]}
            keyboardShouldPersistTaps="handled">
            {/* Center OkLab WebGL Orb */}
            <View style={s.centerSection}>
              <View style={s.circleWrapper}>
                <Orb
                  size={168}
                  preset={orbPreset}
                  themeAccent={themeColors.primary}
                  themePalette={appliedTheme?.palette}
                  isLightBackground={isLightBackground}
                  onPress={handleCirclePress}
                  onLongPress={cycleOrbPreset}
                  isLoading={isLoading}
                />
              </View>

              <Text style={s.centerHint}>
                {platform
                  ? `Tap to fetch ${themeColors.label}`
                  : urlInput.trim().length > 0
                  ? 'Tap to process link'
                  : 'Copy link & tap orb'}
              </Text>
            </View>

            {/* Input Container */}
            <View style={s.inputContainer}>
              <ClipboardBanner
                url={detectedUrl}
                platform={detectedPlatform}
                animValue={clipboardAnim}
                onFetch={url => {
                  setUrlInput(url);
                  handleExtract(url);
                }}
                onDismiss={hideClipboardBanner}
              />

              <View style={s.inputCard}>
                <themeColors.Icon
                  size={20}
                  color={themeColors.primary}
                  style={s.inputIcon}
                />
                <TextInput
                  style={s.input}
                  placeholder="Paste Instagram, YouTube, Twitter/X, or Pinterest link..."
                  placeholderTextColor="#5E5E62"
                  value={urlInput}
                  onChangeText={val => {
                    const clean = extractUrlFromText(val);
                    setUrlInput(clean || val);
                    if (detectedUrl) hideClipboardBanner();
                  }}
                  editable={!isLoading}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="go"
                  onSubmitEditing={() => handleExtract(urlInput)}
                />
                {urlInput.length > 0 && (
                  <TouchableOpacity
                    onPress={() => {
                      setUrlInput('');
                      if (detectedUrl) hideClipboardBanner();
                    }}
                    hitSlop={12}>
                    <XCircle size={20} color="#5E5E62" />
                  </TouchableOpacity>
                )}
              </View>

              {phase === 'error' && (
                <Text style={s.errorText} numberOfLines={3}>
                  {errorMsg}
                </Text>
              )}
            </View>

            {/* Download History */}
            <HistorySection
              history={history}
              filter={historyFilter}
              onSelectFilter={setHistoryFilter}
              filteredItems={historyFilteredItems}
              onSelectItem={handleSelectHistoryItem}
              onDeleteItem={removeHistoryItem}
              activeColor={themeColors.primary}
              onViewAll={() => navigateWithCascade('Downloads')}
            />
          </ScrollView>
        )}

        {/* ═══ RESULT PHASE ═══ */}
        {isResult && (
          <ScrollView
            style={s.resultScroll}
            contentContainerStyle={[
              s.resultContent,
              {
                paddingTop: insets.top + 88,
                paddingBottom: Math.max(insets.bottom, 24) + 64,
              },
            ]}
            showsVerticalScrollIndicator={false}>
            {singleResult && (
              <View style={s.mediaContainer}>
                {singleResult.type === 'video' ? (
                  <CustomVideoPlayer
                    player={videoPlayer}
                    height={singleResult.platform === 'youtube' ? undefined : 320}
                    thumbnailUrl={singleResult.thumbnail}
                    themeColor={themeColors.primary}
                  />
                ) : singleResult.thumbnail ? (
                  <View style={s.imageCard}>
                    <Image
                      source={{ uri: singleResult.thumbnail }}
                      style={s.mediaImage}
                      resizeMode="cover"
                    />
                  </View>
                ) : null}

                {/* Title */}
                {singleResult.title ? (
                  <View style={s.titleBox}>
                    <themeColors.Icon
                      size={14}
                      color={themeColors.primary}
                    />
                    <Text style={s.titleTxt} numberOfLines={2}>
                      {singleResult.title}
                    </Text>
                  </View>
                ) : null}

                {/* Quality options (YouTube) */}
                {singleResult.qualities && singleResult.qualities.length > 0 && (
                  <QualitySelector
                    qualities={singleResult.qualities}
                    selectedId={selectedQuality}
                    onSelect={setSelectedQuality}
                    accentColor={themeColors.primary}
                  />
                )}

                {/* HLS Notice */}
                {singleResult.hlsNote ? (
                  <View style={s.hlsBox}>
                    <AlertCircle size={18} color="#FF9F0A" />
                    <Text style={s.hlsTxt}>{singleResult.hlsNote}</Text>
                  </View>
                ) : downloading ? (
                  <ProgressBar progress={progress} />
                ) : (
                  <Pressable
                    style={{ width: '100%', marginTop: 8 }}
                    disabled={downloading || downloadSuccess}
                    onPress={() => {
                      if (singleResult.qualities && singleResult.qualities.length > 0) {
                        const targetQuality =
                          singleResult.qualities.find(q => q.id === selectedQuality) ||
                          singleResult.qualities[0];
                        const dlType = targetQuality.type || singleResult.type;
                        const dlUrl = targetQuality.url || singleResult.url;
                        const safeTitle = (singleResult.title || 'media')
                          .replace(/[^a-zA-Z0-9_-]/g, '_')
                          .slice(0, 25);
                        const customName = `anyfetch_${singleResult.platform}_${safeTitle}_${selectedQuality}.${
                          targetQuality.container || 'mp4'
                        }`;
                        doDownload(dlUrl, dlType as any, customName);
                      } else {
                        doDownload(singleResult.url, singleResult.type as any);
                      }
                    }}>
                    <Animated.View style={[s.mainDlBtn, { backgroundColor: btnBgColor }]}>
                      {downloadSuccess ? (
                        <CheckCircle
                          size={18}
                          color="#FFFFFF"
                          weight="Filled"
                          style={s.mainDlBtnIcon}
                        />
                      ) : (
                        <Download
                          size={18}
                          color="#000000"
                          style={s.mainDlBtnIcon}
                        />
                      )}
                      <Text style={[s.mainDlBtnTxt, downloadSuccess && { color: '#FFFFFF' }]}>
                        {downloadSuccess
                          ? 'Completed'
                          : singleResult.qualities
                          ? `Download ${
                              singleResult.qualities.find(q => q.id === selectedQuality)?.label ||
                              'Media'
                            }`
                          : 'Download Media'}
                      </Text>
                    </Animated.View>
                  </Pressable>
                )}
              </View>
            )}

            {/* Carousel Result */}
            {carouselItems.length > 0 && (
              <CarouselSwiper
                items={carouselItems}
                videoPlayer={videoPlayer}
                themeColor={themeColors.primary}
                downloading={downloading}
                downloadSuccess={downloadSuccess}
                progress={progress}
                onToggleSelect={index => {
                  setCarouselItems(prev =>
                    prev.map(i => (i.index === index ? { ...i, selected: !i.selected } : i))
                  );
                }}
                onToggleSelectAll={() => {
                  const allSelected = carouselItems.every(i => i.selected);
                  setCarouselItems(prev => prev.map(i => ({ ...i, selected: !allSelected })));
                }}
                onDownloadSelected={downloadCarouselSelected}
              />
            )}
          </ScrollView>
        )}
      </Animated.View>

      {/* In-App APK Updater Modal */}
      <UpdateModal
        visible={updateModalVisible}
        releaseInfo={githubRelease}
        onDismiss={() => setUpdateModalVisible(false)}
      />

      {/* Floating Bottom Navigation */}
      <BottomTabBar
        activeTab="Home"
        onSelectTab={(tab) => {
          if (tab === 'Home') {
            if (isResult) reset();
            return;
          }
          navigateWithCascade(tab);
        }}
        downloadsCount={history.length}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
  },
  brandBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  brandDot: {
    width: 7,
    height: 7,
    borderRadius: 99,
    overflow: 'hidden',
    backgroundColor: '#FF9F0A',
  },
  floatingMenuTitle: {
    fontFamily: FONTS.display,
    color: '#FFFFFF',
    fontSize: 13,
    letterSpacing: 1.5,
  },
  mainWrapper: {
    flex: 1,
  },
  idleContainer: {
    flex: 1,
  },
  idleContent: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 40,
    paddingBottom: 40,
  },
  centerSection: {
    alignItems: 'center',
    marginBottom: 36,
  },
  circleWrapper: {
    width: 170,
    height: 170,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  centerHint: {
    fontFamily: FONTS.sans,
    color: '#8E8E93',
    fontSize: 13,
    marginTop: 18,
    letterSpacing: 0.2,
  },
  inputContainer: {
    width: '100%',
    gap: 8,
  },
  inputCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(24, 24, 26, 0.78)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    paddingHorizontal: 14,
    height: 52,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    fontFamily: FONTS.sans,
    flex: 1,
    color: '#FFFFFF',
    fontSize: 13.5,
  },
  errorText: {
    fontFamily: FONTS.sans,
    color: '#FF453A',
    fontSize: 12,
    paddingHorizontal: 6,
    marginTop: 2,
  },
  resultScroll: {
    flex: 1,
  },
  resultContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
    alignItems: 'center',
  },
  mediaContainer: {
    width: '100%',
    alignItems: 'center',
    gap: 12,
  },
  imageCard: {
    width: '100%',
    height: 360,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#121214',
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  mediaImage: {
    width: '100%',
    height: '100%',
  },
  titleBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#18181A',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2C2C2E',
    width: '100%',
  },
  titleTxt: {
    fontFamily: FONTS.display,
    color: '#FFFFFF',
    fontSize: 13.5,
    flex: 1,
    letterSpacing: -0.1,
  },
  hlsBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 159, 10, 0.1)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 159, 10, 0.3)',
    width: '100%',
  },
  hlsTxt: {
    fontFamily: FONTS.sans,
    color: '#FF9F0A',
    fontSize: 12,
    flex: 1,
    lineHeight: 16,
  },
  mainDlBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    gap: 8,
  },
  mainDlBtnIcon: {
    marginRight: 2,
  },
  mainDlBtnTxt: {
    fontFamily: FONTS.sans,
    color: '#000000',
    fontSize: 14,
    letterSpacing: 0.2,
  },
});
