import React, { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Dimensions,
  Image,
  PanResponder,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { SupportedPlatform, PLATFORM_THEMES, DEFAULT_THEME } from '../../theme/platformColors';

export interface MarqueeItem {
  id: string | number;
  src: string;
  platform?: SupportedPlatform;
  url?: string;
  originalItem?: any;
}

export interface DraggableMarqueeProps {
  items: MarqueeItem[];
  speed?: number; // Pixels per frame (default: 0.42 for slow, smooth glide)
  repeatCount?: number; // Times to duplicate track (default: 3)
  itemWidth?: number; // Width of card (default: 132)
  itemHeight?: number; // Height of card (default: 180)
  gap?: number; // Gap between cards (default: 14)
  throwMultiplier?: number; // Momentum throw multiplier (default: 2.2)
  throwFriction?: number; // Friction decay (default: 0.965)
  maxThrowVelocity?: number; // Max throw velocity (default: 35)
  onSelectItem?: (item: MarqueeItem) => void;
  renderItem?: (item: MarqueeItem, index: number) => React.ReactNode;
}

export const DraggableMarquee: React.FC<DraggableMarqueeProps> = ({
  items = [],
  speed = 0.42,
  repeatCount = 3,
  itemWidth = 132,
  itemHeight = 180,
  gap = 14,
  throwMultiplier = 2.2,
  throwFriction = 0.965,
  maxThrowVelocity = 35,
  onSelectItem,
  renderItem,
}) => {
  const slotWidth = itemWidth + gap;
  const screenWidth = Dimensions.get('window').width;
  const minRequiredWidth = screenWidth + 240;

  const baseItems = useMemo(() => {
    if (!items.length) return [];
    const currentSetWidth = items.length * slotWidth;
    if (currentSetWidth >= minRequiredWidth) return items;
    const multiplier = Math.ceil(minRequiredWidth / currentSetWidth);
    return Array.from({ length: multiplier }).flatMap(() => items);
  }, [items, slotWidth, minRequiredWidth]);

  const singleSetWidth = baseItems.length * slotWidth;

  const duplicatedItems = useMemo(() => {
    if (!baseItems.length) return [];
    return Array.from({ length: Math.max(3, repeatCount) }).flatMap(() => baseItems);
  }, [baseItems, repeatCount]);

  const xRef = useRef(0);
  const translateX = useRef(new Animated.Value(0)).current;
  const isDraggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const lastDragXRef = useRef(0);
  const lastDragTimeRef = useRef(0);
  const throwVelocityRef = useRef(0);
  const animFrameRef = useRef<number | null>(null);

  // Seamless modular wrapping
  const wrap = useMemo(() => {
    return (val: number) => {
      if (singleSetWidth <= 0) return val;
      let wrapped = val;
      while (wrapped <= -singleSetWidth) {
        wrapped += singleSetWidth;
      }
      while (wrapped > 0) {
        wrapped -= singleSetWidth;
      }
      return wrapped;
    };
  }, [singleSetWidth]);

  // Main 60fps physics & drift ticker loop
  useEffect(() => {
    if (!items.length || singleSetWidth <= 0) return;

    let isMounted = true;

    const tick = () => {
      if (!isMounted) return;

      if (!isDraggingRef.current) {
        if (Math.abs(throwVelocityRef.current) > 0.02) {
          xRef.current += throwVelocityRef.current;
          throwVelocityRef.current *= throwFriction;
        } else {
          throwVelocityRef.current = 0;
          xRef.current -= speed;
        }

        xRef.current = wrap(xRef.current);
        translateX.setValue(xRef.current);
      }

      animFrameRef.current = requestAnimationFrame(tick);
    };

    animFrameRef.current = requestAnimationFrame(tick);

    return () => {
      isMounted = false;
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [items.length, singleSetWidth, speed, throwFriction, wrap, translateX]);

  // Touch & drag gesture responder with momentum sampling
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gestureState) => {
          // Only claim gesture if dragging horizontally more than vertically
          return (
            Math.abs(gestureState.dx) > 6 &&
            Math.abs(gestureState.dx) > Math.abs(gestureState.dy)
          );
        },
        onPanResponderGrant: evt => {
          isDraggingRef.current = true;
          throwVelocityRef.current = 0;
          dragStartXRef.current = xRef.current;
          lastDragXRef.current = evt.nativeEvent.pageX;
          lastDragTimeRef.current = Date.now();
        },
        onPanResponderMove: (evt, gestureState) => {
          const now = Date.now();
          const currentX = evt.nativeEvent.pageX;
          const dt = Math.max(1, now - lastDragTimeRef.current);
          const dx = currentX - lastDragXRef.current;

          xRef.current = wrap(dragStartXRef.current + gestureState.dx);
          translateX.setValue(xRef.current);

          if (dt > 0) {
            const sampledVelocity = (dx / dt) * 16;
            throwVelocityRef.current = Math.max(
              -maxThrowVelocity,
              Math.min(maxThrowVelocity, sampledVelocity * throwMultiplier)
            );
          }

          lastDragXRef.current = currentX;
          lastDragTimeRef.current = now;
        },
        onPanResponderRelease: () => {
          isDraggingRef.current = false;
        },
        onPanResponderTerminate: () => {
          isDraggingRef.current = false;
        },
        onPanResponderTerminationRequest: () => true,
      }),
    [wrap, throwMultiplier, maxThrowVelocity, translateX]
  );

  if (!items.length) return null;

  return (
    <View style={[styles.container, { height: itemHeight }]} {...panResponder.panHandlers}>
      <Animated.View
        style={[
          styles.track,
          {
            transform: [{ translateX }],
          },
        ]}
      >
        {duplicatedItems.map((item, index) => {
          const theme = item.platform ? PLATFORM_THEMES[item.platform] : DEFAULT_THEME;
          const badgeColor = theme?.primary || '#FF9F0A';

          return (
            <View
              key={`${item.id}-${index}`}
              style={[
                styles.itemSlot,
                {
                  width: itemWidth,
                  height: itemHeight,
                  marginRight: gap,
                },
              ]}
            >
              {renderItem ? (
                renderItem(item, index % items.length)
              ) : (
                <TouchableOpacity
                  activeOpacity={0.88}
                  delayPressIn={0}
                  style={[styles.card, { width: itemWidth, height: itemHeight }]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    onSelectItem?.(item);
                  }}
                >
                  <Image source={{ uri: item.src }} style={styles.cardImage} resizeMode="cover" />

                  {/* Soft top and bottom glass vignette */}
                  <View style={styles.cardVignetteTop} />
                  <View style={styles.cardVignetteBottom} />

                  {/* Clean platform emblem badge (No text, pure minimalist elegance) */}
                  <View style={styles.platformBadge}>
                    <View style={[styles.badgeDot, { backgroundColor: badgeColor }]} />
                  </View>
                </TouchableOpacity>
              )}
            </View>
          );
        })}
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'center',
  },
  track: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'absolute',
    left: 0,
  },
  itemSlot: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    borderRadius: 22,
    backgroundColor: '#121216',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  cardImage: {
    ...StyleSheet.absoluteFill,
    width: '100%',
    height: '100%',
    borderRadius: 21,
  },
  cardVignetteTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 48,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
  },
  cardVignetteBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 48,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
  platformBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(12, 12, 14, 0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeDot: {
    width: 6.5,
    height: 6.5,
    borderRadius: 3.25,
  },
});
