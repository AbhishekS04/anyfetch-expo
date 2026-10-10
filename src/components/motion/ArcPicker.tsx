import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  PanResponder,
  Animated,
  TouchableOpacity,
  StyleProp,
  ViewStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';

export type ArcPickerOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

export type ArcPickerSide = 'top' | 'bottom' | 'left' | 'right';

export interface ArcPickerProps {
  options: readonly ArcPickerOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  side?: ArcPickerSide;
  radius?: number;
  itemSpacing?: number;
  disabled?: boolean;
  accentColor?: string;
  style?: StyleProp<ViewStyle>;
}

const BRACKET_GAP = 8;
const BRACKET_EXPANSION = 10;

export const ArcPicker: React.FC<ArcPickerProps> = ({
  options,
  value,
  defaultValue,
  onValueChange,
  side = 'top',
  radius = 340,
  itemSpacing,
  disabled = false,
  accentColor = '#38bdf8',
  style,
}) => {
  const screenWidth = Dimensions.get('window').width;

  // Generous spacing along the arch ensures ample separation between adjacent words
  const spacing = itemSpacing || Math.max(230, Math.min(275, screenWidth * 0.62));
  const effectiveRadius = Math.max(320, radius);

  const firstEnabled = options.find((o) => !o.disabled)?.value;
  const [internalValue, setInternalValue] = useState<string>(
    defaultValue ?? firstEnabled ?? '',
  );

  const selectedValue = value !== undefined ? value : internalValue;
  const selectedIndex = Math.max(
    0,
    options.findIndex((o) => o.value === selectedValue),
  );

  // Position tracks continuous floating index along options
  const positionAnim = useRef(new Animated.Value(selectedIndex)).current;
  const [currentPosition, setCurrentPosition] = useState<number>(selectedIndex);

  // Animated bracket breath expansion (0: tight around word, 1: expanded while dragging)
  const expansionAnim = useRef(new Animated.Value(0)).current;

  // Measured label widths for pixel-perfect bracket snugness
  const [labelWidths, setLabelWidths] = useState<Record<string, number>>({});

  const isInteractingRef = useRef<boolean>(false);
  const lastDetentRef = useRef<number>(selectedIndex);
  const onValueChangeRef = useRef(onValueChange);

  useEffect(() => {
    onValueChangeRef.current = onValueChange;
  }, [onValueChange]);

  // Sync listener on positionAnim
  useEffect(() => {
    const id = positionAnim.addListener(({ value: pos }) => {
      setCurrentPosition(pos);

      // Trigger crisp haptic clicks during fluid drag
      const nearest = Math.min(
        options.length - 1,
        Math.max(0, Math.round(pos)),
      );
      if (nearest !== lastDetentRef.current && isInteractingRef.current) {
        lastDetentRef.current = nearest;
        const opt = options[nearest];
        if (opt && !opt.disabled) {
          Haptics.selectionAsync().catch(() => {});
          if (value === undefined) {
            setInternalValue(opt.value);
          }
          if (onValueChangeRef.current) {
            onValueChangeRef.current(opt.value);
          }
        }
      }
    });

    return () => {
      positionAnim.removeListener(id);
    };
  }, [options, value, positionAnim]);

  // Smooth spring settle to a target index
  const settleToIndex = useCallback(
    (targetIdx: number, velocity: number = 0) => {
      const clamped = Math.min(
        options.length - 1,
        Math.max(0, targetIdx),
      );

      // Squeeze brackets back around the word
      Animated.spring(expansionAnim, {
        toValue: 0,
        stiffness: 280,
        damping: 24,
        useNativeDriver: false,
      }).start();

      Animated.spring(positionAnim, {
        toValue: clamped,
        stiffness: 240,
        damping: 25,
        mass: 0.8,
        velocity: -velocity * 0.4,
        useNativeDriver: false,
      }).start(() => {
        isInteractingRef.current = false;
        const opt = options[clamped];
        if (opt && !opt.disabled) {
          if (value === undefined) {
            setInternalValue(opt.value);
          }
          if (onValueChangeRef.current) {
            onValueChangeRef.current(opt.value);
          }
        }
      });
    },
    [options, value, positionAnim, expansionAnim],
  );

  // Sync external controlled value
  useEffect(() => {
    if (!isInteractingRef.current) {
      const idx = options.findIndex((o) => o.value === selectedValue);
      if (idx >= 0 && Math.abs(idx - currentPosition) > 0.05) {
        Animated.spring(positionAnim, {
          toValue: idx,
          stiffness: 240,
          damping: 25,
          useNativeDriver: false,
        }).start();
      }
    }
  }, [selectedValue, options, currentPosition, positionAnim]);

  // Touch gesture responder with immediate capture
  const panStartRef = useRef<{ coord: number; startPos: number; time: number }>({
    coord: 0,
    startPos: selectedIndex,
    time: 0,
  });

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        // Allow stationary child taps without capturing immediately on down
        onStartShouldSetPanResponder: () => false,
        onStartShouldSetPanResponderCapture: () => false,

        // CAPTURE horizontal finger swipe IMMEDIATELY as soon as dx exceeds 3px
        onMoveShouldSetPanResponder: (_, gestureState) => {
          if (disabled) return false;
          return Math.abs(gestureState.dx) > 3;
        },
        onMoveShouldSetPanResponderCapture: (_, gestureState) => {
          if (disabled) return false;
          return Math.abs(gestureState.dx) > 3;
        },

        onPanResponderGrant: (_, gestureState) => {
          isInteractingRef.current = true;
          positionAnim.stopAnimation((currentVal) => {
            panStartRef.current = {
              coord: gestureState.x0,
              startPos: currentVal !== undefined ? currentVal : currentPosition,
              time: Date.now(),
            };
          });

          // Breath expand brackets outward during drag
          Animated.spring(expansionAnim, {
            toValue: 1,
            stiffness: 300,
            damping: 20,
            useNativeDriver: false,
          }).start();
        },

        onPanResponderMove: (_, gestureState) => {
          if (!isInteractingRef.current) return;
          const delta = gestureState.dx;

          // Dragging left (negative delta) advances to next items, dragging right to previous
          const next = panStartRef.current.startPos - delta / spacing;
          const clamped = Math.min(
            options.length - 0.35,
            Math.max(-0.35, next),
          );

          positionAnim.setValue(clamped);
        },

        onPanResponderRelease: (_, gestureState) => {
          const delta = gestureState.dx;
          const velocity = gestureState.vx;

          const currentPos = panStartRef.current.startPos - delta / spacing;

          // Gentle coasting inertia
          const projected = currentPos - velocity * 0.22 * (280 / spacing);
          const target = Math.round(projected);

          settleToIndex(target, velocity);
        },

        onPanResponderTerminate: () => {
          const nearest = Math.round(currentPosition);
          settleToIndex(nearest);
        },
      }),
    [disabled, spacing, options.length, currentPosition, positionAnim, expansionAnim, settleToIndex],
  );

  const handleTextLayout = (val: string, width: number) => {
    if (width > 0 && (!labelWidths[val] || Math.abs(labelWidths[val] - width) > 3)) {
      setLabelWidths((prev) => ({ ...prev, [val]: Math.ceil(width) }));
    }
  };

  const activeLabelWidth = useMemo(() => {
    const curOpt = options[selectedIndex];
    if (curOpt && labelWidths[curOpt.value]) {
      return labelWidths[curOpt.value];
    }
    const len = curOpt ? curOpt.label.length : 10;
    return Math.max(90, Math.min(220, len * 11.5 + 16));
  }, [options, selectedIndex, labelWidths]);

  const containerHeight = 250;
  const topAnchor = 52;

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
      {/* ═══ CURVED ARC OPTIONS (STRICT 3-ITEM VISIBILITY PREVENTS OVERLAP) ═══ */}
      {options.map((option, index) => {
        const distance = Math.abs(index - currentPosition);

        // Cull any item beyond 1.35 units so only center and immediate neighbors exist
        if (distance > 1.35) {
          return null;
        }

        const delta = index - currentPosition;
        const angle = Math.min(
          1.3,
          Math.max(-1.3, (delta * spacing) / effectiveRadius),
        );

        // Coordinates along the top arch
        const along = effectiveRadius * Math.sin(angle);
        const bend = effectiveRadius * (1 - Math.cos(angle));
        const rotation = (angle * 180) / Math.PI;

        // Opacity falloff:
        // Center item (distance <= 0.45): 1.0
        // Immediate neighbors (distance 0.45 -> 1.35): smooth fade from 0.42 to 0.0
        let opacity = 0;
        let scale = 1.0;
        if (distance <= 0.45) {
          opacity = 1.0;
          scale = 1.04;
        } else {
          const t = (distance - 0.45) / (1.35 - 0.45);
          opacity = Math.max(0, 0.42 * (1 - t));
          scale = 1.0 - t * 0.12;
        }

        const isSelected =
          Math.abs(index - Math.round(currentPosition)) === 0 &&
          distance < 0.45;

        return (
          <TouchableOpacity
            key={option.value}
            activeOpacity={0.7}
            disabled={disabled || option.disabled}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              settleToIndex(index);
            }}
            style={[
              styles.optionItem,
              {
                top: topAnchor,
                left: screenWidth / 2,
                transform: [
                  { translateX: along },
                  { translateY: bend },
                  { rotate: `${rotation}deg` },
                  { scale },
                ],
                opacity,
              },
            ]}
          >
            <Text
              numberOfLines={1}
              onTextLayout={(e) => {
                const w = e.nativeEvent.lines[0]?.width;
                if (w) handleTextLayout(option.value, w);
              }}
              style={[
                styles.optionLabel,
                isSelected
                  ? [styles.selectedLabel, { color: accentColor }]
                  : styles.unselectedLabel,
              ]}
            >
              {option.label}
            </Text>
          </TouchableOpacity>
        );
      })}

      {/* ═══ DYNAMIC BRACKET FRAME [   ] ═══ */}
      <View
        pointerEvents="none"
        style={[
          styles.bracketContainer,
          {
            top: topAnchor,
            left: screenWidth / 2,
          },
        ]}
      >
        {/* Leading bracket [ */}
        <Animated.View
          style={[
            styles.bracketLead,
            {
              transform: [
                {
                  translateX: expansionAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [
                      -activeLabelWidth / 2 - BRACKET_GAP,
                      -activeLabelWidth / 2 - BRACKET_GAP - BRACKET_EXPANSION,
                    ],
                  }),
                },
              ],
            },
          ]}
        >
          <Text style={[styles.bracketText, { color: accentColor }]}>[</Text>
        </Animated.View>

        {/* Trailing bracket ] */}
        <Animated.View
          style={[
            styles.bracketTrail,
            {
              transform: [
                {
                  translateX: expansionAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [
                      activeLabelWidth / 2 + BRACKET_GAP,
                      activeLabelWidth / 2 + BRACKET_GAP + BRACKET_EXPANSION,
                    ],
                  }),
                },
              ],
            },
          ]}
        >
          <Text style={[styles.bracketText, { color: accentColor }]}>]</Text>
        </Animated.View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  rootContainer: {
    position: 'relative',
    overflow: 'hidden',
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  optionItem: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -110,
    width: 220,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  optionLabel: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  selectedLabel: {
    fontWeight: '700',
    fontSize: 19,
  },
  unselectedLabel: {
    color: 'rgba(255, 255, 255, 0.45)',
  },
  bracketContainer: {
    position: 'absolute',
    height: 44,
    width: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bracketLead: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bracketTrail: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bracketText: {
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 26,
  },
});
