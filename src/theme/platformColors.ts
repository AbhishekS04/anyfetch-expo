import React from 'react';
import {
  Instagram,
  Video,
  Pin,
  Share,
  Link,
  type IconComponent,
} from 'reicon-react-native';

export type SupportedPlatform = 'instagram' | 'pinterest' | 'twitter' | 'youtube' | 'facebook' | 'tiktok' | 'reddit';

export interface PlatformTheme {
  primary: string;
  glow: string;
  glowLight: string;
  Icon: IconComponent;
  label: string;
}

export const PLATFORM_THEMES: Record<SupportedPlatform, PlatformTheme> = {
  youtube: {
    primary: '#FF0000',
    glow: 'rgba(255, 0, 0, 0.25)',
    glowLight: 'rgba(255, 0, 0, 0.08)',
    Icon: Video,
    label: 'YouTube',
  },
  instagram: {
    primary: '#E1306C',
    glow: 'rgba(225, 48, 108, 0.25)',
    glowLight: 'rgba(225, 48, 108, 0.08)',
    Icon: Instagram,
    label: 'Instagram',
  },
  pinterest: {
    primary: '#E60023',
    glow: 'rgba(230, 0, 35, 0.25)',
    glowLight: 'rgba(230, 0, 35, 0.08)',
    Icon: Pin,
    label: 'Pinterest',
  },
  twitter: {
    primary: '#1D9BF0',
    glow: 'rgba(29, 155, 240, 0.25)',
    glowLight: 'rgba(29, 155, 240, 0.08)',
    Icon: Share,
    label: 'Twitter / X',
  },
  facebook: {
    primary: '#1877F2',
    glow: 'rgba(24, 119, 242, 0.25)',
    glowLight: 'rgba(24, 119, 242, 0.08)',
    Icon: Video,
    label: 'Facebook',
  },
  tiktok: {
    primary: '#00F2FE',
    glow: 'rgba(0, 242, 254, 0.25)',
    glowLight: 'rgba(0, 242, 254, 0.08)',
    Icon: Video,
    label: 'TikTok',
  },
  reddit: {
    primary: '#FF4500',
    glow: 'rgba(255, 69, 0, 0.25)',
    glowLight: 'rgba(255, 69, 0, 0.08)',
    Icon: Share,
    label: 'Reddit',
  },
};

export const DEFAULT_THEME: PlatformTheme = {
  primary: '#FF9F0A',
  glow: 'rgba(255, 159, 10, 0.25)',
  glowLight: 'rgba(255, 159, 10, 0.08)',
  Icon: Link,
  label: 'Link',
};

export function getPlatformTheme(platform: SupportedPlatform | null | undefined): PlatformTheme {
  if (platform && PLATFORM_THEMES[platform]) {
    return PLATFORM_THEMES[platform];
  }
  return DEFAULT_THEME;
}
