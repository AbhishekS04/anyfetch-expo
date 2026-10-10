import { ThemeShader, ThemeTones } from './shaderManager';

export interface FeralStop {
  name?: string;
  hex: string;
  rgb?: [number, number, number];
  position?: number;
}

export interface FeralShaderExport {
  name: string;
  type?: 'sky' | 'stripes' | 'aurora' | 'procedural' | string;
  speed?: number;
  noise?: number;
  soften?: number;
  dividers?: number[];
  stops: FeralStop[];
}

function hexToNormalizedRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;
  return [isNaN(r) ? 0.5 : r, isNaN(g) ? 0.5 : g, isNaN(b) ? 0.5 : b];
}

/**
 * Parses raw JSON exported from FeralUI into a fully validated ThemeShader.
 */
export function parseFeralShaderJson(data: FeralShaderExport): ThemeShader {
  const id = data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const stops = data.stops || [];

  const palette = stops.map((s) => s.hex);
  const accentColor = stops[1]?.hex || stops[0]?.hex || '#38BDF8';

  // Map 4 stops into high, main, mid, low tones
  const highRgb = stops[0]?.rgb
    ? [stops[0].rgb[0] / 255, stops[0].rgb[1] / 255, stops[0].rgb[2] / 255] as [number, number, number]
    : hexToNormalizedRgb(stops[0]?.hex || '#FFFFFF');

  const mainRgb = stops[1]?.rgb
    ? [stops[1].rgb[0] / 255, stops[1].rgb[1] / 255, stops[1].rgb[2] / 255] as [number, number, number]
    : hexToNormalizedRgb(stops[1]?.hex || '#80B3FF');

  const midRgb = stops[2]?.rgb
    ? [stops[2].rgb[0] / 255, stops[2].rgb[1] / 255, stops[2].rgb[2] / 255] as [number, number, number]
    : hexToNormalizedRgb(stops[2]?.hex || '#4080FF');

  const lowRgb = stops[3]?.rgb
    ? [stops[3].rgb[0] / 255, stops[3].rgb[1] / 255, stops[3].rgb[2] / 255] as [number, number, number]
    : hexToNormalizedRgb(stops[3]?.hex || '#102040');

  const tones: ThemeTones = {
    high: highRgb,
    main: mainRgb,
    mid: midRgb,
    low: lowRgb,
  };

  const speed = data.speed ?? 22;
  const scale = 40 + ((data.noise ?? 10) * 0.5);
  const distortion = 45;
  const swirl = 38;

  return {
    id,
    label: data.name,
    time: `Atmospheric ${data.name}`,
    accentColor,
    palette,
    tones,
    speed,
    scale,
    distortion,
    swirl,
    type: (data.type === 'stripes' || data.type === 'aurora' ? data.type : 'sky') as any,
    description: `FeralUI atmospheric shader: ${data.name}.`,
  };
}
