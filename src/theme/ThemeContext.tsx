import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from 'react';
import {
  documentDirectory,
  getInfoAsync,
  readAsStringAsync,
  writeAsStringAsync,
} from 'expo-file-system/legacy';
import { ThemeShader, getThemeShader, DEFAULT_THEME_ID } from './shaderManager';
import { colors } from './colors';

const SETTINGS_FILE = (documentDirectory ?? '') + 'settings.json';

export interface AppThemeColors {
  bg: string;
  card: string;
  cardSecondary: string;
  surface: string;
  surfaceSubtle: string;
  border: string;
  borderLight: string;
  accent: string;
  accentGlow: string;
  accentGlowLight: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  error: string;
  success: string;
}

export function computeThemeColors(theme: ThemeShader): AppThemeColors {
  const accent = theme.accentColor || '#38bdf8';
  const palette = theme.palette || ['#000000', '#18181A', '#2C2C2E', '#38bdf8'];
  const bg = palette[0] || '#000000';
  const card = palette[1] || '#18181A';
  const border = palette[2] || '#2C2C2E';

  return {
    bg,
    card,
    cardSecondary: '#121214',
    surface: '#242426',
    surfaceSubtle: '#1C1C1E',
    border,
    borderLight: '#3A3A3C',
    accent,
    accentGlow: `rgba(${parseInt(accent.slice(1, 3), 16) || 56}, ${parseInt(accent.slice(3, 5), 16) || 189}, ${parseInt(accent.slice(5, 7), 16) || 248}, 0.25)`,
    accentGlowLight: `rgba(${parseInt(accent.slice(1, 3), 16) || 56}, ${parseInt(accent.slice(3, 5), 16) || 189}, ${parseInt(accent.slice(5, 7), 16) || 248}, 0.08)`,
    textPrimary: '#FFFFFF',
    textSecondary: '#8E8E93',
    textMuted: '#636366',
    error: '#FF453A',
    success: '#30D158',
  };
}

export function syncGlobalColors(themeColors: AppThemeColors) {
  Object.assign(colors, themeColors);
}

interface ThemeContextValue {
  appliedTheme: ThemeShader;
  colors: AppThemeColors;
  applyTheme: (themeId: string) => Promise<void>;
  isThemeApplied: (themeId: string) => boolean;
}

const ThemeContext = createContext<ThemeContextValue>({
  appliedTheme: getThemeShader(DEFAULT_THEME_ID),
  colors: computeThemeColors(getThemeShader(DEFAULT_THEME_ID)),
  applyTheme: async () => {},
  isThemeApplied: () => false,
});

export const useAppTheme = () => useContext(ThemeContext);

export const AppThemeProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [appliedThemeId, setAppliedThemeId] = useState<string>(DEFAULT_THEME_ID);

  const appliedTheme = getThemeShader(appliedThemeId);
  const themeColors = computeThemeColors(appliedTheme);

  // Sync static colors module on every state update
  syncGlobalColors(themeColors);

  // Load saved theme on app launch
  useEffect(() => {
    async function loadSavedTheme() {
      try {
        const fileInfo = await getInfoAsync(SETTINGS_FILE);
        if (fileInfo.exists) {
          const content = await readAsStringAsync(SETTINGS_FILE);
          const data = JSON.parse(content);
          if (data.appliedThemeId) {
            setAppliedThemeId(data.appliedThemeId);
          }
        }
      } catch {}
    }
    loadSavedTheme();
  }, []);

  const applyTheme = useCallback(async (themeId: string) => {
    setAppliedThemeId(themeId);
    const targetTheme = getThemeShader(themeId);
    const targetColors = computeThemeColors(targetTheme);
    syncGlobalColors(targetColors);

    // Persist to settings.json
    try {
      let existingSettings: any = {};
      const fileInfo = await getInfoAsync(SETTINGS_FILE);
      if (fileInfo.exists) {
        const content = await readAsStringAsync(SETTINGS_FILE);
        existingSettings = JSON.parse(content);
      }
      existingSettings.appliedThemeId = themeId;
      await writeAsStringAsync(SETTINGS_FILE, JSON.stringify(existingSettings));
    } catch (e) {
      console.warn('Failed to save theme setting:', e);
    }
  }, []);

  const isThemeApplied = useCallback(
    (themeId: string) => appliedThemeId === themeId,
    [appliedThemeId],
  );

  return (
    <ThemeContext.Provider
      value={{
        appliedTheme,
        colors: themeColors,
        applyTheme,
        isThemeApplied,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};
