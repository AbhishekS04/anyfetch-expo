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
  View,
} from 'react-native';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import {
  documentDirectory,
  StorageAccessFramework,
  getInfoAsync,
  readAsStringAsync,
  writeAsStringAsync,
} from 'expo-file-system/legacy';
import { Ionicons } from '@expo/vector-icons';
import appJson from '../../app.json';

const SETTINGS_FILE = (documentDirectory ?? '') + 'settings.json';

export default function SettingsScreen() {
  const { currentlyRunning } = Updates.useUpdates();

  const isUpdatesSupported = Updates.isEnabled;

  // ─── Update state machine ─────────────────────────────────────────────
  // 'idle'        → button active, "Check for Updates"
  // 'checking'    → spinner, button disabled
  // 'downloading' → spinner + progress label, button disabled
  // 'uptodate'    → gray disabled, "Up to Date ✓"
  // 'error'       → red, "Retry"
  type UpdatePhase = 'idle' | 'checking' | 'downloading' | 'uptodate' | 'error';
  const [updatePhase, setUpdatePhase] = useState<UpdatePhase>('idle');
  const [updateError, setUpdateError] = useState<string | null>(null);

  const [useCustomDirectory, setUseCustomDirectory] = useState(false);
  const [customDirectoryUri, setCustomDirectoryUri] = useState('');
  const [customDirectoryName, setCustomDirectoryName] = useState('');

  // Version reads from the JS bundle (app.json imported by Metro), so it
  // changes on every OTA push without needing a new native build.
  let runningVersion = appJson.expo?.version || Constants.expoConfig?.version || '1.0.0';
  if (currentlyRunning && !currentlyRunning.isEmbeddedLaunch) {
    runningVersion = `${runningVersion} (OTA)`;
  }

  /**
   * One-tap update handler:
   * check → (if available) download → reloadAsync() automatically.
   * The app hard-restarts; execution never continues past reloadAsync().
   */
  const handleCheckForUpdates = async () => {
    if (!isUpdatesSupported) return;
    setUpdateError(null);
    try {
      setUpdatePhase('checking');
      const check = await Updates.checkForUpdateAsync();

      if (!check.isAvailable) {
        setUpdatePhase('uptodate');
        return;
      }

      // Update found — download it
      setUpdatePhase('downloading');
      await Updates.fetchUpdateAsync();

      // Download complete — restart immediately into the new bundle
      await Updates.reloadAsync();
      // (execution stops here — the app fully restarts)
    } catch (err: any) {
      const msg: string = err?.message ?? String(err);
      // Gracefully ignore "updates disabled" in dev / expo-go
      if (
        msg.includes('ERR_UPDATES_DISABLED') ||
        msg.includes('expo-updates is not enabled') ||
        msg.includes('not enabled')
      ) {
        setUpdatePhase('idle');
        return;
      }
      console.warn('[Updates] error:', msg);
      setUpdateError(
        msg.includes('network') || msg.includes('fetch') || msg.includes('connect') || msg.includes('ECONNREFUSED')
          ? 'Cannot reach update server. Make sure the server is running on your PC and both devices are on the same Wi-Fi.'
          : 'Update failed. Tap Retry to try again.'
      );
      setUpdatePhase('error');
    }
  };

  // Load settings on mount
  useEffect(() => {
    async function loadSettings() {
      try {
        const fileInfo = await getInfoAsync(SETTINGS_FILE);
        if (fileInfo.exists) {
          const content = await readAsStringAsync(SETTINGS_FILE);
          const settings = JSON.parse(content);
          setUseCustomDirectory(!!settings.useCustomDirectory);
          setCustomDirectoryUri(settings.customDirectoryUri ?? '');
          setCustomDirectoryName(settings.customDirectoryName ?? '');
        }
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

      {/* App Updates Section */}
      <Text style={[s.section, s.mt]}>APP UPDATES</Text>
      <View style={s.card}>
        <Row label="OTA Updates" value={isUpdatesSupported ? 'Enabled' : 'Disabled (Dev Mode)'} />
        {currentlyRunning?.updateId ? (
          <>
            <Sep />
            <Row label="Update ID" value={currentlyRunning.updateId.slice(0, 8) + '...'} />
          </>
        ) : null}
        <Sep />
        <View style={s.updatesContainer}>
          {/* Status text */}
          {updatePhase === 'error' && updateError ? (
            <Text style={s.updateErrText}>{updateError}</Text>
          ) : updatePhase === 'uptodate' ? (
            <Text style={s.updateStatusText}>Your app is up to date.</Text>
          ) : updatePhase === 'checking' ? (
            <Text style={s.updateStatusText}>Checking for updates…</Text>
          ) : updatePhase === 'downloading' ? (
            <Text style={s.updateStatusText}>Downloading update… app will restart automatically.</Text>
          ) : null}

          {/* Main update button */}
          <Pressable
            style={[
              s.updateBtn,
              !isUpdatesSupported && s.updateBtnDisabled,
              updatePhase === 'checking'    && s.updateBtnBusy,
              updatePhase === 'downloading' && s.updateBtnBusy,
              updatePhase === 'uptodate'    && s.updateBtnUpToDate,
              updatePhase === 'error'       && s.updateBtnError,
            ]}
            disabled={
              !isUpdatesSupported ||
              updatePhase === 'checking' ||
              updatePhase === 'downloading' ||
              updatePhase === 'uptodate'
            }
            onPress={handleCheckForUpdates}
          >
            {updatePhase === 'checking' || updatePhase === 'downloading' ? (
              <View style={s.updateBtnInner}>
                <ActivityIndicator size="small" color="#000000" />
                <Text style={s.updateBtnText}>
                  {updatePhase === 'downloading' ? 'Downloading…' : 'Checking…'}
                </Text>
              </View>
            ) : (
              <Text style={[
                s.updateBtnText,
                updatePhase === 'uptodate'  && s.updateBtnUpToDateText,
                !isUpdatesSupported         && s.updateBtnUpToDateText,
                updatePhase === 'error'     && s.updateBtnErrorText,
              ]}>
                {updatePhase === 'uptodate'
                  ? 'Up to Date  ✓'
                  : updatePhase === 'error'
                    ? 'Retry'
                    : 'Check for Updates'}
              </Text>
            )}
          </Pressable>
        </View>
      </View>

      <Pressable
        style={s.ghBtn}
        onPress={() => Linking.openURL('https://github.com/AbhishekS04/anyfetch').catch(() => {})}>
        <Text style={s.ghBtnText}>View on GitHub →</Text>
      </Pressable>

      <Text style={s.footer}>
        anyfetch runs 100% locally on your device. Emojis and files are parsed and extracted locally. No servers. No tracing.
      </Text>
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
  updatesContainer: {
    paddingVertical: 4,
    gap: 12,
  },
  updateStatusText: {
    color: '#8E8E93',
    fontSize: 13,
    lineHeight: 18,
  },
  updateErrText: {
    color: '#FF453A',
    fontSize: 13,
    lineHeight: 18,
  },
  updateBtn: {
    backgroundColor: '#FF9F0A',
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 42,
  },
  updateBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  updateBtnBusy: {
    backgroundColor: 'rgba(255, 159, 10, 0.55)',
  },
  updateBtnDisabled: {
    backgroundColor: 'rgba(255, 159, 10, 0.4)',
  },
  updateBtnText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '700',
  },
  updateBtnUpToDate: {
    backgroundColor: '#2C2C2E',
  },
  updateBtnUpToDateText: {
    color: '#8E8E93',
  },
  updateBtnError: {
    backgroundColor: 'rgba(255, 69, 58, 0.18)',
    borderWidth: 1,
    borderColor: '#FF453A',
  },
  updateBtnErrorText: {
    color: '#FF453A',
  },
});
