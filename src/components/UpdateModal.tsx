import React, { useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import {
  downloadAndInstallApk,
  GitHubReleaseInfo,
  UpdateDownloadProgress,
} from '../services/githubUpdate';

const { width: W } = Dimensions.get('window');

interface UpdateModalProps {
  visible: boolean;
  releaseInfo: GitHubReleaseInfo | null;
  onDismiss: () => void;
}

export default function UpdateModal({ visible, releaseInfo, onDismiss }: UpdateModalProps) {
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<UpdateDownloadProgress | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!visible || !releaseInfo || !releaseInfo.isAvailable) {
    return null;
  }

  const formatBytes = (bytes: number): string => {
    if (!bytes || bytes <= 0) return '0 MB';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  const handleStartUpdate = async () => {
    if (!releaseInfo.apkUrl) {
      setErrorMsg('No APK file found in this release.');
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setDownloading(true);
    setErrorMsg(null);
    setProgress({ fraction: 0, received: 0, total: releaseInfo.apkSize || 0 });

    const result = await downloadAndInstallApk(releaseInfo.apkUrl, (p) => {
      setProgress(p);
    });

    setDownloading(false);

    if (result.ok) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onDismiss();
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setErrorMsg(result.error ?? 'Installation could not start.');
    }
  };

  const pct = Math.round((progress?.fraction ?? 0) * 100);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={downloading ? undefined : onDismiss}>
      <View style={s.overlay}>
        <View style={s.card}>
          {/* Header */}
          <View style={s.headerRow}>
            <View style={s.iconBadge}>
              <Ionicons name="sparkles" size={24} color="#FF9F0A" />
            </View>
            <View style={s.headerTextCol}>
              <Text style={s.title}>New Update Available</Text>
              <Text style={s.subtitle}>
                v{releaseInfo.latestVersion} (Current: v{releaseInfo.currentVersion})
              </Text>
            </View>
          </View>

          {/* Size & Info */}
          {releaseInfo.apkSize > 0 && (
            <View style={s.metaBadge}>
              <Ionicons name="cloud-download-outline" size={14} color="#8E8E93" />
              <Text style={s.metaText}>APK Size: {formatBytes(releaseInfo.apkSize)}</Text>
            </View>
          )}

          {/* Release Notes */}
          <View style={s.notesContainer}>
            <Text style={s.notesHeader}>WHAT'S NEW</Text>
            <ScrollView style={s.notesScroll} nestedScrollEnabled>
              <Text style={s.notesText}>
                {releaseInfo.releaseNotes.trim() || 'General performance updates and fixes.'}
              </Text>
            </ScrollView>
          </View>

          {/* Progress / Error message */}
          {errorMsg && (
            <View style={s.errorBox}>
              <Ionicons name="alert-circle" size={16} color="#FF453A" />
              <Text style={s.errorText}>{errorMsg}</Text>
            </View>
          )}

          {downloading && (
            <View style={s.progressSection}>
              <View style={s.progressRow}>
                <Text style={s.progressLabel}>
                  {pct >= 100 ? 'Starting installer…' : 'Downloading update…'}
                </Text>
                <Text style={s.progressPct}>{pct}%</Text>
              </View>

              <View style={s.progressBarTrack}>
                <View style={[s.progressBarFill, { width: `${Math.min(100, pct)}%` }]} />
              </View>

              {progress && progress.total > 0 && (
                <Text style={s.progressBytes}>
                  {formatBytes(progress.received)} / {formatBytes(progress.total)}
                </Text>
              )}
            </View>
          )}

          {/* Action buttons */}
          <View style={s.btnRow}>
            {!downloading && (
              <Pressable style={s.dismissBtn} onPress={onDismiss}>
                <Text style={s.dismissBtnText}>Later</Text>
              </Pressable>
            )}

            <Pressable
              style={[s.updateBtn, downloading && s.updateBtnBusy]}
              disabled={downloading}
              onPress={handleStartUpdate}>
              {downloading ? (
                <View style={s.btnInner}>
                  <ActivityIndicator size="small" color="#000000" />
                  <Text style={s.updateBtnText}>Downloading…</Text>
                </View>
              ) : (
                <Text style={s.updateBtnText}>
                  {errorMsg ? 'Retry Update' : 'Update Now'}
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.78)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: Math.min(W - 48, 380),
    backgroundColor: '#1C1C1E',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#2C2C2E',
    padding: 22,
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  iconBadge: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 159, 10, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTextCol: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  subtitle: {
    color: '#8E8E93',
    fontSize: 13,
  },
  metaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#000000',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  metaText: {
    color: '#8E8E93',
    fontSize: 12,
    fontWeight: '500',
  },
  notesContainer: {
    gap: 8,
    backgroundColor: '#121214',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  notesHeader: {
    color: '#FF9F0A',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  notesScroll: {
    maxHeight: 120,
  },
  notesText: {
    color: '#D1D1D6',
    fontSize: 13,
    lineHeight: 19,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 69, 58, 0.15)',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#FF453A',
  },
  errorText: {
    color: '#FF453A',
    fontSize: 12,
    flex: 1,
    lineHeight: 16,
  },
  progressSection: {
    gap: 6,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressLabel: {
    color: '#E5E5EA',
    fontSize: 12,
    fontWeight: '500',
  },
  progressPct: {
    color: '#FF9F0A',
    fontSize: 12,
    fontWeight: '700',
  },
  progressBarTrack: {
    height: 8,
    backgroundColor: '#2C2C2E',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#FF9F0A',
    borderRadius: 4,
  },
  progressBytes: {
    color: '#8E8E93',
    fontSize: 11,
    textAlign: 'right',
  },
  btnRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  dismissBtn: {
    flex: 1,
    backgroundColor: '#2C2C2E',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissBtnText: {
    color: '#8E8E93',
    fontSize: 14,
    fontWeight: '600',
  },
  updateBtn: {
    flex: 2,
    backgroundColor: '#FF9F0A',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  updateBtnBusy: {
    opacity: 0.7,
  },
  btnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  updateBtnText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '700',
  },
});
