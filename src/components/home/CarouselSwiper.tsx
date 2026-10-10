import React, { useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { VideoPlayer, VideoView } from 'expo-video';
import { useEvent } from 'expo';
import {
  Play,
  VolumeCross,
  VolumeHigh,
  CheckCircle,
  XCircle,
  CheckRead,
  Download,
} from 'reicon-react-native';
import * as Haptics from 'expo-haptics';
import { ExtractedMediaItem } from '../../extractors/types';
import ProgressBar from '../common/ProgressBar';
import { DownloadProgress } from '../../utils/download';

const { width: W } = Dimensions.get('window');
const CARD_WIDTH = W - 90;
const CARD_GAP = 12;
const CARD_PADDING = (W - CARD_WIDTH) / 2;

interface CarouselSwiperProps {
  items: ExtractedMediaItem[];
  videoPlayer: VideoPlayer;
  themeColor: string;
  downloading: boolean;
  downloadSuccess: boolean;
  progress: DownloadProgress | null;
  onToggleSelect: (index: number) => void;
  onToggleSelectAll: () => void;
  onDownloadSelected: () => void;
}

export default function CarouselSwiper({
  items,
  videoPlayer,
  themeColor,
  downloading,
  downloadSuccess,
  progress,
  onToggleSelect,
  onToggleSelectAll,
  onDownloadSelected,
}: CarouselSwiperProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollX = useRef(new Animated.Value(0)).current;

  const playingEvent = useEvent(videoPlayer, 'playingChange', { isPlaying: videoPlayer.playing });
  const isPlaying = playingEvent ? playingEvent.isPlaying : videoPlayer.playing;

  const mutedEvent = useEvent(videoPlayer, 'mutedChange', { muted: videoPlayer.muted });
  const isMuted = mutedEvent ? mutedEvent.muted : videoPlayer.muted;

  const selectedCount = items.filter(i => i.selected).length;
  const allSelected = items.length > 0 && selectedCount === items.length;

  const handleScroll = (event: any) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / (CARD_WIDTH + CARD_GAP));
    if (index !== activeIndex && index >= 0 && index < items.length) {
      setActiveIndex(index);
      const cur = items[index];
      if (cur?.type === 'video' && cur.url) {
        try {
          videoPlayer.replace(cur.url);
          videoPlayer.play();
        } catch {
          // player replace safe
        }
      }
    }
  };

  const togglePlayPause = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isPlaying) {
      videoPlayer.pause();
    } else {
      videoPlayer.play();
    }
  };

  const toggleMute = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    videoPlayer.muted = !videoPlayer.muted;
  };

  return (
    <View style={s.container}>
      <FlatList
        data={items}
        horizontal
        pagingEnabled={false}
        decelerationRate="fast"
        snapToInterval={CARD_WIDTH + CARD_GAP}
        snapToAlignment="center"
        contentContainerStyle={{ paddingHorizontal: CARD_PADDING }}
        showsHorizontalScrollIndicator={false}
        keyExtractor={item => String(item.index)}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: false, listener: handleScroll }
        )}
        scrollEventThrottle={16}
        renderItem={({ item }) => (
          <View style={s.swiperCard}>
            {item.type === 'video' ? (
              item.index === activeIndex ? (
                <View style={[s.videoWrapper, { height: '100%' }]}>
                  <Pressable style={{ flex: 1 }} onPress={togglePlayPause}>
                    <VideoView
                      player={videoPlayer}
                      style={[s.mediaPrev, { height: '100%' }]}
                      nativeControls={false}
                      contentFit="contain"
                    />
                  </Pressable>

                  {!isPlaying && (
                    <Pressable style={s.swiperPlayOverlay} onPress={togglePlayPause}>
                      <Play size={44} color="rgba(255, 255, 255, 0.85)" weight="Filled" />
                    </Pressable>
                  )}

                  <TouchableOpacity
                    style={s.swiperVolumeBtn}
                    onPress={toggleMute}
                    activeOpacity={0.7}>
                    {isMuted ? (
                      <VolumeCross size={16} color="#FFFFFF" />
                    ) : (
                      <VolumeHigh size={16} color="#FFFFFF" />
                    )}
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={s.inactiveVideoWrapper}>
                  <Image
                    source={{ uri: item.thumbnail || item.url }}
                    style={[s.mediaPrev, { height: '100%' }]}
                    resizeMode="cover"
                  />
                  <View style={s.inactivePlayOverlay}>
                    <Play size={40} color="rgba(255, 255, 255, 0.85)" weight="Filled" />
                  </View>
                </View>
              )
            ) : (
              <Image
                source={{ uri: item.url }}
                style={[s.mediaPrev, { height: '100%' }]}
                resizeMode="contain"
              />
            )}

            {/* Slide Counter Overlay */}
            <View style={s.slideCounter}>
              <Text style={s.slideCounterText}>
                {item.index + 1} / {items.length}
              </Text>
            </View>

            {/* Selection Check Circle */}
            <Pressable
              style={s.slideSelectBadge}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onToggleSelect(item.index);
              }}>
              {item.selected ? (
                <CheckCircle
                  size={24}
                  color={themeColor}
                  weight="Filled"
                />
              ) : (
                <View
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    borderWidth: 2,
                    borderColor: '#FFFFFF',
                    backgroundColor: 'rgba(0,0,0,0.2)',
                  }}
                />
              )}
            </Pressable>
          </View>
        )}
      />

      {/* Pagination Dots */}
      <View style={s.dotsContainer}>
        {items.map((_, idx) => {
          const dotWidth = scrollX.interpolate({
            inputRange: [
              (idx - 1) * (CARD_WIDTH + CARD_GAP),
              idx * (CARD_WIDTH + CARD_GAP),
              (idx + 1) * (CARD_WIDTH + CARD_GAP),
            ],
            outputRange: [6, 14, 6],
            extrapolate: 'clamp',
          });

          const dotOpacity = scrollX.interpolate({
            inputRange: [
              (idx - 1) * (CARD_WIDTH + CARD_GAP),
              idx * (CARD_WIDTH + CARD_GAP),
              (idx + 1) * (CARD_WIDTH + CARD_GAP),
            ],
            outputRange: [0.35, 1, 0.35],
            extrapolate: 'clamp',
          });

          return (
            <Animated.View
              key={idx}
              style={[
                s.dot,
                {
                  width: dotWidth,
                  opacity: dotOpacity,
                  backgroundColor: themeColor,
                },
              ]}
            />
          );
        })}
      </View>

      {/* Actions (Select All, Download Button) */}
      <View style={s.actionsContainer}>
        {downloading ? (
          <ProgressBar progress={progress} />
        ) : (
          <View style={s.actionsRow}>
            <Pressable style={s.selectAllBtn} onPress={onToggleSelectAll}>
              {allSelected ? (
                <XCircle size={16} color="#FFFFFF" />
              ) : (
                <CheckRead size={16} color="#FFFFFF" />
              )}
              <Text style={s.selectAllTxt}>
                {allSelected ? 'Deselect All' : 'Select All'}
              </Text>
            </Pressable>

            <Pressable
              style={{ flex: 1 }}
              disabled={downloading || downloadSuccess || selectedCount === 0}
              onPress={onDownloadSelected}>
              <View
                style={[
                  s.downloadBtn,
                  selectedCount === 0 && { backgroundColor: '#3A3A3C' },
                  selectedCount > 0 && { backgroundColor: themeColor },
                ]}>
                {downloadSuccess ? (
                  <CheckCircle
                    size={16}
                    color="#FFFFFF"
                    weight="Filled"
                  />
                ) : (
                  <Download
                    size={16}
                    color={selectedCount === 0 ? '#8E8E93' : '#000000'}
                  />
                )}
                <Text
                  style={[
                    s.downloadBtnTxt,
                    selectedCount === 0 && { color: '#8E8E93' },
                    downloadSuccess && { color: '#FFFFFF' },
                  ]}>
                  {downloadSuccess
                    ? 'Completed'
                    : selectedCount > 0
                    ? `Download (${selectedCount})`
                    : 'Download'}
                </Text>
              </View>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    width: '100%',
    marginTop: 10,
  },
  swiperCard: {
    width: CARD_WIDTH,
    height: W * 0.95,
    marginRight: CARD_GAP,
    borderRadius: 20,
    backgroundColor: '#121214',
    borderWidth: 1,
    borderColor: '#2C2C2E',
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mediaPrev: {
    width: '100%',
    height: '100%',
  },
  videoWrapper: {
    width: '100%',
    position: 'relative',
    backgroundColor: '#000000',
  },
  inactiveVideoWrapper: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  swiperPlayOverlay: {
    position: 'absolute',
    top: '40%',
    left: '42%',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 30,
    padding: 8,
  },
  inactivePlayOverlay: {
    position: 'absolute',
    top: '40%',
    left: '42%',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    borderRadius: 30,
    padding: 8,
  },
  swiperVolumeBtn: {
    position: 'absolute',
    bottom: 14,
    right: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    borderRadius: 16,
    padding: 7,
  },
  slideCounter: {
    position: 'absolute',
    bottom: 14,
    left: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  slideCounterText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  slideSelectBadge: {
    position: 'absolute',
    top: 14,
    right: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    borderRadius: 18,
    padding: 2,
  },
  dotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 14,
    gap: 6,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
  actionsContainer: {
    marginTop: 14,
    paddingHorizontal: 20,
    width: '100%',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  selectAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: '#1C1C1E',
    borderWidth: 1,
    borderColor: '#3A3A3C',
  },
  selectAllTxt: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  downloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 14,
  },
  downloadBtnTxt: {
    color: '#000000',
    fontSize: 13,
    fontWeight: '700',
  },
});
