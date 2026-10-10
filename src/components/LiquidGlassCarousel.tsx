import React, {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
  useCallback,
  useEffect,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  PanResponder,
  TouchableOpacity,
  PixelRatio,
  Platform,
  Dimensions,
} from 'react-native';
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import { AlertTriangle, X } from 'reicon-react-native';
import { colors } from '../theme/colors';
import { FONTS } from '../theme/typography';
import type {
  LiquidGlassCarouselItem,
  LiquidGlassCarouselProps,
  LiquidGlassCarouselHandle,
} from './liquid-glass/types';
import { defaultCarouselItems } from './liquid-glass/constants';
import { createCarouselEngine } from './liquid-glass/CarouselEngine';

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export const LiquidGlassCarousel = forwardRef<
  LiquidGlassCarouselHandle,
  LiquidGlassCarouselProps
>(function LiquidGlassCarousel(
  {
    items = defaultCarouselItems,
    panelHeight = 440,
    gap = 14,
    background = '#000000',
    entry = true,
    showText = false,
    style,
    onActiveChange,
    onFocusChange,
    onItemPress,
  },
  ref
) {
  const engineRef = useRef<ReturnType<typeof createCarouselEngine> | null>(null);
  const win = Dimensions.get('window');
  const containerSizeRef = useRef({ width: win.width, height: win.height });
  const [active, setActive] = useState(0);
  const [focused, setFocused] = useState(false);
  const [entryDone, setEntryDone] = useState(!entry);
  const [hasError, setHasError] = useState(false);

  const onActiveChangeRef = useRef(onActiveChange);
  const onFocusChangeRef = useRef(onFocusChange);
  const onItemPressRef = useRef(onItemPress);
  onActiveChangeRef.current = onActiveChange;
  onFocusChangeRef.current = onFocusChange;
  onItemPressRef.current = onItemPress;

  const currentItem = items[active] ?? items[0];

  useImperativeHandle(ref, () => ({
    closeFocus: () => {
      engineRef.current?.closeFocus();
    },
    next: () => {
      engineRef.current?.next();
    },
    previous: () => {
      engineRef.current?.previous();
    },
    destroy: () => {
      engineRef.current?.destroy();
      engineRef.current = null;
    },
  }));

  const handleActiveChange = useCallback((idx: number) => {
    setActive(idx);
    onActiveChangeRef.current?.(idx);
  }, []);

  const handleFocusChange = useCallback((isFocused: boolean) => {
    setFocused(isFocused);
    onFocusChangeRef.current?.(isFocused);
  }, []);

  const handleContextCreate = useCallback(
    (gl: ExpoWebGLRenderingContext) => {
      try {
        const { width, height } = containerSizeRef.current;
        const w = width > 0 ? width : gl.drawingBufferWidth;
        const h = height > 0 ? height : gl.drawingBufferHeight;
        const pr = PixelRatio.get();

        const engine = createCarouselEngine(gl, w, h, pr, {
          items,
          panelHeight,
          gap,
          background,
          entry,
          onActiveChange: handleActiveChange,
          onFocusChange: handleFocusChange,
          onEntryDone: setEntryDone,
          onItemPress: (item, idx) => {
            onItemPressRef.current?.(item, idx);
          },
        });

        engineRef.current = engine;
      } catch (err) {
        console.error('[LiquidGlass] Error creating GL context/engine:', err);
        setHasError(true);
      }
    },
    [items, panelHeight, gap, background, entry, handleActiveChange, handleFocusChange]
  );

  useEffect(() => {
    return () => {
      if (engineRef.current) {
        engineRef.current.destroy();
        engineRef.current = null;
      }
    };
  }, []);

  // PanResponder for touch events
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dx) > 3 || Math.abs(gestureState.dy) > 3;
      },
      onMoveShouldSetPanResponderCapture: () => false,
      onPanResponderGrant: (evt) => {
        engineRef.current?.handleTouchDown(
          evt.nativeEvent.locationX,
          evt.nativeEvent.locationY
        );
      },
      onPanResponderMove: (evt) => {
        engineRef.current?.handleTouchMove(
          evt.nativeEvent.locationX,
          evt.nativeEvent.locationY
        );
      },
      onPanResponderRelease: (evt) => {
        engineRef.current?.handleTouchUp(
          evt.nativeEvent.locationX,
          evt.nativeEvent.locationY
        );
      },
      onPanResponderTerminate: (evt) => {
        engineRef.current?.handleTouchUp(
          evt.nativeEvent.locationX,
          evt.nativeEvent.locationY
        );
      },
      onPanResponderTerminationRequest: () => false,
    })
  ).current;

  return (
    <View
      style={[styles.container, { backgroundColor: background }, style]}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        containerSizeRef.current = { width, height };
        if (engineRef.current) {
          engineRef.current.resize(width, height);
        }
      }}
      {...panResponder.panHandlers}
    >
      {hasError ? (
        <View style={styles.errorContainer}>
          <AlertTriangle size={32} color={colors.accent} />
          <Text style={styles.errorText}>
            WebGL renderer is unavailable on this device.
          </Text>
        </View>
      ) : (
        <GLView
          style={StyleSheet.absoluteFill}
          onContextCreate={handleContextCreate}
        />
      )}

      {/* Optional Top Header & Counter (only when showText is true) */}
      {showText && (
        <>
          <View
            pointerEvents="none"
            style={[
              styles.titleContainer,
              { opacity: entryDone ? 1 : 0 },
            ]}
          >
            <Text numberOfLines={1} style={styles.titleText}>
              {currentItem?.title ?? ''}
            </Text>
            {currentItem?.subtitle ? (
              <Text numberOfLines={1} style={styles.subtitleText}>
                {currentItem.subtitle}
              </Text>
            ) : null}
          </View>

          <View
            pointerEvents="none"
            style={[
              styles.counterContainer,
              { opacity: entryDone && !focused ? 1 : 0 },
            ]}
          >
            <Text style={styles.counterText}>
              {pad(active + 1)} / {pad(items.length)}
            </Text>
          </View>
        </>
      )}

      {/* Floating minimal close button when card is focused */}
      {focused && (
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => engineRef.current?.closeFocus()}
          style={styles.closeButton}
        >
          <X size={18} color="#FFFFFF" />
        </TouchableOpacity>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    width: '100%',
    minHeight: 420,
    flex: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  errorText: {
    fontFamily: FONTS.sans,
    color: colors.textSecondary,
    fontSize: 14,
    marginTop: 12,
    textAlign: 'center',
  },
  titleContainer: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 16 : 14,
    left: 20,
    right: 20,
    alignItems: 'center',
    zIndex: 10,
  },
  titleText: {
    fontFamily: FONTS.display,
    color: '#FFFFFF',
    fontSize: 17,
    letterSpacing: -0.3,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  subtitleText: {
    fontFamily: FONTS.sans,
    color: colors.accent,
    fontSize: 12,
    marginTop: 2,
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  counterContainer: {
    position: 'absolute',
    bottom: 18,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  counterText: {
    fontFamily: FONTS.sans,
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    letterSpacing: 1,
  },
  closeButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 44 : 24,
    right: 20,
    zIndex: 20,
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(24, 24, 26, 0.75)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
});
