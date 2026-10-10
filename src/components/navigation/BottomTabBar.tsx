/**
 * BottomTabBar.tsx — FluidTabs Dock Navigation
 *
 * Implements the Watermelon UI Fluid Tabs dock:
 * - Fluid spring-animated active indicator pill (stiffness 280, damping 25, mass 0.8)
 * - 4 neat & clean icon-only tabs: Home -> Downloads -> About -> Settings
 * - Custom reicon icons (Home, Download, InfoCircle, Setting2)
 * - Tactile spring micro-interactions and native haptics
 */

import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Home, Download, InfoCircle, Setting2 } from 'reicon-react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import FluidTabs, { FluidTabItem } from './FluidTabs';

export type TabRoute = 'Home' | 'Downloads' | 'About' | 'Settings';

export interface BottomTabBarProps {
  activeTab: TabRoute;
  onSelectTab: (tab: TabRoute) => void;
  downloadsCount?: number;
}

export function BottomTabBar({
  activeTab,
  onSelectTab,
  downloadsCount = 0,
}: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { colors: themeColors } = useAppTheme();

  const tabs: FluidTabItem[] = [
    {
      id: 'Home',
      icon: ({ size, color }) => <Home size={size} color={color} />,
    },
    {
      id: 'Downloads',
      icon: ({ size, color }) => <Download size={size} color={color} />,
      badge: downloadsCount,
    },
    {
      id: 'About',
      icon: ({ size, color }) => <InfoCircle size={size} color={color} />,
    },
    {
      id: 'Settings',
      icon: ({ size, color }) => <Setting2 size={size} color={color} />,
    },
  ];

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.dockWrapper,
        { bottom: Math.max(insets.bottom + 10, Platform.OS === 'ios' ? 24 : 16) },
      ]}
    >
      <FluidTabs
        tabs={tabs}
        activeId={activeTab}
        onChange={(id) => onSelectTab(id as TabRoute)}
        activeColor={themeColors.accent || '#38bdf8'}
        inactiveColor="#71717A"
        pillColor="rgba(255, 255, 255, 0.16)"
        tabWidth={56}
        tabHeight={44}
        gap={4}
      />
    </View>
  );
}

export { BottomTabBar as FluidDock };
export default BottomTabBar;

const styles = StyleSheet.create({
  dockWrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 99,
    elevation: 20,
  },
});
