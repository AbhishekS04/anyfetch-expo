import React from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { X } from 'reicon-react-native';
import * as Haptics from 'expo-haptics';
import { SupportedPlatform, getPlatformTheme } from '../../theme/platformColors';
import { FONTS } from '../../theme/typography';

interface ClipboardBannerProps {
  url: string | null;
  platform: SupportedPlatform | null;
  animValue: Animated.Value;
  onFetch: (url: string) => void;
  onDismiss: () => void;
}

export default function ClipboardBanner({
  url,
  platform,
  animValue,
  onFetch,
  onDismiss,
}: ClipboardBannerProps) {
  if (!url) return null;

  const theme = getPlatformTheme(platform);
  const PlatformIcon = theme.Icon;

  return (
    <Animated.View
      style={[
        s.banner,
        {
          opacity: animValue,
          transform: [
            {
              translateY: animValue.interpolate({
                inputRange: [0, 1],
                outputRange: [-16, 0],
              }),
            },
          ],
        },
      ]}>
      <View style={s.left}>
        <PlatformIcon size={18} color={theme.primary} />
        <View style={s.textCol}>
          <Text style={s.title}>{theme.label} link detected</Text>
          <Text style={s.urlText} numberOfLines={1}>
            {url}
          </Text>
        </View>
      </View>
      <View style={s.actions}>
        <TouchableOpacity
          style={[s.fetchBtn, { backgroundColor: theme.primary }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onFetch(url);
          }}>
          <Text style={s.fetchBtnTxt}>Fetch</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.dismissBtn} onPress={onDismiss}>
          <X size={16} color="#8E8E93" />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2C2C2E',
    width: '100%',
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  textCol: {
    marginLeft: 10,
    flex: 1,
  },
  title: {
    fontFamily: FONTS.sans,
    color: '#FFFFFF',
    fontSize: 12,
  },
  urlText: {
    fontFamily: FONTS.sans,
    color: '#8E8E93',
    fontSize: 11,
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  fetchBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  fetchBtnTxt: {
    fontFamily: FONTS.sans,
    color: '#000000',
    fontSize: 12,
  },
  dismissBtn: {
    padding: 6,
  },
});
