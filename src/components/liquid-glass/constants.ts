import type { LiquidGlassCarouselItem } from './types';

export const PORTRAIT_ASPECT = 3 / 4;

export const LENS = {
  sizeX: 0.565,
  sizeY: 1,
  posX: 0.5,
  posY: 0.5,
  rotation: 65,
  spin: 0,
  zoom: 0,
  dispersion: 11,
  blur: 0,
  glow: 4.2,
  whiteGlow: 0.24,
  novaSize: 12,
  blueRing: 6,
  ringRadius: 0.49,
  ringWidth: 0.014,
  shimmer: true,
  shimmerFreq: 12,
  shimmerSpeed: 3.5,
  shimmerDepth: 0.12,
  rimStart: 0.578,
  rimTangential: 0.6,
  rimInward: 0,
  rimFreq1: 2,
  rimFreq2: 1,
  blueColor: '#009dff',
  rimLine: 1.4,
  rimLinePos: 0.488,
  rimLineWidth: 0.003,
  vignette: 0,
  vignetteSize: 0.3,
  samples: 16,
};

export const FOCUS = {
  cardDuration: 0.7,
  focusDuration: 0.9,
  cardEase: 'power4.out',
  focusEase: 'power3.out',
  stagger: 0.06,
  dropDist: 1.4,
  centerScale: 1.18,
  lensFade: 0.85,
};

export const ENTRY = {
  delay: 0.5,
  startH: 80,
  riseDuration: 1.0,
  stagger: 0.07,
  riseEase: 'power3.out',
  fromBelow: 0.9,
  growDelay: 0.25,
  growDuration: 2.15,
  growEase: 'expo.inOut',
  growStagger: 0.085,
  lensBloom: 1.4,
  lensBloomEase: 'power2.inOut',
};

export const LENS_FX_KEYS = [
  'uDispersion',
  'uBlueRing',
  'uRimLine',
  'uVignette',
  'uZoom',
  'uRimTangential',
  'uRimInward',
] as const;

export const REPEATS = 4;
export const CLICK_SLOP = 6;
export const TOUCH_CLICK_SLOP = 12;
export const FLICK_IDLE_MS = 90;

const photo = (id: string) =>
  `https://images.unsplash.com/photo-${id}?w=900&h=1200&q=85&auto=format&fit=crop`;

export const defaultCarouselItems: LiquidGlassCarouselItem[] = [
  { id: '1', title: 'Project One', src: photo('1600585154340-be6161a56a0c'), aspect: PORTRAIT_ASPECT },
  { id: '2', title: 'Project Two', src: photo('1514906689926-25ba6dcb584b'), aspect: PORTRAIT_ASPECT },
  { id: '3', title: 'Project Three', src: photo('1568557412756-7d219873dd11'), aspect: PORTRAIT_ASPECT },
  { id: '4', title: 'Project Four', src: photo('1581892805885-73bdd91beff0'), aspect: PORTRAIT_ASPECT },
  { id: '5', title: 'Project Five', src: photo('1482938289607-e9573fc25ebb'), aspect: PORTRAIT_ASPECT },
  { id: '6', title: 'Project Six', src: photo('1610846202780-b4d9837371ea'), aspect: PORTRAIT_ASPECT },
  { id: '7', title: 'Project Seven', src: photo('1527630941-4a229fd674ab'), aspect: PORTRAIT_ASPECT },
  { id: '8', title: 'Project Eight', src: photo('1603786420263-ad59136a7409'), aspect: PORTRAIT_ASPECT },
];
