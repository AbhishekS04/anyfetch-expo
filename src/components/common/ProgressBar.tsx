import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { DownloadProgress } from '../../utils/download';

interface ProgressBarProps {
  progress: DownloadProgress | null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ProgressBar({ progress }: ProgressBarProps) {
  // fraction === -1 means indeterminate (mux stream, unknown total size)
  const isIndeterminate = (progress?.fraction ?? 0) < 0;
  const fraction = isIndeterminate ? 0 : Math.min(1, Math.max(0, progress?.fraction ?? 0));
  const pct = Math.round(fraction * 100);

  const animWidth = useRef(new Animated.Value(0)).current;
  // Indeterminate animation position (sweeping bar)
  const sweepAnim = useRef(new Animated.Value(0)).current;
  const sweepLoop = useRef<any>(null);

  useEffect(() => {
    if (isIndeterminate) {
      sweepLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(sweepAnim, { toValue: 1, duration: 900, useNativeDriver: false }),
          Animated.timing(sweepAnim, { toValue: 0, duration: 0, useNativeDriver: false }),
        ])
      );
      sweepLoop.current.start();
    } else {
      sweepLoop.current?.stop();
      sweepAnim.setValue(0);
      Animated.timing(animWidth, {
        toValue: fraction,
        duration: 350,
        useNativeDriver: false,
      }).start();
    }
  }, [isIndeterminate, fraction]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => sweepLoop.current?.stop();
  }, []);

  const widthStyle = animWidth.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const sweepLeft = sweepAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['-40%', '100%'],
  });

  const received = progress?.received ?? 0;

  return (
    <View style={s.progWrap}>
      <View style={s.progInfoRow}>
        <Text style={s.progTxt}>
          {isIndeterminate
            ? received > 0
              ? `Downloading… ${formatBytes(received)}`
              : 'Preparing download…'
            : 'Downloading…'}
        </Text>
        {!isIndeterminate && (
          <Text style={s.progTxt}>{pct}%</Text>
        )}
      </View>
      <View style={s.progBg}>
        {isIndeterminate ? (
          <Animated.View style={[s.progSweep, { left: sweepLeft }]} />
        ) : (
          <Animated.View style={[s.progFill, { width: widthStyle }]} />
        )}
      </View>
      {!isIndeterminate && progress?.total && progress.total > 0 ? (
        <Text style={s.sizeHint}>
          {formatBytes(received)} / {formatBytes(progress.total)}
        </Text>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  progWrap: {
    width: '100%',
    gap: 6,
    paddingVertical: 4,
  },
  progInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progTxt: {
    color: '#8E8E93',
    fontSize: 12,
    fontWeight: '600',
  },
  sizeHint: {
    color: '#636366',
    fontSize: 10,
    fontWeight: '500',
  },
  progBg: {
    width: '100%',
    height: 8,
    backgroundColor: '#2C2C2E',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progFill: {
    height: '100%',
    backgroundColor: '#FF9F0A',
    borderRadius: 4,
  },
  progSweep: {
    height: '100%',
    width: '40%',
    backgroundColor: '#FF9F0A',
    borderRadius: 4,
    position: 'absolute',
  },
});
