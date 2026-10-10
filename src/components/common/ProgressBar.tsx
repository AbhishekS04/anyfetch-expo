import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { DownloadProgress } from '../../utils/download';

interface ProgressBarProps {
  progress: DownloadProgress | null;
}

export default function ProgressBar({ progress }: ProgressBarProps) {
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
});
