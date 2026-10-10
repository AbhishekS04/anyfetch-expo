/**
 * SettingsScreen.tsx — Next-Gen Premium Mobile Settings
 *
 * Designed with state-of-the-art glassmorphism, glowing micro-accents,
 * intuitive segmented cards, and smooth haptic interactions:
 * - Top navigation app bar with back navigation & quick update refresh
 * - Hero Identity & Status card displaying on-device badges and live theme
 * - Storage & Paths with Android Storage Access Framework (SAF) folder picker
 * - Atmosphere & Shaders linking to the interactive Theme Studio
 * - Live GitHub OTA APK updater with status badges, releases, & custom repository drawer
 * - Core Architecture specs (100% on-device, zero telemetry, MIT license)
 * - Deep link to dedicated About & Creator showcase screen
 * - Persistent BottomTabBar integration
 */

import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  BackHandler,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  documentDirectory,
  StorageAccessFramework,
  getInfoAsync,
  readAsStringAsync,
  writeAsStringAsync,
} from 'expo-file-system/legacy';
import {
  FolderOpen,
  Palette,
  ChevronRight,
  ChevronLeft,
  ChevronUp,
  ChevronDown,
  Sparkles,
  ArrowDownCircle,
  Download,
  Refresh,
  Code,
  Link,
  Clipboard as ClipboardIcon,
  DocumentText,
  ArrowUpRight,
  InfoCircle,
  ShieldTick,
  Cpu,
  Setting2,
  CheckCircle,
} from 'reicon-react-native';

import {
  checkForGitHubUpdate,
  saveGitHubRepo,
  DEFAULT_REPO,
  DEFAULT_REPO_URL,
  normalizeGitHubRepo,
  GitHubReleaseInfo,
  getCurrentAppVersion,
} from '../services/githubUpdate';
import {
  saveAnyFetchApiUrl,
  setAnyFetchApiEnabled,
  pingAnyFetchApi,
  ApiHealthStatus,
} from '../services/anyfetchApi';
import UpdateModal from '../components/UpdateModal';
import {
  useCascadeBackTransition,
  navigateWithCascade,
} from '../components/navigation/CascadePageTransition';
import { useAppTheme } from '../theme/ThemeContext';
import { ShaderBackground } from '../components/theme/ShaderBackground';
import { FONTS } from '../theme/typography';
import BottomTabBar, { TabRoute } from '../components/navigation/BottomTabBar';
import { useDownloadHistory } from '../hooks/useDownloadHistory';

const SETTINGS_FILE = (documentDirectory ?? '') + 'settings.json';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { appliedTheme, colors: appColors } = useAppTheme();
  useCascadeBackTransition(navigation);
  const { history } = useDownloadHistory();

  // Hardware back button behavior
  useEffect(() => {
    const handleHardwareBack = () => {
      navigateWithCascade('Home');
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', handleHardwareBack);
    return () => sub.remove();
  }, []);

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    navigateWithCascade('Home');
  };

  // GitHub in-app APK updater state
  const [activeRepo, setActiveRepo] = useState<string>(DEFAULT_REPO);
  const [repoInput, setRepoInput] = useState<string>(DEFAULT_REPO_URL);
  const [isEditingRepo, setIsEditingRepo] = useState(false);
  const [ghRelease, setGhRelease] = useState<GitHubReleaseInfo | null>(null);
  const [ghCheckPhase, setGhCheckPhase] = useState<'idle' | 'checking' | 'uptodate' | 'available' | 'error'>('idle');
  const [ghCheckError, setGhCheckError] = useState<string | null>(null);
  const [ghModalVisible, setGhModalVisible] = useState(false);

  // Storage state
  const [useCustomDirectory, setUseCustomDirectory] = useState(false);
  const [customDirectoryUri, setCustomDirectoryUri] = useState('');
  const [customDirectoryName, setCustomDirectoryName] = useState('');

  // Cloud API Engine state
  const [enableCloudEngine, setEnableCloudEngine] = useState(true);
  const [cloudApiUrl, setCloudApiUrl] = useState('');
  const [cloudApiInput, setCloudApiInput] = useState('');
  const [isEditingCloudApi, setIsEditingCloudApi] = useState(false);
  const [cloudApiHealth, setCloudApiHealth] = useState<ApiHealthStatus | null>(null);
  const [isTestingCloudApi, setIsTestingCloudApi] = useState(false);

  const runningVersion = getCurrentAppVersion();

  /**
   * Check for full APK releases on GitHub automatically using the target repo
   */
  const handleCheckGitHubRelease = async (repoToUse?: string) => {
    const target = normalizeGitHubRepo(repoToUse || activeRepo);
    setGhCheckPhase('checking');
    setGhCheckError(null);
    try {
      const info = await checkForGitHubUpdate(target);
      setGhRelease(info);
      if (info.isAvailable) {
        setGhCheckPhase('available');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      } else {
        setGhCheckPhase('uptodate');
      }
    } catch (err: any) {
      setGhCheckError(err?.message || 'Could not fetch GitHub releases.');
      setGhCheckPhase('error');
    }
  };

  /**
   * Saves the GitHub repository and immediately triggers automatic update check
   */
  const handleSaveAndAutoCheckRepo = async (rawUrl: string) => {
    const normalized = normalizeGitHubRepo(rawUrl);
    setActiveRepo(normalized);
    setRepoInput(`https://github.com/${normalized}`);
    await saveGitHubRepo(normalized);
    await handleCheckGitHubRelease(normalized);
  };

  const handlePasteRepoFromClipboard = async () => {
    try {
      const text = await Clipboard.getStringAsync();
      if (text) {
        await handleSaveAndAutoCheckRepo(text);
      } else {
        Alert.alert('Clipboard Empty', 'No URL found in clipboard.');
      }
    } catch (err: any) {
      Alert.alert('Clipboard Error', err?.message || 'Could not read clipboard.');
    }
  };

  const handleResetRepoToDefault = async () => {
    await handleSaveAndAutoCheckRepo(DEFAULT_REPO);
  };

  // Load settings on mount
  useEffect(() => {
    async function loadSettings() {
      try {
        const fileInfo = await getInfoAsync(SETTINGS_FILE);
        let repoToInit = DEFAULT_REPO;
        if (fileInfo.exists) {
          const content = await readAsStringAsync(SETTINGS_FILE);
          const settings = JSON.parse(content);
          setUseCustomDirectory(!!settings.useCustomDirectory);
          setCustomDirectoryUri(settings.customDirectoryUri ?? '');
          setCustomDirectoryName(settings.customDirectoryName ?? '');
          if (settings.githubRepo) {
            repoToInit = normalizeGitHubRepo(settings.githubRepo);
          }
          if (typeof settings.enableCloudApi === 'boolean') {
            setEnableCloudEngine(settings.enableCloudApi);
          }
          if (typeof settings.anyfetchApiUrl === 'string') {
            setCloudApiUrl(settings.anyfetchApiUrl);
            setCloudApiInput(settings.anyfetchApiUrl);
            if (settings.anyfetchApiUrl) {
              pingAnyFetchApi(settings.anyfetchApiUrl).then(setCloudApiHealth);
            }
          }
        }
        setActiveRepo(repoToInit);
        setRepoInput(`https://github.com/${repoToInit}`);
        // Automatic fetch immediately upon opening settings
        handleCheckGitHubRelease(repoToInit);
      } catch (err: any) {
        Alert.alert('Failed to load settings', err?.message ?? 'Unknown error');
      }
    }
    loadSettings();
  }, []);

  // Save settings helper (merges with existing config)
  const saveSettings = async (useDir: boolean, uri: string, name: string) => {
    try {
      let current: any = {};
      const fileInfo = await getInfoAsync(SETTINGS_FILE);
      if (fileInfo.exists) {
        current = JSON.parse(await readAsStringAsync(SETTINGS_FILE));
      }
      const config = {
        ...current,
        useCustomDirectory: useDir,
        customDirectoryUri: uri,
        customDirectoryName: name,
      };
      await writeAsStringAsync(SETTINGS_FILE, JSON.stringify(config));
    } catch (err) {
      console.warn('Failed to save settings:', err);
    }
  };

  const handleToggleCloudEngine = async (val: boolean) => {
    Haptics.selectionAsync().catch(() => {});
    setEnableCloudEngine(val);
    await setAnyFetchApiEnabled(val);
  };

  const handleTestCloudApi = async (urlToTest?: string) => {
    const target = urlToTest || cloudApiInput || cloudApiUrl;
    if (!target) {
      Alert.alert('No Endpoint', 'Enter or paste your AnyFetch API URL (e.g. https://your-service.getvoroa.com) first.');
      return;
    }
    setIsTestingCloudApi(true);
    Haptics.selectionAsync().catch(() => {});
    const health = await pingAnyFetchApi(target);
    setCloudApiHealth(health);
    setIsTestingCloudApi(false);
    if (health.ok) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    }
  };

  const handleSaveCloudApi = async () => {
    Haptics.selectionAsync().catch(() => {});
    const clean = cloudApiInput.trim().replace(/\/+$/, '');
    setCloudApiUrl(clean);
    setIsEditingCloudApi(false);
    await saveAnyFetchApiUrl(clean);
    if (clean) {
      handleTestCloudApi(clean);
    }
  };

  const handlePasteCloudApi = async () => {
    try {
      const text = await Clipboard.getStringAsync();
      if (text) {
        setCloudApiInput(text.trim());
      } else {
        Alert.alert('Clipboard Empty', 'No URL found in clipboard.');
      }
    } catch {
      Alert.alert('Clipboard Error', 'Could not read clipboard.');
    }
  };

  const handleToggleCustom = async (val: boolean) => {
    Haptics.selectionAsync().catch(() => {});
    if (val && !customDirectoryUri) {
      await handleSelectDirectory(true);
    } else {
      setUseCustomDirectory(val);
      saveSettings(val, customDirectoryUri, customDirectoryName);
    }
  };

  const handleSelectDirectory = async (enableAfterPick = false) => {
    try {
      if (Platform.OS !== 'android') {
        Alert.alert('Not supported', 'Custom download folders are only available on Android.');
        return;
      }

      const permissions = await StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (permissions.granted) {
        const uri = permissions.directoryUri;
        const decoded = decodeURIComponent(uri);
        let folderName = 'Selected Folder';
        if (decoded.includes(':')) {
          folderName = decoded.substring(decoded.lastIndexOf(':') + 1);
        } else {
          folderName = decoded.substring(decoded.lastIndexOf('/') + 1);
        }

        setCustomDirectoryUri(uri);
        setCustomDirectoryName(folderName);
        setUseCustomDirectory(enableAfterPick ? true : useCustomDirectory);
        saveSettings(enableAfterPick ? true : useCustomDirectory, uri, folderName);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      } else {
        if (enableAfterPick) {
          setUseCustomDirectory(false);
        }
      }
    } catch (err: any) {
      Alert.alert('Error selecting directory', err?.message ?? 'Unknown error');
      if (enableAfterPick) {
        setUseCustomDirectory(false);
      }
    }
  };

  const handleSelectTab = (tab: TabRoute) => {
    if (tab === 'Settings') return;
    navigateWithCascade(tab);
  };

  return (
    <View style={s.root}>
      {/* ═══ LIVE ATMOSPHERIC WEBGL SHADER BACKGROUND ═══ */}
      <ShaderBackground
        theme={appliedTheme}
        overlayOpacity={0.82}
        style={StyleSheet.absoluteFill}
      />
      <StatusBar barStyle="light-content" backgroundColor="#000000" />

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
          <Text style={s.headerTitle}>SETTINGS</Text>
        </View>

        <TouchableOpacity
          style={s.headerBtn}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            handleCheckGitHubRelease();
          }}
          activeOpacity={0.7}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          {ghCheckPhase === 'checking' ? (
            <ActivityIndicator size="small" color="#FF9F0A" style={{ transform: [{ scale: 0.75 }] }} />
          ) : (
            <Refresh size={18} color="#A1A1AA" />
          )}
        </TouchableOpacity>
      </View>

      {/* ═══ SCROLLABLE CONTENT ═══ */}
      <ScrollView
        style={s.scrollView}
        contentContainerStyle={[
          s.content,
          {
            paddingBottom: Math.max(insets.bottom + 105, 120),
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── 1. HERO IDENTITY CARD ── */}
        <View style={s.heroCard}>
          <View style={s.heroTopRow}>
            <View style={s.heroIconWrap}>
              <Setting2 size={24} color="#FF9F0A" />
            </View>
            <View style={s.heroTextWrap}>
              <View style={s.heroTitleRow}>
                <Text style={s.heroTitle}>AnyFetch</Text>
                <View style={s.versionPill}>
                  <View style={s.versionDot} />
                  <Text style={s.versionText}>v{runningVersion}</Text>
                </View>
              </View>
              <Text style={s.heroSubtitle}>Universal On-Device Engine</Text>
            </View>
          </View>

          {/* Quick Engine Status Badges */}
          <View style={s.heroBadgeGrid}>
            <View style={s.miniBadge}>
              <ShieldTick size={13} color="#34C759" />
              <Text style={s.miniBadgeText}>Private</Text>
            </View>
            <View style={s.miniBadge}>
              <Cpu size={13} color="#38bdf8" />
              <Text style={s.miniBadgeText}>On-Device</Text>
            </View>
            <View style={s.miniBadge}>
              <View
                style={[
                  s.themeDot,
                  { backgroundColor: appliedTheme.accentColor || '#38bdf8' },
                ]}
              />
              <Text style={s.miniBadgeText} numberOfLines={1}>
                {appliedTheme.label || 'Arc Dial'}
              </Text>
            </View>
          </View>
        </View>

        {/* ── 2. ATMOSPHERE & SHADERS ── */}
        <View style={s.sectionHeader}>
          <View style={[s.sectionDot, { backgroundColor: '#38bdf8' }]} />
          <Text style={s.sectionTitle}>ATMOSPHERE & APPEARANCE</Text>
        </View>

        <View style={s.glassCard}>
          <TouchableOpacity
            activeOpacity={0.7}
            style={s.rowBtn}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              navigateWithCascade('Theme');
            }}
          >
            <View style={[s.iconBox, { backgroundColor: 'rgba(56, 189, 248, 0.12)' }]}>
              <Palette size={20} color="#38bdf8" />
            </View>
            <View style={s.rowContent}>
              <Text style={s.rowTitle}>Theme Studio</Text>
              <Text style={s.rowSub}>Radial time dial & procedural WebGL shaders</Text>
            </View>
            <View style={s.rowRightWrap}>
              <View style={s.themeTag}>
                <Text style={s.themeTagText}>{appliedTheme.label || 'Arc Dial'}</Text>
              </View>
              <ChevronRight size={16} color="#71717A" />
            </View>
          </TouchableOpacity>
        </View>

        {/* ── 3. STORAGE & PATHS ── */}
        <View style={s.sectionHeader}>
          <View style={[s.sectionDot, { backgroundColor: '#FF9F0A' }]} />
          <Text style={s.sectionTitle}>STORAGE & DESTINATION</Text>
        </View>

        <View style={s.glassCard}>
          {Platform.OS === 'android' ? (
            <View style={s.columnContainer}>
              <View style={s.switchRow}>
                <View style={[s.iconBox, { backgroundColor: 'rgba(255, 159, 10, 0.12)' }]}>
                  <FolderOpen size={20} color="#FF9F0A" />
                </View>
                <View style={s.rowContent}>
                  <Text style={s.rowTitle}>Custom Save Directory</Text>
                  <Text style={s.rowSub}>Direct Android Storage Access (SAF)</Text>
                </View>
                <Switch
                  value={useCustomDirectory}
                  onValueChange={handleToggleCustom}
                  trackColor={{ false: 'rgba(255, 255, 255, 0.1)', true: 'rgba(255, 159, 10, 0.45)' }}
                  thumbColor={useCustomDirectory ? '#FF9F0A' : '#71717A'}
                />
              </View>

              {useCustomDirectory ? (
                <View style={s.pathPickerContainer}>
                  <View style={s.pathInfo}>
                    <FolderOpen size={16} color="#FF9F0A" />
                    <Text style={s.pathText} numberOfLines={1}>
                      {customDirectoryName || 'No folder chosen'}
                    </Text>
                  </View>
                  <TouchableOpacity
                    activeOpacity={0.7}
                    style={s.pathChangeBtn}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      handleSelectDirectory(false);
                    }}
                  >
                    <Text style={s.pathChangeBtnText}>Change</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={s.noteContainer}>
                  <Text style={s.noteText}>
                    Files are saved to your default device Download folder or exported via native share sheets.
                  </Text>
                </View>
              )}
            </View>
          ) : (
            <View style={s.rowBtn}>
              <View style={[s.iconBox, { backgroundColor: 'rgba(255, 159, 10, 0.12)' }]}>
                <FolderOpen size={20} color="#FF9F0A" />
              </View>
              <View style={s.rowContent}>
                <Text style={s.rowTitle}>System Share Sheet</Text>
                <Text style={s.rowSub}>Save directly to Files app or native targets</Text>
              </View>
              <View style={s.pillBadge}>
                <Text style={s.pillBadgeText}>iOS Native</Text>
              </View>
            </View>
          )}
        </View>

        {/* ── 4. DOWNLOADER ENGINE & CLOUD ACCELERATOR ── */}
        <View style={s.sectionHeader}>
          <View style={[s.sectionDot, { backgroundColor: '#10B981' }]} />
          <Text style={s.sectionTitle}>DOWNLOADER ENGINE & CLOUD ACCELERATOR</Text>
        </View>

        <View style={s.glassCard}>
          <View style={s.columnContainer}>
            <View style={s.switchRow}>
              <View style={[s.iconBox, { backgroundColor: 'rgba(16, 185, 129, 0.12)' }]}>
                <Cpu size={20} color="#10B981" />
              </View>
              <View style={s.rowContent}>
                <Text style={s.rowTitle}>Cloud Acceleration Engine</Text>
                <Text style={s.rowSub}>1080p stream muxing, TikTok, & Reddit</Text>
              </View>
              <Switch
                value={enableCloudEngine}
                onValueChange={handleToggleCloudEngine}
                trackColor={{ false: 'rgba(255, 255, 255, 0.1)', true: 'rgba(16, 185, 129, 0.45)' }}
                thumbColor={enableCloudEngine ? '#10B981' : '#71717A'}
              />
            </View>

            {/* Cloud Endpoint Configuration Drawer */}
            <TouchableOpacity
              activeOpacity={0.7}
              style={[s.subRowBtn, { marginTop: 8 }]}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                setIsEditingCloudApi(!isEditingCloudApi);
              }}
            >
              <View style={s.subRowLeft}>
                <View style={[s.iconBox, { width: 32, height: 32, borderRadius: 8, backgroundColor: 'rgba(16, 185, 129, 0.12)' }]}>
                  <Link size={14} color="#10B981" />
                </View>
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={s.subRowLabel}>Service Endpoint</Text>
                  <Text style={s.rowSub}>Hosted on Voroa, Render, or Docker</Text>
                </View>
              </View>
              <View style={s.subRowRight}>
                {cloudApiHealth?.ok ? (
                  <View style={[s.statusBadge, s.statusBadgeSuccess]}>
                    <View style={[s.statusDot, s.statusDotSuccess]} />
                    <Text style={s.statusBadgeText}>{cloudApiHealth.latencyMs}ms</Text>
                  </View>
                ) : cloudApiUrl ? (
                  <View style={[s.statusBadge, s.statusBadgeNeutral]}>
                    <Text style={s.statusBadgeText}>Unverified</Text>
                  </View>
                ) : null}
                {isEditingCloudApi ? (
                  <ChevronUp size={14} color="#71717A" />
                ) : (
                  <ChevronDown size={14} color="#71717A" />
                )}
              </View>
            </TouchableOpacity>

            {isEditingCloudApi && (
              <View style={s.repoDrawer}>
                <Text style={s.repoDrawerHint}>
                  Enter the base URL of your deployed AnyFetch API (e.g. from Voroa or Render):
                </Text>
                <View style={s.inputWrap}>
                  <Link size={15} color="#71717A" style={{ marginRight: 8 }} />
                  <TextInput
                    style={s.repoInput}
                    value={cloudApiInput}
                    onChangeText={setCloudApiInput}
                    placeholder="https://your-api.getvoroa.com"
                    placeholderTextColor="#52525B"
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    returnKeyType="done"
                    onSubmitEditing={handleSaveCloudApi}
                  />
                </View>
                <View style={s.drawerActions}>
                  <TouchableOpacity
                    activeOpacity={0.7}
                    style={s.drawerBtnSecondary}
                    onPress={handlePasteCloudApi}
                  >
                    <ClipboardIcon size={13} color="#E4E4E7" />
                    <Text style={s.drawerBtnText}>Paste</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    activeOpacity={0.7}
                    style={s.drawerBtnSecondary}
                    onPress={() => handleTestCloudApi()}
                    disabled={isTestingCloudApi}
                  >
                    {isTestingCloudApi ? (
                      <ActivityIndicator size="small" color="#A1A1AA" style={{ transform: [{ scale: 0.7 }] }} />
                    ) : (
                      <>
                        <Refresh size={13} color="#A1A1AA" />
                        <Text style={[s.drawerBtnText, { color: '#A1A1AA' }]}>Test</Text>
                      </>
                    )}
                  </TouchableOpacity>
                  <View style={{ flex: 1 }} />
                  <TouchableOpacity
                    activeOpacity={0.7}
                    style={[s.drawerBtnPrimary, { backgroundColor: '#10B981' }]}
                    onPress={handleSaveCloudApi}
                  >
                    <Text style={[s.drawerBtnPrimaryText, { color: '#000' }]}>Save</Text>
                  </TouchableOpacity>
                </View>

                {cloudApiHealth && (
                  <View style={{ marginTop: 8 }}>
                    <Text
                      style={{
                        fontSize: 12,
                        fontFamily: FONTS.sans,
                        color: cloudApiHealth.ok ? '#34C759' : '#EF4444',
                      }}
                    >
                      {cloudApiHealth.ok
                        ? `✓ Server online (${cloudApiHealth.latencyMs}ms latency, uptime: ${cloudApiHealth.uptimeSeconds}s)`
                        : `✗ ${cloudApiHealth.error || 'Connection failed'}`}
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>
        </View>

        {/* ── 5. SOFTWARE UPDATES & GITHUB RELEASES ── */}
        <View style={s.sectionHeader}>
          <View style={[s.sectionDot, { backgroundColor: '#c084fc' }]} />
          <Text style={s.sectionTitle}>SOFTWARE & UPDATES</Text>
        </View>

        <View style={s.glassCard}>
          {/* Header Row: Version & Status */}
          <View style={s.updateHeaderRow}>
            <View style={[s.iconBox, { backgroundColor: 'rgba(192, 132, 252, 0.12)' }]}>
              <Sparkles size={20} color="#c084fc" />
            </View>
            <View style={s.rowContent}>
              <Text style={s.rowTitle}>AnyFetch for Android</Text>
              <Text style={s.rowSub}>Build Version v{runningVersion}</Text>
            </View>
            <View
              style={[
                s.statusBadge,
                ghCheckPhase === 'uptodate' && s.statusBadgeSuccess,
                ghCheckPhase === 'available' && s.statusBadgeWarning,
                ghCheckPhase === 'error' && s.statusBadgeError,
                ghCheckPhase === 'checking' && s.statusBadgeNeutral,
              ]}
            >
              {ghCheckPhase === 'checking' ? (
                <ActivityIndicator size="small" color="#A1A1AA" style={{ transform: [{ scale: 0.65 }] }} />
              ) : (
                <View
                  style={[
                    s.statusDot,
                    ghCheckPhase === 'uptodate' && s.statusDotSuccess,
                    ghCheckPhase === 'available' && s.statusDotWarning,
                    ghCheckPhase === 'error' && s.statusDotError,
                  ]}
                />
              )}
              <Text
                style={[
                  s.statusBadgeText,
                  ghCheckPhase === 'uptodate' && s.statusTextSuccess,
                  ghCheckPhase === 'available' && s.statusTextWarning,
                  ghCheckPhase === 'error' && s.statusTextError,
                ]}
              >
                {ghCheckPhase === 'checking'
                  ? 'Checking…'
                  : ghCheckPhase === 'available' && ghRelease
                  ? `v${ghRelease.latestVersion} Ready`
                  : ghCheckPhase === 'uptodate'
                  ? 'Up to date'
                  : ghCheckPhase === 'error'
                  ? 'Check Failed'
                  : 'Current'}
              </Text>
            </View>
          </View>

          {/* If Update Available: High Impact Card */}
          {ghCheckPhase === 'available' && ghRelease ? (
            <View style={s.updateAlertBox}>
              <View style={s.updateAlertHeader}>
                <ArrowDownCircle size={18} color="#FF9F0A" />
                <Text style={s.updateAlertTitle}>New Release Available</Text>
                <View style={s.versionTagPill}>
                  <Text style={s.versionTagText}>v{ghRelease.latestVersion}</Text>
                </View>
              </View>
              <Text style={s.updateAlertNotes} numberOfLines={2}>
                {ghRelease.releaseTitle || ghRelease.releaseNotes || 'Includes speed optimizations and new engine fixes.'}
              </Text>
              <TouchableOpacity
                activeOpacity={0.7}
                style={s.installActionBtn}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                  setGhModalVisible(true);
                }}
              >
                <Download size={16} color="#000000" />
                <Text style={s.installActionBtnText}>Download & Install APK</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={s.checkActionContainer}>
              <TouchableOpacity
                activeOpacity={0.7}
                style={[
                  s.checkBtn,
                  ghCheckPhase === 'checking' && s.checkBtnDisabled,
                  ghCheckPhase === 'error' && s.checkBtnError,
                ]}
                disabled={ghCheckPhase === 'checking'}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  handleCheckGitHubRelease();
                }}
              >
                {ghCheckPhase === 'checking' ? (
                  <View style={s.checkBtnContent}>
                    <ActivityIndicator size="small" color="#A1A1AA" />
                    <Text style={s.checkBtnTextMuted}>Checking GitHub releases…</Text>
                  </View>
                ) : (
                  <View style={s.checkBtnContent}>
                    <Refresh
                      size={15}
                      color={ghCheckPhase === 'error' ? '#FF453A' : '#FFFFFF'}
                    />
                    <Text
                      style={[
                        s.checkBtnText,
                        ghCheckPhase === 'error' && s.checkBtnTextError,
                      ]}
                    >
                      {ghCheckPhase === 'error' ? 'Retry Check' : 'Check for Updates'}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>

              {ghCheckError && ghCheckPhase === 'error' ? (
                <Text style={s.checkErrorText}>{ghCheckError}</Text>
              ) : null}
            </View>
          )}

          <View style={s.divider} />

          {/* Source Repository Row */}
          <TouchableOpacity
            activeOpacity={0.7}
            style={s.subRowBtn}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              setIsEditingRepo(!isEditingRepo);
            }}
          >
            <View style={s.subRowLeft}>
              <View style={s.miniIconBox}>
                <Code size={15} color="#A1A1AA" />
              </View>
              <Text style={s.subRowLabel}>Source Repo</Text>
            </View>
            <View style={s.subRowRight}>
              <View style={s.repoPill}>
                <Text style={s.subRowValue} numberOfLines={1} ellipsizeMode="middle">
                  {activeRepo}
                </Text>
              </View>
              {isEditingRepo ? (
                <ChevronUp size={14} color="#71717A" />
              ) : (
                <ChevronDown size={14} color="#71717A" />
              )}
            </View>
          </TouchableOpacity>

          {/* Collapsible Repository Drawer */}
          {isEditingRepo && (
            <View style={s.repoDrawer}>
              <Text style={s.repoDrawerHint}>
                Specify custom GitHub repository URL or owner/repo to query OTA releases:
              </Text>
              <View style={s.inputWrap}>
                <Link size={15} color="#71717A" style={{ marginRight: 8 }} />
                <TextInput
                  style={s.repoInput}
                  value={repoInput}
                  onChangeText={setRepoInput}
                  placeholder="AbhishekS04/anyfetch-expo"
                  placeholderTextColor="#52525B"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  returnKeyType="done"
                  onSubmitEditing={() => handleSaveAndAutoCheckRepo(repoInput)}
                />
              </View>
              <View style={s.drawerActions}>
                <TouchableOpacity
                  activeOpacity={0.7}
                  style={s.drawerBtnSecondary}
                  onPress={handlePasteRepoFromClipboard}
                >
                  <ClipboardIcon size={13} color="#E4E4E7" />
                  <Text style={s.drawerBtnText}>Paste</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.7}
                  style={s.drawerBtnSecondary}
                  onPress={handleResetRepoToDefault}
                >
                  <Refresh size={13} color="#A1A1AA" />
                  <Text style={[s.drawerBtnText, { color: '#A1A1AA' }]}>Reset</Text>
                </TouchableOpacity>
                <View style={{ flex: 1 }} />
                <TouchableOpacity
                  activeOpacity={0.7}
                  style={s.drawerBtnPrimary}
                  onPress={() => handleSaveAndAutoCheckRepo(repoInput)}
                >
                  <Text style={s.drawerBtnPrimaryText}>Apply & Check</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <View style={s.divider} />

          {/* Release Notes Link */}
          <TouchableOpacity
            activeOpacity={0.7}
            style={s.subRowBtn}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              Linking.openURL(`https://github.com/${activeRepo}/releases`).catch(() => {});
            }}
          >
            <View style={s.subRowLeft}>
              <View style={s.miniIconBox}>
                <DocumentText size={15} color="#A1A1AA" />
              </View>
              <Text style={s.subRowLabel}>GitHub Release Notes</Text>
            </View>
            <View style={s.subRowRight}>
              <Text style={s.domainPill}>github.com</Text>
              <ArrowUpRight size={14} color="#71717A" />
            </View>
          </TouchableOpacity>
        </View>

        {/* ── 5. CORE PRIVACY & SPECS ── */}
        <View style={s.sectionHeader}>
          <View style={[s.sectionDot, { backgroundColor: '#34C759' }]} />
          <Text style={s.sectionTitle}>PRIVACY & ARCHITECTURE</Text>
        </View>

        <View style={s.glassCard}>
          <View style={s.specRow}>
            <View style={s.specLeft}>
              <ShieldTick size={17} color="#34C759" />
              <Text style={s.specLabel}>Zero Tracking & Ads</Text>
            </View>
            <View style={s.specPill}>
              <Text style={[s.specPillText, { color: '#34C759' }]}>100% Private</Text>
            </View>
          </View>

          <View style={s.divider} />

          <View style={s.specRow}>
            <View style={s.specLeft}>
              <Cpu size={17} color="#38bdf8" />
              <Text style={s.specLabel}>Extraction Engine</Text>
            </View>
            <View style={s.specPill}>
              <Text style={[s.specPillText, { color: '#38bdf8' }]}>On-Device</Text>
            </View>
          </View>

          <View style={s.divider} />

          <View style={s.specRow}>
            <View style={s.specLeft}>
              <Code size={17} color="#A1A1AA" />
              <Text style={s.specLabel}>Software License</Text>
            </View>
            <View style={s.specPill}>
              <Text style={s.specPillText}>MIT Open Source</Text>
            </View>
          </View>

          <View style={s.divider} />

          {/* Deep Link to Dedicated About & Creator Screen */}
          <TouchableOpacity
            activeOpacity={0.7}
            style={s.aboutRowBtn}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              navigateWithCascade('About');
            }}
          >
            <View style={[s.iconBox, { backgroundColor: 'rgba(99, 102, 241, 0.12)' }]}>
              <InfoCircle size={20} color="#818cf8" />
            </View>
            <View style={s.rowContent}>
              <Text style={s.rowTitle}>About AnyFetch & Creator</Text>
              <Text style={s.rowSub}>Abhishek Singh • Philosophy • Architecture</Text>
            </View>
            <ChevronRight size={16} color="#71717A" />
          </TouchableOpacity>
        </View>

        {/* ── 6. MINIMAL FOOTER ── */}
        <View style={s.footerContainer}>
          <Text style={s.footerBrand}>ANYFETCH</Text>
          <Text style={s.footerText}>
            Built with 100% local processing. No cloud telemetry, no cookies, no tracking.
          </Text>
        </View>

        {/* In-app APK Update Modal */}
        <UpdateModal
          visible={ghModalVisible}
          releaseInfo={ghRelease}
          onDismiss={() => setGhModalVisible(false)}
        />
      </ScrollView>

      {/* ═══ FLOATING FLUID BOTTOM DOCK ═══ */}
      <BottomTabBar
        activeTab="Settings"
        onSelectTab={handleSelectTab}
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
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  headerTitleWrap: {
    alignItems: 'center',
  },
  headerTitle: {
    fontFamily: FONTS.sans,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 2.2,
    color: '#FFFFFF',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 18,
  },

  /* ── Hero Card ── */
  heroCard: {
    backgroundColor: 'rgba(18, 18, 22, 0.78)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 20,
    marginBottom: 26,
    gap: 16,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  heroIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 159, 10, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 159, 10, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTextWrap: {
    flex: 1,
    gap: 3,
  },
  heroTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  heroTitle: {
    fontFamily: FONTS.display,
    fontSize: 21,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  versionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(52, 199, 89, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: 'rgba(52, 199, 89, 0.25)',
  },
  versionDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#34C759',
  },
  versionText: {
    fontFamily: FONTS.sans,
    fontSize: 10.5,
    fontWeight: '700',
    color: '#34C759',
  },
  heroSubtitle: {
    fontFamily: FONTS.sans,
    fontSize: 12,
    color: '#8E8E93',
  },
  heroBadgeGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  miniBadge: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 9,
    paddingVertical: 7,
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  miniBadgeText: {
    fontFamily: FONTS.sans,
    fontSize: 10.5,
    fontWeight: '600',
    color: '#D4D4D8',
  },
  themeDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },

  /* ── Section Titles ── */
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
    marginTop: 6,
    paddingHorizontal: 4,
  },
  sectionDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  sectionTitle: {
    fontFamily: FONTS.sans,
    fontSize: 11.5,
    fontWeight: '700',
    color: '#71717A',
    letterSpacing: 1.5,
  },

  /* ── Glass Cards ── */
  glassCard: {
    backgroundColor: 'rgba(18, 18, 22, 0.72)',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.07)',
    padding: 16,
    marginBottom: 24,
    gap: 12,
  },
  columnContainer: {
    width: '100%',
    gap: 12,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniIconBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowContent: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    fontFamily: FONTS.sans,
    fontSize: 14.5,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  rowSub: {
    fontFamily: FONTS.sans,
    fontSize: 12,
    color: '#8E8E93',
  },
  rowRightWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  themeTag: {
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.25)',
  },
  themeTagText: {
    fontFamily: FONTS.sans,
    fontSize: 11,
    fontWeight: '700',
    color: '#38bdf8',
  },
  pillBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
  },
  pillBadgeText: {
    fontFamily: FONTS.sans,
    fontSize: 11,
    color: '#A1A1AA',
    fontWeight: '600',
  },

  /* ── Storage Path Styles ── */
  pathPickerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 159, 10, 0.25)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
  },
  pathInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pathText: {
    fontFamily: FONTS.sans,
    fontSize: 12.5,
    color: '#F4F4F5',
    flex: 1,
  },
  pathChangeBtn: {
    backgroundColor: 'rgba(255, 159, 10, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 159, 10, 0.35)',
    borderRadius: 8,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  pathChangeBtnText: {
    fontFamily: FONTS.sans,
    fontSize: 11.5,
    fontWeight: '700',
    color: '#FF9F0A',
  },
  noteContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  noteText: {
    fontFamily: FONTS.sans,
    fontSize: 11.5,
    color: '#71717A',
    lineHeight: 16,
  },

  /* ── Updates Section ── */
  updateHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  statusBadgeSuccess: {
    backgroundColor: 'rgba(52, 199, 89, 0.12)',
  },
  statusBadgeWarning: {
    backgroundColor: 'rgba(255, 159, 10, 0.15)',
  },
  statusBadgeError: {
    backgroundColor: 'rgba(255, 69, 58, 0.12)',
  },
  statusBadgeNeutral: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#8E8E93',
  },
  statusDotSuccess: {
    backgroundColor: '#34C759',
  },
  statusDotWarning: {
    backgroundColor: '#FF9F0A',
  },
  statusDotError: {
    backgroundColor: '#FF453A',
  },
  statusBadgeText: {
    fontFamily: FONTS.sans,
    fontSize: 11.5,
    color: '#8E8E93',
    fontWeight: '600',
  },
  statusTextSuccess: {
    color: '#34C759',
  },
  statusTextWarning: {
    color: '#FF9F0A',
  },
  statusTextError: {
    color: '#FF453A',
  },

  /* ── Update Banner ── */
  updateAlertBox: {
    backgroundColor: 'rgba(255, 159, 10, 0.08)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 159, 10, 0.28)',
    padding: 14,
    gap: 10,
    marginTop: 2,
  },
  updateAlertHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  updateAlertTitle: {
    fontFamily: FONTS.sans,
    fontSize: 13.5,
    fontWeight: '700',
    color: '#FFFFFF',
    flex: 1,
  },
  versionTagPill: {
    backgroundColor: 'rgba(255, 159, 10, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  versionTagText: {
    fontFamily: FONTS.sans,
    fontSize: 11,
    fontWeight: '700',
    color: '#FF9F0A',
  },
  updateAlertNotes: {
    fontFamily: FONTS.sans,
    fontSize: 12,
    color: '#A1A1AA',
    lineHeight: 17,
  },
  installActionBtn: {
    backgroundColor: '#FF9F0A',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginTop: 2,
  },
  installActionBtnText: {
    fontFamily: FONTS.sans,
    fontSize: 13,
    fontWeight: '700',
    color: '#000000',
  },

  /* ── Check Button ── */
  checkActionContainer: {
    gap: 6,
  },
  checkBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.09)',
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkBtnDisabled: {
    opacity: 0.6,
  },
  checkBtnError: {
    backgroundColor: 'rgba(255, 69, 58, 0.1)',
    borderColor: 'rgba(255, 69, 58, 0.3)',
  },
  checkBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checkBtnText: {
    fontFamily: FONTS.sans,
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  checkBtnTextMuted: {
    fontFamily: FONTS.sans,
    fontSize: 13,
    color: '#8E8E93',
  },
  checkBtnTextError: {
    color: '#FF453A',
  },
  checkErrorText: {
    fontFamily: FONTS.sans,
    fontSize: 11.5,
    color: '#FF453A',
    textAlign: 'center',
    marginTop: 2,
  },

  /* ── Divider ── */
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    marginVertical: 2,
  },

  /* ── Sub Rows ── */
  subRowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 5,
    gap: 10,
  },
  subRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 0,
  },
  subRowLabel: {
    fontFamily: FONTS.sans,
    fontSize: 13.5,
    color: '#E4E4E7',
    fontWeight: '500',
  },
  subRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    justifyContent: 'flex-end',
  },
  repoPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    maxWidth: '82%',
  },
  subRowValue: {
    fontFamily: FONTS.sans,
    fontSize: 11.5,
    color: '#8E8E93',
  },
  domainPill: {
    fontFamily: FONTS.sans,
    fontSize: 11.5,
    color: '#8E8E93',
  },

  /* ── Drawer for Repo ── */
  repoDrawer: {
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 12,
    gap: 10,
    marginTop: 4,
  },
  repoDrawerHint: {
    fontFamily: FONTS.sans,
    fontSize: 11.5,
    color: '#8E8E93',
    lineHeight: 16,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#09090B',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 10,
    height: 40,
  },
  repoInput: {
    flex: 1,
    fontFamily: FONTS.sans,
    color: '#FFFFFF',
    fontSize: 13,
    paddingVertical: 0,
  },
  drawerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  drawerBtnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  drawerBtnText: {
    fontFamily: FONTS.sans,
    fontSize: 11,
    fontWeight: '600',
    color: '#E4E4E7',
  },
  drawerBtnPrimary: {
    backgroundColor: '#FF9F0A',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  drawerBtnPrimaryText: {
    fontFamily: FONTS.sans,
    fontSize: 11.5,
    fontWeight: '700',
    color: '#000000',
  },

  /* ── Spec Rows ── */
  specRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  specLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  specLabel: {
    fontFamily: FONTS.sans,
    fontSize: 13.5,
    color: '#E4E4E7',
    fontWeight: '500',
  },
  specPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  specPillText: {
    fontFamily: FONTS.sans,
    fontSize: 11,
    color: '#A1A1AA',
    fontWeight: '600',
  },

  /* ── About Link Row ── */
  aboutRowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 2,
  },

  /* ── Footer ── */
  footerContainer: {
    alignItems: 'center',
    paddingVertical: 20,
    gap: 6,
  },
  footerBrand: {
    fontFamily: FONTS.sans,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
    color: '#52525B',
  },
  footerText: {
    fontFamily: FONTS.sans,
    fontSize: 11.5,
    color: '#3F3F46',
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 16,
  },
});
