import React, { useMemo } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { ArrowRight } from 'reicon-react-native';
import * as Haptics from 'expo-haptics';
import { HistoryFilter, HistoryItem } from '../../hooks/useDownloadHistory';
import { DraggableMarquee, MarqueeItem } from './DraggableMarquee';
import { FONTS } from '../../theme/typography';
import { SupportedPlatform } from '../../theme/platformColors';

interface HistorySectionProps {
  history: HistoryItem[];
  filter?: HistoryFilter;
  onSelectFilter?: (filter: HistoryFilter) => void;
  filteredItems?: HistoryItem[];
  onSelectItem: (item: HistoryItem) => void;
  onDeleteItem?: (url: string) => void;
  activeColor: string;
  onViewAll?: () => void;
}

const CURATED_SHOWCASE_ITEMS: MarqueeItem[] = [
  {
    id: 'curated-ig',
    src: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&q=80',
    platform: 'instagram' as SupportedPlatform,
  },
  {
    id: 'curated-yt',
    src: 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=500&q=80',
    platform: 'youtube' as SupportedPlatform,
  },
  {
    id: 'curated-tt',
    src: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=500&q=80',
    platform: 'tiktok' as SupportedPlatform,
  },
  {
    id: 'curated-pin',
    src: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=500&q=80',
    platform: 'pinterest' as SupportedPlatform,
  },
  {
    id: 'curated-tw',
    src: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=500&q=80',
    platform: 'twitter' as SupportedPlatform,
  },
  {
    id: 'curated-rd',
    src: 'https://images.unsplash.com/photo-1614850523459-c2f4c699c52e?w=500&q=80',
    platform: 'reddit' as SupportedPlatform,
  },
];

export default function HistorySection({
  history,
  onSelectItem,
  activeColor,
  onViewAll,
}: HistorySectionProps) {
  // Convert history items to DraggableMarquee cards
  const marqueeItems: MarqueeItem[] = useMemo(() => {
    const userItems: MarqueeItem[] = history
      .map((item, idx) => {
        const first = item.singleResult ?? item.carouselItems?.[0];
        const thumb = first?.thumbnail || first?.url || '';
        return {
          id: `hist-${item.url}-${idx}`,
          src: thumb,
          platform: item.platform as SupportedPlatform,
          url: item.url,
          originalItem: item,
        };
      })
      .filter(item => Boolean(item.src));

    if (userItems.length === 0) {
      return CURATED_SHOWCASE_ITEMS;
    }

    // If user has few downloads (< 5), blend with curated showcase so the marquee is rich & full
    if (userItems.length < 5) {
      const needed = 6 - userItems.length;
      return [...userItems, ...CURATED_SHOWCASE_ITEMS.slice(0, needed)];
    }

    return userItems;
  }, [history]);

  const handleSelectMarqueeItem = (item: MarqueeItem) => {
    if (item.originalItem) {
      onSelectItem(item.originalItem);
    } else if (onViewAll) {
      onViewAll();
    }
  };

  return (
    <View style={s.section}>
      {/* Header Row */}
      <View style={s.headerRow}>
        <View style={s.titleRow}>
          <Text style={s.sectionTitle}>Recent Downloads</Text>
          {history.length > 0 && (
            <View style={s.countBadge}>
              <Text style={s.countBadgeText}>{history.length}</Text>
            </View>
          )}
        </View>

        {onViewAll && (
          <TouchableOpacity
            activeOpacity={0.7}
            delayPressIn={0}
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

      {/* Draggable Marquee — Continuous Smooth Motion with Drag Momentum & Zero Text Clutter */}
      <View style={s.marqueeContainer}>
        <DraggableMarquee
          items={marqueeItems}
          speed={0.42}
          itemWidth={132}
          itemHeight={182}
          gap={14}
          throwMultiplier={2.2}
          throwFriction={0.965}
          onSelectItem={handleSelectMarqueeItem}
        />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  section: {
    marginTop: 22,
    width: '100%',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    marginBottom: 14,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontFamily: FONTS.display,
    fontSize: 13,
    color: '#8E8E93',
    textTransform: 'uppercase',
    letterSpacing: 0.9,
    fontWeight: '600',
  },
  countBadge: {
    backgroundColor: '#1E1E22',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  countBadgeText: {
    fontFamily: FONTS.sans,
    fontSize: 10.5,
    color: '#A1A1AA',
    fontWeight: '700',
  },
  viewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  viewAllText: {
    fontFamily: FONTS.sans,
    fontSize: 12.5,
    fontWeight: '600',
  },
  marqueeContainer: {
    width: '100%',
    paddingVertical: 4,
  },
});
