/**
 * SettingsScreen — Expo Go compatible
 * Supports custom path selection via Storage Access Framework (SAF) on Android.
 */

import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import Constants from 'expo-constants';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import {
  documentDirectory,
  StorageAccessFramework,
  getInfoAsync,
  readAsStringAsync,
  writeAsStringAsync,
} from 'expo-file-system/legacy';
import { Ionicons } from '@expo/vector-icons';
import appJson from '../../app.json';
import {
  checkForGitHubUpdate,
  getSavedGitHubRepo,
  saveGitHubRepo,
  DEFAULT_REPO,
  DEFAULT_REPO_URL,
  normalizeGitHubRepo,
  GitHubReleaseInfo,
} from '../services/githubUpdate';
import UpdateModal from '../components/UpdateModal';

const SETTINGS_FILE = (documentDirectory ?? '') + 'settings.json';

export default function SettingsScreen() {
  // GitHub in-app APK updater state
  const [activeRepo, setActiveRepo] = useState<string>(DEFAULT_REPO);
  const [repoInput, setRepoInput] = useState<string>(DEFAULT_REPO_URL);
  const [isEditingRepo, setIsEditingRepo] = useState(false);
  const [ghRelease, setGhRelease] = useState<GitHubReleaseInfo | null>(null);
  const [ghCheckPhase, setGhCheckPhase] = useState<'idle' | 'checking' | 'uptodate' | 'available' | 'error'>('idle');
  const [ghCheckError, setGhCheckError] = useState<string | null>(null);
  const [ghModalVisible, setGhModalVisible] = useState(false);

  const [useCustomDirectory, setUseCustomDirectory] = useState(false);
  const [customDirectoryUri, setCustomDirectoryUri] = useState('');
  const [customDirectoryName, setCustomDirectoryName] = useState('');

  const runningVersion = appJson.expo?.version || Constants.expoConfig?.version || '1.0.8';

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

  // Save settings helper
  const saveSettings = async (useDir: boolean, uri: string, name: string) => {
    try {
      const config = {
        useCustomDirectory: useDir,
        customDirectoryUri: uri,
        customDirectoryName: name,
      };
      await writeAsStringAsync(SETTINGS_FILE, JSON.stringify(config));
    } catch (err) {
      console.warn('Failed to save settings:', err);
    }
  };

  const handleToggleCustom = async (val: boolean) => {
    if (val && !customDirectoryUri) {
      // Need to pick a folder first
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
        
        // Decode URI to extract a user-friendly folder path/name
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

  return (
    <ScrollView style={s.root} contentContainerStyle={s.content}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />

      {/* Download path configuration */}
      <Text style={s.section}>STORAGE & PATHS</Text>
      <View style={s.card}>
        <Text style={s.label}>DOWNLOAD DESTINATION</Text>
        
        {Platform.OS === 'android' ? (
          <View style={s.settingsContainer}>
            <View style={s.row}>
              <Text style={s.rowLabel}>Save to custom folder</Text>
              <Switch
                value={useCustomDirectory}
                onValueChange={handleToggleCustom}
                trackColor={{ false: '#1C1C1E', true: 'rgba(255, 159, 10, 0.4)' }}
                thumbColor={useCustomDirectory ? '#FF9F0A' : '#8E8E93'}
              />
            </View>

            {useCustomDirectory && (
              <View style={s.pathPickerBox}>
                <View style={s.pathRow}>
                  <Ionicons name="folder-open" size={20} color="#FF9F0A" />
                  <Text style={s.pathText} numberOfLines={2}>
                    {customDirectoryName || 'No folder chosen'}
                  </Text>
                </View>
                <Pressable style={s.actionTextBtn} onPress={() => handleSelectDirectory(false)}>
                  <Text style={s.actionTextBtnTxt}>Change Folder</Text>
                </Pressable>
              </View>
            )}

            {!useCustomDirectory && (
              <Text style={s.sub}>
                Currently saving via native share dialog (lets you share or manually select location on save).
              </Text>
            )}
          </View>
        ) : (
          <View style={s.settingsContainer}>
            <Text style={s.value}>Device share sheets</Text>
            <Text style={s.sub}>
              On iOS, media files are exported using the system Share Sheet. You can choose to share them or save directly to your Files app.
            </Text>
          </View>
        )}
      </View>

      {/* About Section */}
      <Text style={[s.section, s.mt]}>ABOUT ANYFETCH</Text>
      <View style={s.card}>
        <Row label="Version" value={`v${runningVersion}`} />
        <Sep />
        <Row label="No ads" value="✓" />
        <Sep />
        <Row label="No analytics" value="✓" />
        <Sep />
        <Row label="Privacy first" value="On-device" />
        <Sep />
        <Row label="License" value="MIT" />
      </View>

      {/* Software Updates / GitHub Releases */}
      <Text style={[s.section, s.mt]}>UPDATES</Text>
      <View style={s.card}>
        {/* App Version & Status Header */}
        <View style={s.updateHeader}>
          <View style={s.updateIconBox}>
            <Ionicons name="sparkles" size={17} color="#FF9F0A" />
          </View>
          <View style={s.updateInfo}>
            <Text style={s.updateTitle}>AnyFetch for Android</Text>
            <Text style={s.updateSubtitle}>Version {runningVersion}</Text>
          </View>
          <View
            style={[
              s.statusBadge,
              ghCheckPhase === 'uptodate' && s.statusBadgeSuccess,
              ghCheckPhase === 'available' && s.statusBadgeWarning,
              ghCheckPhase === 'error' && s.statusBadgeError,
              ghCheckPhase === 'checking' && s.statusBadgeNeutral,
            ]}>
            {ghCheckPhase === 'checking' ? (
              <ActivityIndicator size="small" color="#8E8E93" style={{ transform: [{ scale: 0.65 }] }} />
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
              ]}>
              {ghCheckPhase === 'checking'
                ? 'Checking…'
                : ghCheckPhase === 'available' && ghRelease
                ? `v${ghRelease.latestVersion} Available`
                : ghCheckPhase === 'uptodate'
                ? 'Up to date'
                : ghCheckPhase === 'error'
                ? 'Failed'
                : 'Current'}
            </Text>
          </View>
        </View>

        {/* Update Available Banner */}
        {ghCheckPhase === 'available' && ghRelease ? (
          <View style={s.newReleaseCard}>
            <View style={s.newReleaseHeader}>
              <Ionicons name="arrow-down-circle" size={18} color="#FF9F0A" />
              <Text style={s.newReleaseTitle}>New Version Ready</Text>
              <Text style={s.newReleaseTag}>v{ghRelease.latestVersion}</Text>
            </View>
            <Text style={s.newReleaseNotes} numberOfLines={2}>
              {ghRelease.releaseTitle || ghRelease.releaseNotes || 'Includes the latest features and fixes.'}
            </Text>
            <Pressable
              style={s.installBtn}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                setGhModalVisible(true);
              }}>
              <Ionicons name="download-outline" size={15} color="#000000" />
              <Text style={s.installBtnText}>Download & Install APK</Text>
            </Pressable>
          </View>
        ) : (
          <View style={s.checkActionBox}>
            <Pressable
              style={[
                s.checkBtn,
                ghCheckPhase === 'checking' && s.checkBtnDisabled,
                ghCheckPhase === 'error' && s.checkBtnRetry,
              ]}
              disabled={ghCheckPhase === 'checking'}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                handleCheckGitHubRelease();
              }}>
              {ghCheckPhase === 'checking' ? (
                <View style={s.checkBtnInner}>
                  <ActivityIndicator size="small" color="#8E8E93" />
                  <Text style={s.checkBtnTextMuted}>Checking GitHub Releases…</Text>
                </View>
              ) : (
                <View style={s.checkBtnInner}>
                  <Ionicons
                    name={ghCheckPhase === 'error' ? 'refresh' : 'refresh-outline'}
                    size={15}
                    color={ghCheckPhase === 'error' ? '#FF453A' : '#E5E5EA'}
                  />
                  <Text
                    style={[
                      s.checkBtnText,
                      ghCheckPhase === 'error' && s.checkBtnTextError,
                    ]}>
                    {ghCheckPhase === 'error' ? 'Retry Check' : 'Check for Updates'}
                  </Text>
                </View>
              )}
            </Pressable>
            {ghCheckError && ghCheckPhase === 'error' ? (
              <Text style={s.errorHintText}>{ghCheckError}</Text>
            ) : null}
          </View>
        )}

        <Sep />

        {/* Source Repository Row */}
        <Pressable
          style={s.channelRow}
          onPress={() => setIsEditingRepo(!isEditingRepo)}>
          <View style={s.channelLeft}>
            <Ionicons name="logo-github" size={16} color="#8E8E93" />
            <Text style={s.channelLabel}>Source Repository</Text>
          </View>
          <View style={s.channelRight}>
            <Text style={s.channelValue} numberOfLines={1}>
              {activeRepo}
            </Text>
            <Ionicons
              name={isEditingRepo ? 'chevron-up' : 'chevron-down'}
              size={13}
              color="#8E8E93"
            />
          </View>
        </Pressable>

        {/* Collapsible Repository Editor */}
        {isEditingRepo && (
          <View style={s.repoDrawer}>
            <Text style={s.repoDrawerHint}>
              Specify a custom repository URL or owner/repo to fetch releases:
            </Text>
            <View style={s.drawerInputRow}>
              <Ionicons name="link-outline" size={15} color="#8E8E93" style={{ marginRight: 6 }} />
              <TextInput
                style={s.drawerInput}
                value={repoInput}
                onChangeText={setRepoInput}
                placeholder="AbhishekS04/anyfetch-expo"
                placeholderTextColor="#555558"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                returnKeyType="done"
                onSubmitEditing={() => handleSaveAndAutoCheckRepo(repoInput)}
              />
            </View>
            <View style={s.drawerActionRow}>
              <Pressable style={s.drawerSmallBtn} onPress={handlePasteRepoFromClipboard}>
                <Ionicons name="clipboard-outline" size={12} color="#E5E5EA" />
                <Text style={s.drawerSmallBtnText}>Paste</Text>
              </Pressable>
              <Pressable style={s.drawerSmallBtn} onPress={handleResetRepoToDefault}>
                <Ionicons name="refresh-outline" size={12} color="#8E8E93" />
                <Text style={[s.drawerSmallBtnText, { color: '#8E8E93' }]}>Reset</Text>
              </Pressable>
              <View style={{ flex: 1 }} />
              <Pressable
                style={s.drawerApplyBtn}
                onPress={() => handleSaveAndAutoCheckRepo(repoInput)}>
                <Text style={s.drawerApplyBtnText}>Apply</Text>
              </Pressable>
            </View>
          </View>
        )}

        <Sep />

        {/* Release Notes Link */}
        <Pressable
          style={s.linkRow}
          onPress={() =>
            Linking.openURL(`https://github.com/${activeRepo}/releases`).catch(() => {})
          }>
          <View style={s.channelLeft}>
            <Ionicons name="newspaper-outline" size={16} color="#8E8E93" />
            <Text style={s.channelLabel}>Release Notes</Text>
          </View>
          <View style={s.channelRight}>
            <Text style={s.linkDomain}>GitHub</Text>
            <Ionicons name="open-outline" size={13} color="#8E8E93" />
          </View>
        </Pressable>
      </View>

      <Text style={s.footer}>
        anyfetch runs 100% locally on your device. Emojis and files are parsed and extracted locally. No servers. No tracing.
      </Text>

      {/* In-app APK Update Modal */}
      <UpdateModal
        visible={ghModalVisible}
        releaseInfo={ghRelease}
        onDismiss={() => setGhModalVisible(false)}
      />
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={s.rowVal}>{value}</Text>
    </View>
  );
}
function Sep() { return <View style={s.sep} />; }

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  content: { padding: 24, paddingBottom: 48 },
  section: { color: '#48484A', fontSize: 11, fontWeight: '600', letterSpacing: 1.5, marginBottom: 12 },
  mt: { marginTop: 32 },
  card: { backgroundColor: '#1C1C1E', borderRadius: 14, borderWidth: 1, borderColor: '#2C2C2E', padding: 18, gap: 12 },
  label: { color: '#FF9F0A', fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 4 },
  value: { color: '#E5E5EA', fontSize: 14 },
  sub: { color: '#8E8E93', fontSize: 12, lineHeight: 18, marginTop: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  rowLabel: { color: '#E5E5EA', fontSize: 14, fontWeight: '500' },
  rowVal: { color: '#8E8E93', fontSize: 14, fontWeight: '500' },
  sep: { height: 1, backgroundColor: '#2C2C2E', marginVertical: 2 },
  ghBtn: { marginTop: 28, alignSelf: 'center' },
  ghBtnText: { color: '#8E8E93', fontSize: 13, fontWeight: '600' },
  footer: { marginTop: 28, color: '#3A3A3C', fontSize: 12, lineHeight: 19, textAlign: 'center', paddingHorizontal: 12 },
  
  settingsContainer: { width: '100%', gap: 8 },
  pathPickerBox: {
    backgroundColor: '#000000',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2C2C2E',
    padding: 12,
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  pathRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  pathText: {
    color: '#E5E5EA',
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  actionTextBtn: {
    backgroundColor: '#1C1C1E',
    borderColor: '#2C2C2E',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  actionTextBtnTxt: {
    color: '#FF9F0A',
    fontSize: 12,
    fontWeight: '600',
  },
  /* Updates Section Styles */
  updateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  updateIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 159, 10, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  updateInfo: {
    flex: 1,
    gap: 2,
  },
  updateTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  updateSubtitle: {
    color: '#8E8E93',
    fontSize: 13,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#2C2C2E',
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
    backgroundColor: '#2C2C2E',
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
    fontSize: 12,
    fontWeight: '600',
    color: '#8E8E93',
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
  newReleaseCard: {
    backgroundColor: '#121214',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 159, 10, 0.3)',
    padding: 12,
    gap: 8,
    marginTop: 2,
  },
  newReleaseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  newReleaseTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  newReleaseTag: {
    color: '#FF9F0A',
    fontSize: 12,
    fontWeight: '700',
    backgroundColor: 'rgba(255, 159, 10, 0.15)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  newReleaseNotes: {
    color: '#8E8E93',
    fontSize: 12,
    lineHeight: 16,
  },
  installBtn: {
    backgroundColor: '#FF9F0A',
    borderRadius: 8,
    paddingVertical: 9,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 4,
  },
  installBtnText: {
    color: '#000000',
    fontSize: 13,
    fontWeight: '700',
  },
  checkActionBox: {
    gap: 6,
    marginTop: 2,
  },
  checkBtn: {
    backgroundColor: '#2C2C2E',
    borderRadius: 9,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkBtnDisabled: {
    opacity: 0.6,
  },
  checkBtnRetry: {
    backgroundColor: 'rgba(255, 69, 58, 0.12)',
    borderWidth: 1,
    borderColor: '#FF453A',
  },
  checkBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checkBtnText: {
    color: '#E5E5EA',
    fontSize: 13,
    fontWeight: '600',
  },
  checkBtnTextMuted: {
    color: '#8E8E93',
    fontSize: 13,
    fontWeight: '500',
  },
  checkBtnTextError: {
    color: '#FF453A',
  },
  errorHintText: {
    color: '#FF453A',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 2,
  },
  channelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  channelLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  channelLabel: {
    color: '#E5E5EA',
    fontSize: 14,
    fontWeight: '500',
  },
  channelRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '55%',
  },
  channelValue: {
    color: '#8E8E93',
    fontSize: 13,
    fontWeight: '500',
  },
  repoDrawer: {
    backgroundColor: '#121214',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2C2C2E',
    padding: 12,
    gap: 10,
    marginTop: 4,
  },
  repoDrawerHint: {
    color: '#8E8E93',
    fontSize: 12,
    lineHeight: 16,
  },
  drawerInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#000000',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2C2C2E',
    paddingHorizontal: 10,
    height: 38,
  },
  drawerInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 13,
    paddingVertical: 0,
  },
  drawerActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  drawerSmallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#2C2C2E',
    borderRadius: 6,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  drawerSmallBtnText: {
    color: '#E5E5EA',
    fontSize: 11,
    fontWeight: '600',
  },
  drawerApplyBtn: {
    backgroundColor: '#FF9F0A',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  drawerApplyBtnText: {
    color: '#000000',
    fontSize: 11,
    fontWeight: '700',
  },
  linkRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  linkDomain: {
    color: '#8E8E93',
    fontSize: 13,
    fontWeight: '500',
  },
});
