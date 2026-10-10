import React from 'react';
import {
  Image,
  Pressable,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ArrowRight, X } from 'reicon-react-native';
import * as Haptics from 'expo-haptics';
import { HistoryFilter, HistoryItem } from '../../hooks/useDownloadHistory';
import { PLATFORM_THEMES, DEFAULT_THEME } from '../../theme/platformColors';
import { FONTS } from '../../theme/typography';

interface HistorySectionProps {
  history: HistoryItem[];
  filter: HistoryFilter;
  onSelectFilter: (filter: HistoryFilter) => void;
  filteredItems: HistoryItem[];
  onSelectItem: (item: HistoryItem) => void;
  onDeleteItem: (url: string) => void;
  activeColor: string;
  onViewAll?: () => void;
}

export default function HistorySection({
  history,
  filter,
  onSelectFilter,
  filteredItems,
  onSelectItem,
  onDeleteItem,
  activeColor,
  onViewAll,
}: HistorySectionProps) {
  if (history.length === 0) return null;

  const filters: HistoryFilter[] = ['all', 'instagram', 'youtube', 'tiktok', 'reddit', 'twitter', 'facebook', 'pinterest'];
  const labels: Record<HistoryFilter, string> = {
    all: 'All',
    instagram: 'Instagram',
    youtube: 'YouTube',
    tiktok: 'TikTok',
    reddit: 'Reddit',
    twitter: 'Twitter',
    facebook: 'Facebook',
    pinterest: 'Pinterest',
  };

  return (
    <View style={s.section}>
      {/* Header Row */}
      <View style={s.headerRow}>
        <Text style={s.sectionTitle}>Recent Downloads</Text>
        {onViewAll && (
          <TouchableOpacity
            activeOpacity={0.7}
            style={s.viewAllBtn}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              onViewAll();
            }}>
            <Text style={[s.viewAllText, { color: activeColor }]}>Open Carousel</Text>
            <ArrowRight size={12} color={activeColor} />
          </TouchableOpacity>
        )}
      </View>

      {/* Filter chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipsRow}>
        {filters.map(f => {
          const active = filter === f;
          const hasItems = f === 'all' ? history.length > 0 : history.some(h => h.platform === f);
          if (!hasItems) return null;

          return (
            <TouchableOpacity
              key={f}
              activeOpacity={0.7}
              style={[
                s.chip,
                active && { backgroundColor: activeColor, borderColor: activeColor },
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                onSelectFilter(f);
              }}>
              <Text style={[s.chipText, active && { color: '#000000' }]}>{labels[f]}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* History cards row */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.cardsRow}>
        {filteredItems.map(item => {
          const first = item.singleResult ?? item.carouselItems?.[0];
          const thumb = first?.thumbnail ?? first?.url;
          const theme = PLATFORM_THEMES[item.platform];
          const PlatformIcon = theme?.Icon ?? DEFAULT_THEME.Icon;

          return (
            <View key={item.url} style={s.cardWrapper}>
              <TouchableOpacity
                activeOpacity={0.75}
                style={s.card}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  onSelectItem(item);
                }}>
                {thumb ? (
                  <Image source={{ uri: thumb }} style={s.thumb} />
                ) : (
                  <View style={s.placeholder}>
                    <PlatformIcon size={20} color="#48484A" />
                  </View>
                )}
                <View style={[s.platformBadge, { backgroundColor: theme?.primary ?? '#FF9F0A' }]}>
                  <PlatformIcon size={10} color="#FFFFFF" />
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  onDeleteItem(item.url);
                }}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                style={s.deleteBtn}>
                <X size={12} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  section: {
    marginTop: 20,
    width: '100%',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
    marginBottom: 10,
  },
  sectionTitle: {
    fontFamily: FONTS.display,
    fontSize: 13.5,
    color: '#8E8E93',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  viewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  viewAllText: {
    fontFamily: FONTS.sans,
    fontSize: 12,
  },
  chipsRow: {
    paddingHorizontal: 4,
    gap: 8,
    marginBottom: 12,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#1C1C1E',
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  chipText: {
    fontFamily: FONTS.sans,
    color: '#8E8E93',
    fontSize: 12,
  },
  cardsRow: {
    paddingHorizontal: 4,
    gap: 12,
  },
  cardWrapper: {
    position: 'relative',
  },
  card: {
    width: 72,
    height: 72,
    borderRadius: 14,
    backgroundColor: '#1C1C1E',
    borderWidth: 1,
    borderColor: '#2C2C2E',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumb: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  platformBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#000000',
  },
  deleteBtn: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#3A3A3C',
  },
});
