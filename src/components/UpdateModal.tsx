import React, { useState, useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  Sparkles,
  Download,
  Code,
  DocumentText,
  AlertCircle,
  ArrowRight,
} from 'reicon-react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  downloadAndInstallApk,
  GitHubReleaseInfo,
  UpdateDownloadProgress,
} from '../services/githubUpdate';
import MarkdownView from './MarkdownView';
import { FONTS } from '../theme/typography';
import { useAppTheme } from '../theme/ThemeContext';

const { width: W } = Dimensions.get('window');

interface UpdateModalProps {
  visible: boolean;
  releaseInfo: GitHubReleaseInfo | null;
  onDismiss: () => void;
}

export default function UpdateModal({ visible, releaseInfo, onDismiss }: UpdateModalProps) {
  const insets = useSafeAreaInsets();
  const { colors: themeColors } = useAppTheme();
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<UpdateDownloadProgress | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const scaleAnim = useRef(new Animated.Value(0.92)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible && releaseInfo?.isAvailable) {
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          stiffness: 300,
          damping: 24,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      scaleAnim.setValue(0.92);
      opacityAnim.setValue(0);
    }
  }, [visible, releaseInfo?.isAvailable, scaleAnim, opacityAnim]);

  if (!visible || !releaseInfo || !releaseInfo.isAvailable) {
    return null;
  }

  const isBeta = releaseInfo.latestVersion.toLowerCase().includes('beta');
  const accentColor = themeColors.accent || '#FF9F0A';

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

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setDownloading(true);
    setErrorMsg(null);
    setProgress({ fraction: 0, received: 0, total: releaseInfo.apkSize || 0 });

    const result = await downloadAndInstallApk(releaseInfo.apkUrl, (p) => {
      setProgress(p);
    });

    setDownloading(false);

    if (result.ok) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onDismiss();
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setErrorMsg(result.error ?? 'Installation could not start.');
    }
  };

  const handleDismiss = () => {
    if (downloading) return;
    Animated.parallel([
      Animated.timing(scaleAnim, {
        toValue: 0.94,
        duration: 140,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 140,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onDismiss();
    });
  };

  const pct = Math.round((progress?.fraction ?? 0) * 100);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleDismiss}>
      <View
        style={[
          s.overlay,
          {
            paddingTop: Math.max(insets.top + 16, 28),
            paddingBottom: Math.max(insets.bottom + 16, 28),
          },
        ]}>
        <Animated.View
          style={[
            s.card,
            {
              opacity: opacityAnim,
              transform: [{ scale: scaleAnim }],
            },
          ]}>
          {/* Header Row with Custom App Icon & Badges */}
          <View style={s.headerRow}>
            <View style={[s.iconBadge, { borderColor: `${accentColor}44` }]}>
              <Image
                source={require('../../logo/mainlogo.png')}
                style={s.appIconImage}
                resizeMode="cover"
              />
            </View>

            <View style={s.headerTextCol}>
              <View style={s.titleRow}>
                <Text style={s.title}>AnyFetch Update</Text>
                {isBeta && (
                  <View style={[s.betaPill, { backgroundColor: `${accentColor}25`, borderColor: `${accentColor}55` }]}>
                    <Text style={[s.betaPillText, { color: accentColor }]}>BETA</Text>
                  </View>
                )}
              </View>

              {/* Version Jump Indicator */}
              <View style={s.versionJumpRow}>
                <Text style={s.oldVersionText}>v{releaseInfo.currentVersion}</Text>
                <ArrowRight size={12} color="#8E8E93" />
                <View style={[s.newVersionBadge, { backgroundColor: `${accentColor}18`, borderColor: `${accentColor}44` }]}>
                  <Text style={[s.newVersionText, { color: accentColor }]}>
                    v{releaseInfo.latestVersion}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* Size & Source Meta Row */}
          <View style={s.metaRow}>
            {releaseInfo.apkSize > 0 && (
              <View style={s.metaBadge}>
                <Download size={13} color="#8E8E93" />
                <Text style={s.metaText}>APK {formatBytes(releaseInfo.apkSize)}</Text>
              </View>
            )}
            {releaseInfo.repo ? (
              <View style={s.metaBadge}>
                <Code size={13} color={accentColor} />
                <Text style={s.metaText} numberOfLines={1}>{releaseInfo.repo}</Text>
              </View>
            ) : null}
          </View>

          {/* Release Notes */}
          <View style={s.notesContainer}>
            <View style={s.notesHeaderRow}>
              <DocumentText size={13} color={accentColor} />
              <Text style={[s.notesHeader, { color: accentColor }]}>WHAT'S NEW</Text>
            </View>
            <ScrollView
              style={s.notesScroll}
              contentContainerStyle={s.notesScrollContent}
              nestedScrollEnabled
              showsVerticalScrollIndicator={true}>
              <MarkdownView content={releaseInfo.releaseNotes} />
            </ScrollView>
          </View>

          {/* Progress / Error message */}
          {errorMsg && (
            <View style={s.errorBox}>
              <AlertCircle size={16} color="#FF453A" />
              <Text style={s.errorText}>{errorMsg}</Text>
            </View>
          )}

          {downloading && (
            <View style={s.progressSection}>
              <View style={s.progressRow}>
                <Text style={s.progressLabel}>
                  {pct >= 100 ? 'Launching installer…' : 'Downloading update…'}
                </Text>
                <Text style={[s.progressPct, { color: accentColor }]}>{pct}%</Text>
              </View>

              <View style={s.progressBarTrack}>
                <View
                  style={[
                    s.progressBarFill,
                    { width: `${Math.min(100, pct)}%`, backgroundColor: accentColor },
                  ]}
                />
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
              style={[
                s.updateBtn,
                { backgroundColor: accentColor },
                downloading && s.updateBtnBusy,
              ]}
              disabled={downloading}
              onPress={handleStartUpdate}>
              {downloading ? (
                <View style={s.btnInner}>
                  <ActivityIndicator size="small" color="#000000" />
                  <Text style={s.updateBtnText}>Downloading…</Text>
                </View>
              ) : (
                <View style={s.btnInner}>
                  <Sparkles size={16} color="#000000" />
                  <Text style={s.updateBtnText}>
                    {errorMsg ? 'Retry' : `Update to v${releaseInfo.latestVersion}`}
                  </Text>
                </View>
              )}
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.82)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  card: {
    width: Math.min(W - 32, 400),
    maxHeight: '90%',
    backgroundColor: '#121215',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    padding: 22,
    gap: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.65,
    shadowRadius: 28,
    elevation: 20,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  iconBadge: {
    width: 54,
    height: 54,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1.5,
    backgroundColor: '#000000',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  appIconImage: {
    width: '100%',
    height: '100%',
  },
  headerTextCol: {
    flex: 1,
    gap: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontFamily: FONTS.display,
    color: '#FFFFFF',
    fontSize: 20,
    letterSpacing: -0.2,
  },
  betaPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  betaPillText: {
    fontFamily: FONTS.sans,
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  versionJumpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  oldVersionText: {
    fontFamily: FONTS.sans,
    color: '#71717A',
    fontSize: 12,
  },
  newVersionBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    borderWidth: 1,
  },
  newVersionText: {
    fontFamily: FONTS.sans,
    fontSize: 12,
    fontWeight: '700',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  metaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  metaText: {
    fontFamily: FONTS.sans,
    color: '#A1A1AA',
    fontSize: 11.5,
    fontWeight: '500',
  },
  notesContainer: {
    gap: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  notesHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  notesHeader: {
    fontFamily: FONTS.sans,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  notesScroll: {
    maxHeight: 180,
  },
  notesScrollContent: {
    paddingBottom: 4,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 69, 58, 0.15)',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#FF453A',
  },
  errorText: {
    fontFamily: FONTS.sans,
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
    fontFamily: FONTS.sans,
    color: '#E5E5EA',
    fontSize: 12,
    fontWeight: '500',
  },
  progressPct: {
    fontFamily: FONTS.sans,
    fontSize: 12,
    fontWeight: '700',
  },
  progressBarTrack: {
    height: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressBytes: {
    fontFamily: FONTS.sans,
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
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  dismissBtnText: {
    fontFamily: FONTS.sans,
    color: '#A1A1AA',
    fontSize: 13.5,
    fontWeight: '600',
  },
  updateBtn: {
    flex: 2,
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
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
    fontFamily: FONTS.sans,
    color: '#000000',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
});
