import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { ChevronLeft } from 'reicon-react-native';
import * as Haptics from 'expo-haptics';

import { WheelCarousel, WheelCarouselItem } from '../components/motion/WheelCarousel';
import { ShaderBackground } from '../components/theme/ShaderBackground';
import {
  THEME_SHADERS,
  DEFAULT_THEME_ID,
  getThemeShader,
  ThemeShader,
} from '../theme/shaderManager';
import { useAppTheme } from '../theme/ThemeContext';
import { useCascadeBackTransition } from '../components/navigation/CascadePageTransition';
import { FONTS } from '../theme/typography';

// Dynamic wheel carousel items mapped from all registered themes
const WHEEL_ITEMS: WheelCarouselItem[] = THEME_SHADERS.map((t) => ({
  id: t.id,
  label: t.label,
}));

// Real-time continuous theme tone interpolation for live shade morphing
function interpolateTheme(pos: number): ThemeShader {
  const len = THEME_SHADERS.length;
  if (len === 0) return getThemeShader(DEFAULT_THEME_ID);

  const clampedPos = Math.max(0, Math.min(len - 1, pos));
  const idxA = Math.floor(clampedPos);
  const idxB = Math.min(len - 1, Math.ceil(clampedPos));
  const ratio = clampedPos - idxA;

  const themeA = THEME_SHADERS[idxA];
  if (idxA === idxB || ratio < 0.001) return themeA;
  const themeB = THEME_SHADERS[idxB];
  if (ratio > 0.999) return themeB;

  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const lerp3 = (
    c1: [number, number, number],
    c2: [number, number, number],
    t: number,
  ): [number, number, number] => [
    lerp(c1[0], c2[0], t),
    lerp(c1[1], c2[1], t),
    lerp(c1[2], c2[2], t),
  ];

  return {
    ...themeA,
    id: ratio < 0.5 ? themeA.id : themeB.id,
    label: ratio < 0.5 ? themeA.label : themeB.label,
    time: ratio < 0.5 ? themeA.time : themeB.time,
    accentColor: ratio < 0.5 ? themeA.accentColor : themeB.accentColor,
    palette: ratio < 0.5 ? themeA.palette : themeB.palette,
    tones: {
      main: lerp3(themeA.tones.main, themeB.tones.main, ratio),
      low: lerp3(themeA.tones.low, themeB.tones.low, ratio),
      mid: lerp3(themeA.tones.mid, themeB.tones.mid, ratio),
      high: lerp3(themeA.tones.high, themeB.tones.high, ratio),
    },
    speed: lerp(themeA.speed, themeB.speed, ratio),
    scale: lerp(themeA.scale, themeB.scale, ratio),
    distortion: lerp(themeA.distortion, themeB.distortion, ratio),
    swirl: lerp(themeA.swirl, themeB.swirl, ratio),
    type: ratio < 0.5 ? themeA.type : themeB.type,
  };
}

export default function ThemeScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  useCascadeBackTransition(navigation);

  const { appliedTheme, applyTheme, isThemeApplied } = useAppTheme();

  // Active theme being previewed on the dial
  const [selectedThemeId, setSelectedThemeId] = useState<string>(
    appliedTheme?.id || DEFAULT_THEME_ID,
  );

  const initialIdx = useMemo(() => {
    const activeId = appliedTheme?.id || DEFAULT_THEME_ID;
    const idx = THEME_SHADERS.findIndex((t) => t.id === activeId);
    return Math.max(0, idx);
  }, [appliedTheme?.id]);

  // Floating continuous position updated on every touch slide pixel
  const [carouselPos, setCarouselPos] = useState<number>(initialIdx);
  const [appliedJustNow, setAppliedJustNow] = useState<boolean>(false);

  // Dynamic interpolated theme morphs colors and atmosphere continuously while sliding
  const currentTheme = useMemo(
    () => interpolateTheme(carouselPos),
    [carouselPos],
  );

  const handleApply = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    await applyTheme(selectedThemeId);
    setAppliedJustNow(true);
    setTimeout(() => setAppliedJustNow(false), 2400);
  };

  const isCurrentActive = isThemeApplied(selectedThemeId);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* ═══ LIVE WEBGL SHADER BACKGROUND ═══ */}
      <ShaderBackground theme={currentTheme} overlayOpacity={0.0} />

      {/* ═══ MINIMAL TOP HEADER (ONLY BACK BUTTON) ═══ */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top + 8, 44) }]}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            navigation.goBack();
          }}
          style={styles.backButton}
        >
          <ChevronLeft size={20} color="#FFFFFF" />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
      </View>

      {/* ═══ VERTICAL RADIAL WHEEL CAROUSEL ═══ */}
      <View style={styles.pickerStage}>
        <WheelCarousel
          items={WHEEL_ITEMS}
          value={selectedThemeId}
          onValueChange={(val) => {
            setSelectedThemeId(val);
            const idx = THEME_SHADERS.findIndex((t) => t.id === val);
            if (idx >= 0) setCarouselPos(idx);
          }}
          onPositionChange={(pos) => setCarouselPos(pos)}
          accentColor={currentTheme.accentColor}
        />
      </View>

      {/* ═══ SHRUNK-DOWN COMPACT BOTTOM THEME OVERVIEW ═══ */}
      <View
        style={[
          styles.footerContainer,
          { paddingBottom: Math.max(insets.bottom + 12, 28) },
        ]}
      >
        <View style={styles.compactCard}>
          <View style={styles.cardInfoRow}>
            <View style={styles.titleColumn}>
              <Text style={styles.themeNameText}>{currentTheme.label}</Text>
              <Text style={styles.themeSubtitleText}>
                {currentTheme.time || 'Atmospheric Theme'}
              </Text>
            </View>

            {/* Color Overview: 4 Palette Swatches */}
            <View style={styles.paletteSwatchesRow}>
              {currentTheme.palette.slice(0, 4).map((hex, idx) => (
                <View
                  key={`${hex}-${idx}`}
                  style={[styles.paletteDot, { backgroundColor: hex }]}
                />
              ))}
            </View>
          </View>

          {/* Apply Button */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={handleApply}
            style={[
              styles.applyButton,
              { backgroundColor: currentTheme.accentColor },
            ]}
          >
            <Text style={styles.applyButtonText}>
              {appliedJustNow
                ? '✓ Applied to All Screens'
                : isCurrentActive
                ? 'Theme Applied'
                : 'Apply Theme'}
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.hintText}>
          Drag vertically to spin dial • Tap any name to select
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
  },
  vignetteOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
  header: {
    paddingHorizontal: 16,
    zIndex: 20,
    alignItems: 'flex-start',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(24, 24, 27, 0.75)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  backText: {
    fontFamily: FONTS.sans,
    color: '#FFFFFF',
    fontSize: 13.5,
  },
  pickerStage: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  footerContainer: {
    paddingHorizontal: 20,
    zIndex: 20,
  },
  compactCard: {
    backgroundColor: 'rgba(18, 18, 22, 0.78)',
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    gap: 12,
  },
  cardInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  titleColumn: {
    flex: 1,
  },
  themeNameText: {
    fontFamily: FONTS.display,
    color: '#FFFFFF',
    fontSize: 19,
    letterSpacing: -0.2,
  },
  themeSubtitleText: {
    fontFamily: FONTS.sans,
    color: 'rgba(255, 255, 255, 0.55)',
    fontSize: 12,
    marginTop: 2,
  },
  paletteSwatchesRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 12,
  },
  paletteDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  applyButton: {
    width: '100%',
    paddingVertical: 11,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyButtonText: {
    fontFamily: FONTS.sans,
    color: '#000000',
    fontSize: 14,
    letterSpacing: 0.1,
  },
  hintText: {
    fontFamily: FONTS.sans,
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 10,
  },
});
