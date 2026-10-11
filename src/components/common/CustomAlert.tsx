import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  Dimensions,
} from 'react-native';
import {
  AlertCircle,
  CheckCircle,
  InfoCircle,
  Trash,
  Sparkles,
} from 'reicon-react-native';
import * as Haptics from 'expo-haptics';
import { FONTS } from '../../theme/typography';
import { useAppTheme } from '../../theme/ThemeContext';

const { width: W } = Dimensions.get('window');

export interface CustomAlertButton {
  text?: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}

export type CustomAlertType = 'info' | 'error' | 'success' | 'warning' | 'destructive';

export interface CustomAlertConfig {
  title: string;
  message?: string;
  buttons?: CustomAlertButton[];
  type?: CustomAlertType;
}

type AlertListener = (config: CustomAlertConfig | null) => void;
let alertListener: AlertListener | null = null;

/**
 * Universal drop-in replacement for React Native's native Alert.alert.
 * Usage:
 *   customAlert.alert('Title', 'Message', [{ text: 'Cancel' }, { text: 'OK' }]);
 */
export const customAlert = {
  alert: (
    title: string,
    message?: string,
    buttons?: CustomAlertButton[],
    type?: CustomAlertType,
  ) => {
    // Auto-detect alert type from title, message, or button styles
    let resolvedType: CustomAlertType = type || 'info';
    const lowerTitle = (title || '').toLowerCase();
    const lowerMsg = (message || '').toLowerCase();
    const hasDestructiveBtn = buttons?.some((b) => b.style === 'destructive');

    if (
      hasDestructiveBtn ||
      lowerTitle.includes('delete') ||
      lowerTitle.includes('clear')
    ) {
      resolvedType = 'destructive';
    } else if (
      lowerTitle.includes('error') ||
      lowerTitle.includes('failed') ||
      lowerMsg.includes('error')
    ) {
      resolvedType = 'error';
    } else if (
      lowerTitle.includes('success') ||
      lowerTitle.includes('up to date') ||
      lowerTitle.includes('saved')
    ) {
      resolvedType = 'success';
    } else if (
      lowerTitle.includes('warning') ||
      lowerTitle.includes('unsupported')
    ) {
      resolvedType = 'warning';
    }

    const defaultButtons: CustomAlertButton[] = buttons && buttons.length > 0
      ? buttons
      : [{ text: 'OK' }];

    if (alertListener) {
      alertListener({
        title,
        message,
        buttons: defaultButtons,
        type: resolvedType,
      });
    }
  },
  dismiss: () => {
    if (alertListener) {
      alertListener(null);
    }
  },
};

/**
 * CustomAlertProvider — Mounts at the root level of the app (App.tsx)
 * to display all custom alerts with smooth spring physics, haptics, and luxury dark aesthetics.
 */
export function CustomAlertProvider() {
  const [config, setConfig] = useState<CustomAlertConfig | null>(null);
  const { colors: themeColors } = useAppTheme();
  const accentColor = themeColors.accent || '#FF9F0A';

  const scaleAnim = useRef(new Animated.Value(0.92)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    alertListener = (newConfig) => {
      if (newConfig) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        setConfig(newConfig);
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
          setConfig(null);
        });
      }
    };

    return () => {
      alertListener = null;
    };
  }, [scaleAnim, opacityAnim]);

  if (!config) return null;

  const handleButtonPress = (btn: CustomAlertButton) => {
    Haptics.selectionAsync().catch(() => {});
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
      setConfig(null);
      if (btn.onPress) {
        btn.onPress();
      }
    });
  };

  // Icon mapping
  const renderIcon = () => {
    switch (config.type) {
      case 'destructive':
        return (
          <View style={[s.iconBox, { backgroundColor: 'rgba(255, 69, 58, 0.15)', borderColor: 'rgba(255, 69, 58, 0.35)' }]}>
            <Trash size={24} color="#FF453A" />
          </View>
        );
      case 'error':
        return (
          <View style={[s.iconBox, { backgroundColor: 'rgba(255, 69, 58, 0.15)', borderColor: 'rgba(255, 69, 58, 0.35)' }]}>
            <AlertCircle size={24} color="#FF453A" />
          </View>
        );
      case 'success':
        return (
          <View style={[s.iconBox, { backgroundColor: 'rgba(52, 199, 89, 0.15)', borderColor: 'rgba(52, 199, 89, 0.35)' }]}>
            <CheckCircle size={24} color="#34C759" />
          </View>
        );
      case 'warning':
        return (
          <View style={[s.iconBox, { backgroundColor: `${accentColor}18`, borderColor: `${accentColor}44` }]}>
            <AlertCircle size={24} color={accentColor} />
          </View>
        );
      case 'info':
      default:
        return (
          <View style={[s.iconBox, { backgroundColor: `${accentColor}18`, borderColor: `${accentColor}44` }]}>
            <Sparkles size={24} color={accentColor} />
          </View>
        );
    }
  };

  const buttons = config.buttons || [{ text: 'OK' }];
  const isDualButtons = buttons.length === 2;

  return (
    <Modal
      transparent
      visible={true}
      animationType="none"
      onRequestClose={() => {
        const cancelBtn = buttons.find((b) => b.style === 'cancel');
        if (cancelBtn) handleButtonPress(cancelBtn);
        else setConfig(null);
      }}>
      <View style={s.overlay}>
        <Animated.View
          style={[
            s.card,
            {
              opacity: opacityAnim,
              transform: [{ scale: scaleAnim }],
            },
          ]}>
          {/* Custom Header Icon */}
          <View style={s.iconRow}>{renderIcon()}</View>

          {/* Title & Message */}
          <View style={s.textCol}>
            <Text style={s.titleText}>{config.title}</Text>
            {config.message ? (
              <Text style={s.messageText}>{config.message}</Text>
            ) : null}
          </View>

          {/* Action Buttons */}
          <View style={[s.buttonsContainer, isDualButtons && s.dualButtonsRow]}>
            {buttons.map((btn, idx) => {
              const isCancel = btn.style === 'cancel';
              const isDestructive = btn.style === 'destructive';
              const isPrimary = !isCancel && !isDestructive;

              let btnBg = 'rgba(255, 255, 255, 0.08)';
              let textColor = '#FFFFFF';
              let borderColor = 'rgba(255, 255, 255, 0.08)';

              if (isDestructive) {
                btnBg = '#FF453A';
                textColor = '#FFFFFF';
                borderColor = '#FF453A';
              } else if (isPrimary) {
                btnBg = accentColor;
                textColor = '#000000';
                borderColor = accentColor;
              } else if (isCancel) {
                btnBg = 'rgba(255, 255, 255, 0.06)';
                textColor = '#A1A1AA';
                borderColor = 'rgba(255, 255, 255, 0.08)';
              }

              return (
                <Pressable
                  key={idx}
                  style={({ pressed }) => [
                    s.button,
                    isDualButtons && s.dualButton,
                    { backgroundColor: btnBg, borderColor },
                    pressed && s.buttonPressed,
                  ]}
                  onPress={() => handleButtonPress(btn)}>
                  <Text style={[s.buttonText, { color: textColor }]}>
                    {btn.text ?? 'OK'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

export default customAlert;

const s = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.78)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    zIndex: 99999,
    elevation: 99999,
  },
  card: {
    width: Math.min(W - 48, 360),
    backgroundColor: '#121215',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    padding: 22,
    alignItems: 'center',
    gap: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.65,
    shadowRadius: 28,
    elevation: 20,
  },
  iconRow: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBox: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  textCol: {
    alignItems: 'center',
    gap: 6,
    width: '100%',
  },
  titleText: {
    fontFamily: FONTS.display,
    color: '#FFFFFF',
    fontSize: 19,
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  messageText: {
    fontFamily: FONTS.sans,
    color: '#9E9EA4',
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    paddingHorizontal: 4,
  },
  buttonsContainer: {
    width: '100%',
    gap: 10,
    marginTop: 4,
  },
  dualButtonsRow: {
    flexDirection: 'row',
  },
  button: {
    width: '100%',
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  dualButton: {
    flex: 1,
  },
  buttonPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.98 }],
  },
  buttonText: {
    fontFamily: FONTS.sans,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
});
