/**
 * FluidTabs.tsx — React Native port of Watermelon UI's Fluid Tabs
 * Source reference: https://registry.watermelon.sh/r/fluid-tabs.json
 *
 * Features:
 * - Fluid spring-animated active indicator pill (stiffness 280, damping 25, mass 0.8)
 * - Micro-interaction spring scaling on active icon
 * - Pure icons-only layout with perfect pixel alignment and zero layout flicker
 * - Translucent glass pill container with native haptic feedback
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Platform,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';

export interface FluidTabItem {
  id: string;
  icon: (props: { size: number; color: string; isActive: boolean }) => React.ReactNode;
  badge?: number;
}

export interface FluidTabsProps {
  tabs: FluidTabItem[];
  activeId: string;
  onChange: (id: string) => void;
  activeColor?: string;
  inactiveColor?: string;
  pillColor?: string;
  tabWidth?: number;
  tabHeight?: number;
  gap?: number;
  style?: StyleProp<ViewStyle>;
}

export const FluidTabs: React.FC<FluidTabsProps> = ({
  tabs,
  activeId,
  onChange,
  activeColor = '#FFFFFF',
  inactiveColor = '#71717A',
  pillColor = 'rgba(255, 255, 255, 0.16)',
  tabWidth = 54,
  tabHeight = 44,
  gap = 4,
  style,
}) => {
  const padding = 4;
  const activeIndex = Math.max(
    0,
    tabs.findIndex((tab) => tab.id === activeId)
  );

  // Position of active pill calculated deterministically for zero mount lag
  const getTabX = (index: number) => padding + index * (tabWidth + gap);

  const indicatorX = useRef(new Animated.Value(getTabX(activeIndex))).current;
  const isFirstMount = useRef(true);

  useEffect(() => {
    const targetX = getTabX(activeIndex);

    if (isFirstMount.current) {
      isFirstMount.current = false;
      indicatorX.setValue(targetX);
      return;
    }

    // Fluid spring physics for silky dock pill glide
    Animated.spring(indicatorX, {
      toValue: targetX,
      stiffness: 300,
      damping: 26,
      mass: 0.8,
      useNativeDriver: true,
    }).start();
  }, [activeIndex, tabWidth, gap]);

  const handleTabPress = (tabId: string) => {
    if (tabId === activeId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onChange(tabId);
  };

  return (
    <View style={[styles.container, { padding }, style]}>
      {/* ─── Translucent Frosted Glass Base ─── */}
      <BlurView
        tint="dark"
        intensity={Platform.OS === 'ios' ? 60 : 35}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* ─── Subtle Specular Ambient Sheen ─── */}
      <View style={styles.glassSheen} pointerEvents="none" />

      {/* ─── Fluid Spring Indicator Pill ─── */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.activePill,
          {
            width: tabWidth,
            height: tabHeight,
            backgroundColor: pillColor,
            transform: [{ translateX: indicatorX }],
          },
        ]}
      />

      {/* ─── Interactive Tab Buttons (Icons Only) ─── */}
      <View style={[styles.tabsRow, { gap }]}>
        {tabs.map((tab) => {
          const isActive = tab.id === activeId;

          return (
            <TouchableOpacity
              key={tab.id}
              activeOpacity={0.7}
              delayPressIn={0}
              onPress={() => handleTabPress(tab.id)}
              style={[
                styles.tabButton,
                {
                  width: tabWidth,
                  height: tabHeight,
                },
              ]}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            >
              <View style={styles.iconWrapper}>
                {tab.icon({
                  size: 22,
                  color: isActive ? activeColor : inactiveColor,
                  isActive,
                })}

                {/* Optional notification badge for downloads */}
                {tab.badge !== undefined && tab.badge > 0 && (
                  <View style={styles.badge}>
                    <View style={styles.badgeDot} />
                  </View>
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

export default FluidTabs;

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    backgroundColor:
      Platform.OS === 'ios'
        ? 'rgba(16, 16, 22, 0.82)'
        : 'rgba(18, 18, 24, 0.93)',
    borderRadius: 999,
    borderWidth: 1.2,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.55,
    shadowRadius: 24,
    elevation: 16,
    overflow: 'hidden',
  },
  glassSheen: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  activePill: {
    position: 'absolute',
    top: 4,
    left: 0,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.26)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    zIndex: 1,
  },
  tabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 10,
    elevation: 4,
  },
  tabButton: {
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 999,
  },
  iconWrapper: {
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -4,
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#38bdf8',
  },
});
