/**
 * HistoryScreen.tsx — 3D Spiral Download History & Management
 *
 * Dedicated screen accessible from the bottom dock:
 * - 3D Spiral gallery (Spiral3DSlider) displaying recent downloaded videos & posts
 * - Clear History action button that clears history across the app and on the home carousel
 * - Tap any card to preview/play
 * - Persistent FluidTabs bottom dock navigation
 */

import React, { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  BackHandler,
  Dimensions,
} from 'react-native';
import { customAlert as Alert } from '../components/common/CustomAlert';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import {
  ChevronLeft,
  Trash,
  Clock,
} from 'reicon-react-native';

import { useDownloadHistory, HistoryItem } from '../hooks/useDownloadHistory';
import { useAppTheme } from '../theme/ThemeContext';
import { FONTS } from '../theme/typography';
import BottomTabBar, { TabRoute } from '../components/navigation/BottomTabBar';
import {
  useCascadeNavigation,
  useCascadeBackTransition,
} from '../components/navigation/CascadePageTransition';
import FisheyeInfiniteGrid, { FisheyeGridItem } from '../components/common/FisheyeInfiniteGrid';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { navigateWithCascade } = useCascadeNavigation();
  useCascadeBackTransition(navigation);
  const { colors: appColors } = useAppTheme();

  const { history, clearHistory } = useDownloadHistory();

  // Hardware back button returns to Home
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        navigateWithCascade('Home');
        return true;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => sub.remove();
    }, [navigateWithCascade])
  );

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    navigateWithCascade('Home');
  };

  const handleSelectTab = (tab: TabRoute) => {
    if (tab === 'History') return;
    navigateWithCascade(tab);
  };

  // Convert history items to Fisheye Grid items
  const gridItems: FisheyeGridItem[] = useMemo(() => {
    return history
      .map((item, index) => {
        const firstSingle = item.singleResult;
        const firstCarousel = item.carouselItems?.[0];
        const thumb =
          firstSingle?.thumbnail ||
          firstCarousel?.thumbnail ||
          item.localUri ||
          firstSingle?.url ||
          firstCarousel?.url ||
          '';
        const title = firstSingle?.title || item.url || `DOWNLOAD #${index + 1}`;
        const meta = String(index + 1).padStart(2, '0');
        return {
          image: thumb,
          alt: title,
          title,
          meta,
          originalItem: item,
        };
      })
      .filter(s => Boolean(s.image));
  }, [history]);

  // Clear history action with confirmation alert
  const handleClear = () => {
    if (history.length === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    Alert.alert(
      'Clear History?',
      'This will remove all recent downloads from your history and clear the home screen carousel.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            await clearHistory();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          },
        },
      ]
    );
  };

  const hasItems = gridItems.length > 0;

  return (
    <View style={s.root}>
      {/* ═══ TOP APP BAR ═══ */}
      <View
        style={[
          s.header,
          {
            paddingTop: Math.max(insets.top, 16) + 4,
          },
        ]}
      >
        <TouchableOpacity
          style={s.headerBtn}
          onPress={handleBack}
          activeOpacity={0.7}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <ChevronLeft size={22} color="#FFFFFF" />
        </TouchableOpacity>

        <View style={s.headerTitleWrap}>
          <Text style={s.headerTitle}>HISTORY</Text>
        </View>

        <TouchableOpacity
          style={s.headerBtn}
          onPress={handleClear}
          activeOpacity={0.7}
          disabled={!hasItems}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Trash size={18} color={hasItems ? '#EF4444' : '#52525B'} />
        </TouchableOpacity>
      </View>

      {/* ═══ MAIN STAGE ═══ */}
      <View style={s.stageContainer}>
        {hasItems ? (
          <FisheyeInfiniteGrid
            items={gridItems}
            tileWidth={238}
            tileHeight={272}
            gap={0}
            lensStrength={0.24}
            inertia={0.94}
            style={StyleSheet.absoluteFill}
          />
        ) : (
          <View style={s.emptyContainer}>
            <View style={s.emptyIconCircle}>
              <Clock size={36} color="#71717A" />
            </View>
            <Text style={s.emptyTitle}>No Download History</Text>
            <Text style={s.emptyDesc}>
              Media you download will appear here in the infinite gallery.
            </Text>
          </View>
        )}
      </View>

      {/* ═══ BOTTOM TAB BAR DOCK ═══ */}
      <BottomTabBar
        activeTab="History"
        onSelectTab={handleSelectTab}
        downloadsCount={history.length}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#18181B',
    backgroundColor: '#000000',
    zIndex: 10,
  },
  headerBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  headerTitleWrap: {
    alignItems: 'center',
  },
  headerTitle: {
    fontFamily: FONTS.sans,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 2,
    color: '#FFFFFF',
  },
  stageContainer: {
    flex: 1,
    width: '100%',
    backgroundColor: '#070707',
  },
  emptyContainer: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  emptyTitle: {
    fontFamily: FONTS.sans,
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyDesc: {
    fontFamily: FONTS.sans,
    fontSize: 13,
    color: '#71717A',
    textAlign: 'center',
    lineHeight: 19,
    maxWidth: 280,
  },
});
