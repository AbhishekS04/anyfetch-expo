import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  PanResponder,
  Animated,
  StyleProp,
  ViewStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { FONTS } from '../../theme/typography';

export interface WheelCarouselItem {
  id?: string;
  label: string;
  image?: string;
  imageAlt?: string;
  disabled?: boolean;
}

export interface WheelCarouselProps {
  items: readonly WheelCarouselItem[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  onPositionChange?: (position: number) => void;
  accentColor?: string;
  radius?: number;
  angleStepDeg?: number;
  itemSpacingPx?: number;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const WheelCarousel: React.FC<WheelCarouselProps> = ({
  items,
  value,
  defaultValue,
  onValueChange,
  onPositionChange,
  accentColor = '#38bdf8',
  radius: radiusProp,
  angleStepDeg = 12.8,
  itemSpacingPx = 58,
  disabled = false,
  style,
}) => {
  const screenWidth = Dimensions.get('window').width;
  const screenHeight = Dimensions.get('window').height;

  const getItemId = useCallback(
    (item: WheelCarouselItem, index: number) => item.id ?? item.label ?? `item-${index}`,
    [],
  );

  const firstEnabled = items.find((i) => !i.disabled);
  const [internalValue, setInternalValue] = useState<string>(
    defaultValue ?? (firstEnabled ? getItemId(firstEnabled, 0) : ''),
  );

  const selectedValue = value !== undefined ? value : internalValue;
  const selectedIndex = Math.max(
    0,
    items.findIndex((i, idx) => getItemId(i, idx) === selectedValue),
  );

  // Position tracks continuous floating index along items
  const positionAnim = useRef(new Animated.Value(selectedIndex)).current;
  const currentPosRef = useRef<number>(selectedIndex);
  const [currentPosition, setCurrentPosition] = useState<number>(selectedIndex);

  // Mutable refs to prevent gesture interruptions and stale closures
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;

  const itemSpacingPxRef = useRef(itemSpacingPx);
  itemSpacingPxRef.current = itemSpacingPx;

  const onValueChangeRef = useRef(onValueChange);
  onValueChangeRef.current = onValueChange;

  const onPositionChangeRef = useRef(onPositionChange);
  onPositionChangeRef.current = onPositionChange;

  const isInteractingRef = useRef<boolean>(false);
  const lastDetentRef = useRef<number>(selectedIndex);

  // Layout dimensions
  const containerHeight = Math.min(520, Math.max(440, screenHeight * 0.58));
  const cy = containerHeight / 2;
  const radius = radiusProp ?? Math.round(Math.max(340, screenWidth * 0.92));
  const apexX = Math.round(screenWidth * 0.22);
  const cx = apexX - radius;
  const angleStepRad = (angleStepDeg * Math.PI) / 180;

  const ITEM_WIDTH = 270;
  const ITEM_HEIGHT = 44;

  // Settle to target item with physical spring
  const settleToIndex = useCallback(
    (targetIdx: number, velocity: number = 0) => {
      const clamped = Math.min(
        itemsRef.current.length - 1,
        Math.max(0, targetIdx),
      );

      isInteractingRef.current = true;
      Animated.spring(positionAnim, {
        toValue: clamped,
        stiffness: 240,
        damping: 24,
        mass: 0.8,
        velocity: -velocity * 0.35,
        useNativeDriver: false,
      }).start(() => {
        isInteractingRef.current = false;
        const item = itemsRef.current[clamped];
        if (item && !item.disabled) {
          const itemId = getItemId(item, clamped);
          if (value === undefined) {
            setInternalValue(itemId);
          }
          if (onValueChangeRef.current) {
            onValueChangeRef.current(itemId);
          }
        }
      });
    },
    [positionAnim, getItemId, value],
  );

  // Geometry helper: finds visible item closest to tap coordinates
  const findTappedItemIndex = useCallback(
    (touchY: number): number => {
      let closestIdx = -1;
      let minDeltaY = Infinity;

      const currentPos = currentPosRef.current;
      const list = itemsRef.current;

      for (let i = 0; i < list.length; i++) {
        const delta = i - currentPos;
        if (Math.abs(delta) > 5.0) continue;

        const angle = delta * angleStepRad;
        const itemCenterY = cy + (radius + ITEM_WIDTH / 2) * Math.sin(angle);
        const dist = Math.abs(touchY - itemCenterY);

        if (dist < 40 && dist < minDeltaY) {
          minDeltaY = dist;
          closestIdx = i;
        }
      }

      return closestIdx;
    },
    [angleStepRad, cy, radius, ITEM_WIDTH],
  );

  const panStartRef = useRef<{
    startPos: number;
    touchY: number;
    touchTime: number;
  }>({
    startPos: selectedIndex,
    touchY: 0,
    touchTime: 0,
  });
  const hasDraggedRef = useRef<boolean>(false);

  // Bulletproof PanResponder: captures and preserves touch without Android interruptions
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !disabledRef.current,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (_, g) => !disabledRef.current && (Math.abs(g.dy) > 2 || Math.abs(g.dx) > 3),
      onMoveShouldSetPanResponderCapture: (_, g) => !disabledRef.current && (Math.abs(g.dy) > 2 || Math.abs(g.dx) > 3),

      // CRITICAL: Prevent Android system from terminating the vertical drag
      onPanResponderTerminationRequest: () => false,

      onPanResponderGrant: (evt) => {
        isInteractingRef.current = true;
        hasDraggedRef.current = false;
        positionAnim.stopAnimation();

        const currentVal = currentPosRef.current;
        panStartRef.current = {
          startPos: currentVal,
          touchY: evt.nativeEvent.locationY,
          touchTime: Date.now(),
        };
      },

      onPanResponderMove: (_, gestureState) => {
        if (disabledRef.current) return;

        const deltaY = gestureState.dy;
        const deltaX = gestureState.dx;

        if (!hasDraggedRef.current && (Math.abs(deltaY) > 2 || Math.abs(deltaX) > 3)) {
          hasDraggedRef.current = true;
        }

        if (hasDraggedRef.current) {
          // Dragging up (deltaY < 0) advances to next items; dragging down goes back
          const nextPos = panStartRef.current.startPos - deltaY / itemSpacingPxRef.current;
          const clamped = Math.min(
            itemsRef.current.length - 0.25,
            Math.max(-0.25, nextPos),
          );

          currentPosRef.current = clamped;
          positionAnim.setValue(clamped);

          // Direct frame update for zero-lag 1:1 finger tracking
          setCurrentPosition(clamped);

          // Real-time live shade morphing notification
          if (onPositionChangeRef.current) {
            onPositionChangeRef.current(clamped);
          }

          // Haptic detents on integer threshold crossing
          const nearest = Math.min(
            itemsRef.current.length - 1,
            Math.max(0, Math.round(clamped)),
          );
          if (nearest !== lastDetentRef.current) {
            lastDetentRef.current = nearest;
            Haptics.selectionAsync().catch(() => {});
          }
        }
      },

      onPanResponderRelease: (evt, gestureState) => {
        const elapsed = Date.now() - panStartRef.current.touchTime;
        const deltaY = gestureState.dy;
        const deltaX = gestureState.dx;

        const isTap =
          !hasDraggedRef.current &&
          Math.abs(deltaY) < 6 &&
          Math.abs(deltaX) < 8 &&
          elapsed < 380;

        if (isTap) {
          const tappedIdx = findTappedItemIndex(panStartRef.current.touchY);
          if (tappedIdx !== -1) {
            Haptics.selectionAsync().catch(() => {});
            settleToIndex(tappedIdx);
            return;
          }
        }

        // Inertial coasting with velocity damping
        const velocityY = gestureState.vy;
        const currentPos = currentPosRef.current;
        const momentumItems = -velocityY * 0.38 * (160 / itemSpacingPxRef.current);
        const projected = currentPos + momentumItems;
        const target = Math.round(projected);

        settleToIndex(target, velocityY);
      },

      onPanResponderTerminate: () => {
        const nearest = Math.round(currentPosRef.current);
        settleToIndex(nearest);
      },
    }),
  ).current;

  // Sync listener on positionAnim during spring animations
  useEffect(() => {
    const id = positionAnim.addListener(({ value: pos }) => {
      currentPosRef.current = pos;
      setCurrentPosition(pos);

      if (onPositionChangeRef.current) {
        onPositionChangeRef.current(pos);
      }

      // Detent haptic click as each item crosses center
      const nearest = Math.min(
        items.length - 1,
        Math.max(0, Math.round(pos)),
      );
      if (nearest !== lastDetentRef.current && isInteractingRef.current) {
        lastDetentRef.current = nearest;
        const item = items[nearest];
        if (item && !item.disabled) {
          Haptics.selectionAsync().catch(() => {});
          const itemId = getItemId(item, nearest);
          if (value === undefined) {
            setInternalValue(itemId);
          }
          if (onValueChangeRef.current) {
            onValueChangeRef.current(itemId);
          }
        }
      }
    });

    return () => {
      positionAnim.removeListener(id);
    };
  }, [items, value, positionAnim, getItemId]);

  // Sync external controlled value when not actively dragging
  useEffect(() => {
    if (!isInteractingRef.current) {
      const idx = items.findIndex((i, index) => getItemId(i, index) === selectedValue);
      if (idx >= 0 && Math.abs(idx - currentPosRef.current) > 0.05) {
        Animated.spring(positionAnim, {
          toValue: idx,
          stiffness: 240,
          damping: 24,
          useNativeDriver: false,
        }).start();
      }
    }
  }, [selectedValue, items, positionAnim, getItemId]);

  return (
    <View
      {...panResponder.panHandlers}
      style={[
        styles.rootContainer,
        {
          height: containerHeight,
          width: '100%',
        },
        style,
      ]}
    >
      {/* ═══ RADIAL WHEEL CAROUSEL ITEMS ═══ */}
      {items.map((item, index) => {
        const delta = index - currentPosition;
        const absDelta = Math.abs(delta);

        // Cull items outside visible sweep range (±5.2 items)
        if (absDelta > 5.2) {
          return null;
        }

        const angle = delta * angleStepRad;
        const rotationDeg = (angle * 180) / Math.PI;

        // Exact analytical positioning: anchors item start on the circle circumference
        const centerX = cx + (radius + ITEM_WIDTH / 2) * Math.cos(angle);
        const centerY = cy + (radius + ITEM_WIDTH / 2) * Math.sin(angle);

        // Opacity falloff matching cinematic depth
        let opacity = 0;
        let scale = 1.0;
        if (absDelta <= 0.45) {
          opacity = 1.0;
          scale = 1.05;
        } else if (absDelta <= 1.2) {
          opacity = 0.65 - (absDelta - 0.45) * 0.22;
          scale = 0.98;
        } else if (absDelta <= 2.2) {
          opacity = 0.40 - (absDelta - 1.2) * 0.16;
          scale = 0.92;
        } else if (absDelta <= 3.4) {
          opacity = 0.22 - (absDelta - 2.2) * 0.10;
          scale = 0.86;
        } else {
          opacity = Math.max(0, (5.2 - absDelta) * 0.08);
          scale = 0.80;
        }

        const isSelected = absDelta < 0.45;
        const dotOpacity = Math.max(0, 1 - absDelta * 2.2);
        const itemId = getItemId(item, index);

        return (
          <View
            key={itemId}
            pointerEvents="none"
            style={[
              styles.itemContainer,
              {
                width: ITEM_WIDTH,
                height: ITEM_HEIGHT,
                left: centerX - ITEM_WIDTH / 2,
                top: centerY - ITEM_HEIGHT / 2,
                transform: [
                  { rotate: `${rotationDeg}deg` },
                  { scale },
                ],
                opacity,
              },
            ]}
          >
            {/* Active Selection Indicator Dot */}
            <View
              style={[
                styles.dotWrapper,
                { opacity: dotOpacity },
              ]}
            >
              <View
                style={[
                  styles.activeDot,
                  {
                    backgroundColor: accentColor,
                    shadowColor: accentColor,
                  },
                ]}
              />
            </View>

            {/* Label */}
            <Text
              numberOfLines={1}
              style={[
                styles.itemLabel,
                isSelected ? styles.itemLabelSelected : styles.itemLabelDimmed,
              ]}
            >
              {item.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  rootContainer: {
    position: 'relative',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'flex-start',
    backgroundColor: 'transparent',
  },
  itemContainer: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  dotWrapper: {
    width: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  activeDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 8,
    elevation: 4,
  },
  itemLabel: {
    fontFamily: FONTS.display,
    fontSize: 18.5,
    letterSpacing: -0.2,
  },
  itemLabelSelected: {
    color: '#FFFFFF',
    fontSize: 21,
    letterSpacing: -0.3,
  },
  itemLabelDimmed: {
    color: 'rgba(255, 255, 255, 0.65)',
  },
});
