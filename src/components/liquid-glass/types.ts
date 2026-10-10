import type { StyleProp, ViewStyle } from 'react-native';

export interface LiquidGlassCarouselItem {
  id?: string;
  src: string;
  title: string;
  subtitle?: string;
  /** Width / height. Default is 3 / 4 (portrait). */
  aspect?: number;
  data?: any;
}

export interface LiquidGlassCarouselProps {
  items?: LiquidGlassCarouselItem[];
  /** Target panel height in pixels. Default 360-450 depending on screen. */
  panelHeight?: number;
  gap?: number;
  background?: string;
  entry?: boolean;
  style?: StyleProp<ViewStyle>;
  showText?: boolean;
  onActiveChange?: (index: number) => void;
  onFocusChange?: (focused: boolean) => void;
  onItemPress?: (item: LiquidGlassCarouselItem, index: number) => void;
}

export interface LiquidGlassCarouselHandle {
  closeFocus: () => void;
  next: () => void;
  previous: () => void;
  destroy: () => void;
}

export type PanelRect = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  poolIdx: number;
  srcIndex: number;
  centerX: number;
};
