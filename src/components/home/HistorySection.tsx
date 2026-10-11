import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { HistoryFilter, HistoryItem } from '../../hooks/useDownloadHistory';
import { DraggableMarquee, MarqueeItem } from './DraggableMarquee';
import { SupportedPlatform } from '../../theme/platformColors';

interface HistorySectionProps {
  history: HistoryItem[];
  filter?: HistoryFilter;
  onSelectFilter?: (filter: HistoryFilter) => void;
  filteredItems?: HistoryItem[];
  onSelectItem: (item: HistoryItem) => void;
  onDeleteItem?: (url: string) => void;
  activeColor?: string;
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
      return [];
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

  if (marqueeItems.length === 0) {
    return null;
  }

  return (
    <View style={s.section}>
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
  );
}

const s = StyleSheet.create({
  section: {
    marginTop: 18,
    width: '100%',
    paddingVertical: 4,
  },
});
