import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, AppState, AppStateStatus } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { detectPlatform, extractUrlFromText } from '../utils/download';
import { SupportedPlatform } from '../theme/platformColors';

export function useClipboardDetection() {
  const [detectedUrl, setDetectedUrl] = useState<string | null>(null);
  const lastDismissedRef = useRef<string>('');
  const animValue = useRef(new Animated.Value(0)).current;

  const showBanner = useCallback((url: string) => {
    setDetectedUrl(url);
    Animated.spring(animValue, {
      toValue: 1,
      useNativeDriver: true,
      tension: 60,
      friction: 9,
    }).start();
  }, [animValue]);

  const hideBanner = useCallback(() => {
    if (detectedUrl) {
      lastDismissedRef.current = detectedUrl;
    }
    Animated.timing(animValue, {
      toValue: 0,
      duration: 180,
      useNativeDriver: true,
    }).start(() => {
      setDetectedUrl(null);
    });
  }, [animValue, detectedUrl]);

  const checkClipboard = useCallback(async () => {
    try {
      const text = await Clipboard.getStringAsync();
      const extracted = extractUrlFromText(text);
      const platform = detectPlatform(extracted);
      if (extracted && platform && extracted !== lastDismissedRef.current) {
        showBanner(extracted);
      }
    } catch {
      // Clipboard read suppressed or permission denied
    }
  }, [showBanner]);

  useEffect(() => {
    checkClipboard();

    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        checkClipboard();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [checkClipboard]);

  const detectedPlatform = detectedUrl ? (detectPlatform(detectedUrl) as SupportedPlatform) : null;

  return {
    detectedUrl,
    detectedPlatform,
    animValue,
    hideBanner,
    checkClipboard,
  };
}
