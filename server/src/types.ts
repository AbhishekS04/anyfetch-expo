export type MediaType = 'video' | 'image' | 'audio' | 'carousel';

export interface QualityOption {
  id: string; // '1080p' | '720p' | '480p' | '360p' | 'audio'
  label: string;
  type: 'video' | 'audio';
  url: string;
  container: 'mp4' | 'mp3' | 'm4a';
  bitrate?: string;
  needsMuxing?: boolean;
  videoUrl?: string;
  audioUrl?: string;
}

export interface CarouselItem {
  index: number;
  type: 'video' | 'image';
  url: string;
  thumbnail?: string;
}

export interface ExtractedMediaResponse {
  success: boolean;
  platform: string;
  type: MediaType;
  title: string;
  author: string;
  thumbnail: string;
  duration?: number;
  url?: string;
  qualities?: QualityOption[];
  carouselItems?: CarouselItem[];
  error?: string;
}
