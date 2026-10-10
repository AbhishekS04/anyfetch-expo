import { SupportedPlatform } from '../theme/platformColors';

export type MediaType = 'video' | 'image' | 'audio' | 'carousel';

export interface QualityOption {
  id: string; // '720p' | '360p' | 'audio'
  label: string; // '720p HD' | '360p' | 'Audio (MP3)'
  resolution?: string;
  type: 'video' | 'audio';
  url: string;
  container: 'mp4' | 'mp3' | 'm4a';
  bitrate?: string;
}

export interface ExtractedMediaItem {
  index: number;
  type: 'video' | 'image';
  url: string;
  thumbnail?: string;
  selected?: boolean;
}

export interface ExtractedResult {
  platform: SupportedPlatform;
  type: MediaType;
  url: string;
  thumbnail?: string;
  title?: string;
  author?: string;
  duration?: number;
  hlsNote?: string;
  qualities?: QualityOption[];
  carouselItems?: ExtractedMediaItem[];
}
