/**
 * Orb.tsx — WebGL2 Sphere Impostor with OkLab Colour Marbling
 *
 * Implements the SmoothUI Orb component ported to React Native / expo-gl:
 * - Seamless OkLab color marbling with nested domain warping
 * - Sphere impostor normal derivation per pixel for realistic 3D lighting
 * - Fresnel iridescence, specular highlight, internal scatter, rim, and edge feathering
 * - Full support for the 4 official SmoothUI variants: 'bloom', 'glass', 'ember', 'drop'
 * - Adaptive contrast engine: against light backgrounds, dark depth stops and ambient
 *   occlusion are automatically reinforced so the Orb punches out with rich dimensionality.
 */

import React, { useRef, useEffect, useState, useMemo } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  Animated,
  ActivityIndicator,
  ViewStyle,
  StyleProp,
} from 'react-native';
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import * as Haptics from 'expo-haptics';

export type OrbVariant = 'bloom' | 'glass' | 'ember' | 'drop' | 'adaptive';

export interface OrbProps {
  /** Size in pixels (diameter of the orb stage). Default: 160 */
  size?: number;
  /** Active preset variant. Default: 'adaptive' */
  preset?: OrbVariant;
  /** Custom 2-4 color palette hex strings. If provided, overrides preset colors */
  colors?: string[];
  /** Outer glow halo strength */
  glow?: number;
  /** Silhouette wobble (liquid drop effect) */
  wobble?: number;
  /** Second warp strength (marbling detail) */
  turbulence?: number;
  /** Seconds for one seamless loop */
  duration?: number;
  /** Film grain strength */
  grain?: number;
  /** Specular highlight strength */
  specular?: number;
  /** Glass rim brightness */
  rim?: number;
  /** Internal scatter (subsurface glow) */
  inner?: number;
  /** Fresnel hue rotation sheen */
  iridescence?: number;
  /** Dispersion chromatic aberration */
  aberration?: number;
  /** Whether the orb is paused */
  paused?: boolean;
  /** Active theme palette or accent for dynamic adaptive contrast */
  themeAccent?: string;
  themePalette?: string[];
  /** Whether the surrounding background shader is light (triggers dark depth contrast) */
  isLightBackground?: boolean;
  /** Action triggered when tapping the orb */
  onPress?: () => void;
  /** Action triggered when long pressing the orb */
  onLongPress?: () => void;
  /** Display loading spinner */
  isLoading?: boolean;
  /** Container custom style */
  style?: StyleProp<ViewStyle>;
}

// ─── SmoothUI Official Presets ───────────────────────────────────────────────

export const ORB_PRESETS = {
  bloom: {
    colors: ['#f25aed', '#ffffff'],
    aberration: 0.8,
    blobScale: 3,
    inner: 0.38,
    rim: 1.3,
    contrast: 1.0,
    shading: 0.05,
    wobble: 0.0,
    glow: 0.25,
    duration: 7,
  },
  drop: {
    colors: ['#7c5cff', '#12f7d6'],
    aberration: 0.2,
    blobScale: 2.4,
    glow: 0.55,
    grain: 0.2,
    rim: 1.1,
    turbulence: 0.55,
    wobble: 0.8,
    contrast: 1.1,
    shading: 0.08,
    inner: 0.35,
    duration: 6,
  },
  ember: {
    colors: ['#ff7a1a', '#ffd166'],
    blobScale: 4.2,
    flow: 0.85,
    inner: 0.7,
    rim: 0.6,
    shading: 0.0,
    specular: 0.1,
    turbulence: 0.6,
    glow: 0.45,
    wobble: 0.0,
    duration: 8,
  },
  glass: {
    colors: ['#06121f', '#2f6fed', '#8ad8ff', '#ffffff'],
    blobScale: 1.7,
    contrast: 1.2,
    inner: 0.22,
    iridescence: 0.5,
    rim: 2.0,
    specular: 0.7,
    shading: 0.05,
    glow: 0.3,
    wobble: 0.0,
    duration: 7.5,
  },
} as const;

// ─── Pure Math OkLab Converter (Native-Safe: Zero DOM dependencies) ─────────

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function hexToRgb(hex: string): [number, number, number] {
  let cleaned = hex.replace('#', '').trim();
  if (cleaned.length === 3) {
    cleaned = cleaned.split('').map((c) => c + c).join('');
  }
  const num = parseInt(cleaned, 16) || 0;
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

/** Converts any hex color to Björn Ottosson's OkLab [L, a, b] */
function hexToOklab(hex: string): [number, number, number] {
  const [r255, g255, b255] = hexToRgb(hex);
  const r = srgbToLinear(r255 / 255);
  const g = srgbToLinear(g255 / 255);
  const b = srgbToLinear(b255 / 255);

  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ];
}

// ─── WebGL / OpenGLES Shaders ───────────────────────────────────────────────

const VERTEX_SHADER = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `
precision highp float;

uniform vec2  uRes;
uniform float uPhase;
uniform vec3  uLab[4];
uniform float uCount;
uniform float uScaleN;
uniform float uFlow;
uniform float uTurb;
uniform float uShift;
uniform float uBalance;
uniform float uChroma;
uniform float uContrast;
uniform float uRim;
uniform float uSpec;
uniform float uInner;
uniform float uShading;
uniform float uRefract;
uniform float uIrid;
uniform float uAberr;
uniform float uGrain;
uniform float uSoft;
uniform float uWobble;
uniform float uGlow;
uniform vec3  uLight;

const float TAU = 6.28318530718;
const float RAD = 0.86;
const float RMAX = 1.16279; // 1.0 / RAD

float hash2(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float hash3(vec3 p) {
  p = fract(p * vec3(123.34, 456.21, 789.92));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y * p.z);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), u.x),
             mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int k = 0; k < 3; k++) {
    s += a * vnoise(p);
    p *= 2.03;
    a *= 0.5;
  }
  return s / 0.875;
}

vec2 flowField(vec2 p) {
  float ang = TAU * vnoise(p + vec2(11.3, 11.3)) + uPhase;
  float mag = 0.35 + 0.65 * vnoise(p + vec2(27.9, 27.9));
  return vec2(cos(ang), sin(ang)) * mag;
}

vec3 iridesce(vec3 lab, float f) {
  float a = uIrid * f * -2.2;
  float c = cos(a);
  float s = sin(a);
  return vec3(lab.x, c * lab.y - s * lab.z, s * lab.y + c * lab.z);
}

vec3 labRamp(float x) {
  float xx = clamp(x, 0.0, 1.0) * (uCount - 1.0);
  vec3 c = mix(uLab[0], uLab[1], clamp(xx, 0.0, 1.0));
  c = mix(c, uLab[2], clamp(xx - 1.0, 0.0, 1.0));
  c = mix(c, uLab[3], clamp(xx - 2.0, 0.0, 1.0));
  return c;
}

vec3 paletteLab(float t) {
  float x = pow(clamp(0.5 + 0.5 * cos(TAU * t), 0.0, 1.0), uBalance);
  vec3 lab = labRamp(x);
  float ang = TAU * (t * 2.0 + 0.123);
  lab.yz += 0.17 * uChroma * length(lab.yz) * vec2(sin(ang), cos(ang * 1.37 + 1.1));
  float ch = length(lab.yz);
  if (ch > 0.33) {
    lab.yz *= 0.33 / ch;
  }
  lab.x = clamp(0.5 + (lab.x - 0.5) * uContrast, 0.0, 1.0);
  return lab;
}

vec3 oklabToLinear(vec3 c) {
  float l_ = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
  float m_ = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
  float s_ = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;
  vec3 lms = vec3(l_ * l_ * l_, m_ * m_ * m_, s_ * s_ * s_);
  return mat3( 4.0767416621, -1.2684380046, -0.0041960863,
              -3.3077115913,  2.6097574011, -0.7034186147,
               0.2309699292, -0.3413193965,  1.7076147010) * lms;
}

vec3 linearToSrgb(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  vec3 lo = c * 12.92;
  vec3 hi = 1.055 * pow(max(c, vec3(0.00001)), vec3(1.0 / 2.4)) - 0.055;
  return mix(lo, hi, step(vec3(0.0031308), c));
}

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - uRes) / min(uRes.x, uRes.y);
  uv /= RAD;

  if (uWobble > 0.0) {
    float r0 = length(uv);
    float th = atan(uv.y, uv.x + 1e-6);
    float wob = 0.60 * sin(3.0 * th + uPhase)
              + 0.40 * sin(5.0 * th - 2.0 * uPhase)
              + 0.25 * sin(7.0 * th + 3.0 * uPhase);
    uv *= 1.0 - uWobble * 0.055 * wob * smoothstep(0.0, 0.5, r0);
  }

  float r = length(uv);
  vec2 pd = uv / max(r, 1.0);
  float z = sqrt(max(1.0 - dot(pd, pd), 0.0));
  vec3 n = vec3(pd, z);

  vec2 p0 = (pd - n.xy * uRefract) * uScaleN;
  vec2 p1 = p0 + uFlow * flowField(p0);
  vec2 p2 = p1 + uTurb * flowField(p1 * 1.7 + vec2(5.2, 5.2));
  float t = mix(0.5, fbm(p2 + vec2(3.7, 3.7)), 1.35) + uShift;

  float fres3 = pow(1.0 - n.z, 3.0);
  vec3 lab = iridesce(paletteLab(t), fres3);

  vec3 base;
  if (uAberr > 0.001) {
    float d = uAberr * 0.05 * r * r;
    base = vec3(oklabToLinear(iridesce(paletteLab(t - d), fres3)).r,
                oklabToLinear(lab).g,
                oklabToLinear(iridesce(paletteLab(t + d), fres3)).b);
  } else {
    base = oklabToLinear(lab);
  }
  base = max(base, vec3(0.0));

  vec3 L = normalize(uLight);
  float diff = clamp(dot(n, L), 0.0, 1.0);
  vec3 col = mix(base, base * (0.18 + 0.82 * diff), uShading);

  vec2 op = pd + L.xy * 0.45;
  col += uInner * exp(-dot(op, op) * 2.2) * base;

  vec3 half_ = normalize(L + vec3(0.0, 0.0, 1.0));
  col += pow(1.0 - n.z, 8.0) * uRim
       + pow(max(dot(n, half_), 0.0), 24.3) * uSpec;

  vec3 lit = linearToSrgb(col);
  vec3 flat_ = linearToSrgb(base);

  float w = max(uSoft, 2.0 / min(uRes.x, uRes.y));
  float body = 1.0 - smoothstep(1.0 - w, 1.0, r);

  float glowF = uGlow * exp(-max(r - 1.0, 0.0) * 20.0);
  glowF *= 1.0 - smoothstep(0.45, 1.0, (r - 1.0) / (RMAX - 1.0));
  float alpha = clamp(body + glowF * (1.0 - body), 0.0, 1.0);

  vec3 outCol = mix(flat_, lit, body);

  float frame = floor(uPhase / TAU * 24.0);
  float grainVal = hash3(vec3(gl_FragCoord.xy, frame));
  outCol += (grainVal - 0.5) * (uGrain * 0.1 + 1.0 / 255.0);

  outCol = clamp(outCol, 0.0, 1.0);
  gl_FragColor = vec4(outCol * alpha, alpha);
}
`;

// ─── Component Implementation ───────────────────────────────────────────────

export const Orb: React.FC<OrbProps> = ({
  size = 160,
  preset = 'adaptive',
  colors: customColors,
  glow: customGlow,
  wobble: customWobble,
  turbulence: customTurbulence,
  duration: customDuration,
  grain: customGrain,
  specular: customSpecular,
  rim: customRim,
  inner: customInner,
  iridescence: customIridescence,
  aberration: customAberration,
  paused = false,
  themeAccent = '#FF9F0A',
  themePalette,
  isLightBackground = false,
  onPress,
  onLongPress,
  isLoading = false,
  style,
}) => {
  // Press spring physics animation
  const scaleAnim = useRef(new Animated.Value(1)).current;

  // Active palette determination:
  // When isLightBackground is true, inject deep contrasting shadow stops so the
  // sphere has dramatic pop-out depth and 3D normal shading against the light wash.
  const activeColors = useMemo(() => {
    if (customColors && customColors.length >= 2) {
      return customColors.slice(0, 4);
    }

    if (preset === 'adaptive') {
      if (isLightBackground) {
        // Deep obsidian navy -> ocean blue -> deep oceanic -> theme accent
        return ['#060d1a', '#14223d', '#284b7a', themeAccent];
      }
      if (themePalette && themePalette.length >= 2) {
        return themePalette.slice(0, 4);
      }
      return ['#06121f', '#2563eb', themeAccent, '#ffffff'];
    }

    const presetConfig = ORB_PRESETS[preset] || ORB_PRESETS.glass;
    if (isLightBackground) {
      if (preset === 'bloom') {
        return ['#180020', '#c026d3', '#f472b6', '#ffffff'];
      }
      if (preset === 'drop') {
        return ['#0f0529', '#6366f1', '#14b8a6', '#5eead4'];
      }
      if (preset === 'ember') {
        return ['#240a00', '#ea580c', '#f59e0b', '#fef08a'];
      }
      if (preset === 'glass') {
        return ['#040a14', '#1e3a8a', '#3b82f6', '#93c5fd'];
      }
    }
    return [...presetConfig.colors];
  }, [preset, customColors, isLightBackground, themeAccent, themePalette]);

  // Merge tuning properties from preset and props
  const presetConfig = preset !== 'adaptive' && ORB_PRESETS[preset] ? ORB_PRESETS[preset] : {};
  const activeAberration = customAberration ?? (presetConfig as any).aberration ?? 0.6;
  const activeBlobScale = (presetConfig as any).blobScale ?? 2.8;
  const activeFlow = (presetConfig as any).flow ?? 0.65;
  const activeGlow = customGlow ?? (presetConfig as any).glow ?? (isLightBackground ? 0.2 : 0.45);
  const activeGrain = customGrain ?? (presetConfig as any).grain ?? 0.5;
  const activeInner = customInner ?? (presetConfig as any).inner ?? (isLightBackground ? 0.2 : 0.45);
  const activeIridescence = customIridescence ?? (presetConfig as any).iridescence ?? 0.35;
  const activeRim = customRim ?? (presetConfig as any).rim ?? (isLightBackground ? 1.7 : 1.3);
  const activeShading = isLightBackground ? 0.38 : (presetConfig as any).shading ?? 0.08;
  const activeSpecular = customSpecular ?? (presetConfig as any).specular ?? 0.45;
  const activeTurbulence = customTurbulence ?? (presetConfig as any).turbulence ?? 0.45;
  const activeWobble = customWobble ?? (presetConfig as any).wobble ?? 0.0;
  const activeContrast = isLightBackground ? 1.35 : (presetConfig as any).contrast ?? 1.05;
  const loopDuration = customDuration ?? (presetConfig as any).duration ?? 7.0;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.93,
      useNativeDriver: true,
      speed: 30,
      bounciness: 4,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1.0,
      useNativeDriver: true,
      speed: 24,
      bounciness: 8,
    }).start();
  };

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    if (onPress) {
      onPress();
    }
  };

  const handleLongPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    if (onLongPress) {
      onLongPress();
    }
  };

  // Mutable config ref for WebGL uniform updates
  const configRef = useRef({
    colors: activeColors,
    blobScale: activeBlobScale,
    flow: activeFlow,
    turb: activeTurbulence,
    rim: activeRim,
    spec: activeSpecular,
    inner: activeInner,
    shading: activeShading,
    irid: activeIridescence,
    aberr: activeAberration,
    grain: activeGrain,
    wobble: activeWobble,
    glow: activeGlow,
    contrast: activeContrast,
    duration: loopDuration,
    paused,
  });

  useEffect(() => {
    configRef.current = {
      colors: activeColors,
      blobScale: activeBlobScale,
      flow: activeFlow,
      turb: activeTurbulence,
      rim: activeRim,
      spec: activeSpecular,
      inner: activeInner,
      shading: activeShading,
      irid: activeIridescence,
      aberr: activeAberration,
      grain: activeGrain,
      wobble: activeWobble,
      glow: activeGlow,
      contrast: activeContrast,
      duration: loopDuration,
      paused,
    };
  }, [
    activeColors,
    activeBlobScale,
    activeFlow,
    activeTurbulence,
    activeRim,
    activeSpecular,
    activeInner,
    activeShading,
    activeIridescence,
    activeAberration,
    activeGrain,
    activeWobble,
    activeGlow,
    activeContrast,
    loopDuration,
    paused,
  ]);

  const onContextCreate = (gl: ExpoWebGLRenderingContext) => {
    let program: WebGLProgram | null = null;
    let vs: WebGLShader | null = null;
    let fs: WebGLShader | null = null;
    let quadBuffer: WebGLBuffer | null = null;
    let animId: number | null = null;
    let isAlive = true;

    const compile = (type: number, src: string): WebGLShader | null => {
      const s = gl.createShader(type);
      if (!s) return null;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.warn('Orb shader compile error:', gl.getShaderInfoLog(s));
        gl.deleteShader(s);
        return null;
      }
      return s;
    };

    vs = compile(gl.VERTEX_SHADER, VERTEX_SHADER);
    fs = compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    if (!vs || !fs) return;

    program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn('Orb program link error:', gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      return;
    }

    gl.useProgram(program);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);

    // Full-screen screen quad buffer
    quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    const vertices = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    const posLoc = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const at = (name: string) => gl.getUniformLocation(program!, name);
    const u = {
      res: at('uRes'),
      phase: at('uPhase'),
      lab: at('uLab'),
      count: at('uCount'),
      scaleN: at('uScaleN'),
      flow: at('uFlow'),
      turb: at('uTurb'),
      shift: at('uShift'),
      balance: at('uBalance'),
      chroma: at('uChroma'),
      contrast: at('uContrast'),
      rim: at('uRim'),
      spec: at('uSpec'),
      inner: at('uInner'),
      shading: at('uShading'),
      refract: at('uRefract'),
      irid: at('uIrid'),
      aberr: at('uAberr'),
      grain: at('uGrain'),
      soft: at('uSoft'),
      wobble: at('uWobble'),
      glow: at('uGlow'),
      light: at('uLight'),
    };

    const width = gl.drawingBufferWidth || size * 2;
    const height = gl.drawingBufferHeight || size * 2;
    gl.viewport(0, 0, width, height);
    if (u.res) gl.uniform2f(u.res, width, height);

    let phase = 0.0;
    let lastTime = 0;
    const TAU = Math.PI * 2;

    const render = (time: number) => {
      if (!isAlive) return;

      const dt = lastTime ? Math.min((time - lastTime) / 1000, 0.1) : 0.016;
      lastTime = time;

      const c = configRef.current;
      if (!c.paused) {
        phase = (phase + dt / Math.max(c.duration, 0.1)) % 1.0;
      }

      gl.useProgram(program!);

      // Push OkLab stops
      const stops = c.colors.slice(0, 4);
      const labData = new Float32Array(12);
      for (let i = 0; i < 4; i++) {
        const hex = stops[Math.min(i, stops.length - 1)];
        const [l, a, b] = hexToOklab(hex);
        labData[i * 3 + 0] = l;
        labData[i * 3 + 1] = a;
        labData[i * 3 + 2] = b;
      }

      if (u.lab) gl.uniform3fv(u.lab, labData);
      if (u.count) gl.uniform1f(u.count, Math.max(2, Math.min(stops.length, 4)));
      if (u.phase) gl.uniform1f(u.phase, phase * TAU);
      if (u.scaleN) gl.uniform1f(u.scaleN, 1.45 / Math.max(c.blobScale, 0.05));
      if (u.flow) gl.uniform1f(u.flow, c.flow);
      if (u.turb) gl.uniform1f(u.turb, c.turb);
      if (u.shift) gl.uniform1f(u.shift, 0.23);
      if (u.balance) gl.uniform1f(u.balance, 1.0);
      if (u.chroma) gl.uniform1f(u.chroma, 1.0);
      if (u.contrast) gl.uniform1f(u.contrast, c.contrast);
      if (u.rim) gl.uniform1f(u.rim, c.rim);
      if (u.spec) gl.uniform1f(u.spec, c.spec);
      if (u.inner) gl.uniform1f(u.inner, c.inner);
      if (u.shading) gl.uniform1f(u.shading, c.shading);
      if (u.refract) gl.uniform1f(u.refract, 0.25);
      if (u.irid) gl.uniform1f(u.irid, c.irid);
      if (u.aberr) gl.uniform1f(u.aberr, c.aberr);
      if (u.grain) gl.uniform1f(u.grain, c.grain);
      if (u.soft) gl.uniform1f(u.soft, 0.005);
      if (u.wobble) gl.uniform1f(u.wobble, c.wobble);
      if (u.glow) gl.uniform1f(u.glow, c.glow);
      if (u.light) gl.uniform3f(u.light, -0.6, -1.0, 0.65);

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      if (typeof (gl as any).endFrameEXP === 'function') {
        (gl as any).endFrameEXP();
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      isAlive = false;
      if (animId) cancelAnimationFrame(animId);
      if (quadBuffer) gl.deleteBuffer(quadBuffer);
      if (program) gl.deleteProgram(program);
      if (vs) gl.deleteShader(vs);
      if (fs) gl.deleteShader(fs);
    };
  };

  return (
    <Animated.View
      style={[
        styles.root,
        {
          width: size,
          height: size,
          transform: [{ scale: scaleAnim }],
        },
        style,
      ]}
    >
      {/* ─── Clean Interactive WebGL Orb (Pure organic sphere) ─── */}
      <Pressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={handlePress}
        onLongPress={handleLongPress}
        style={[styles.orbButton, { width: size, height: size }]}
        android_ripple={{ color: 'rgba(255, 255, 255, 0.12)', borderless: true }}
      >
        <GLView
          style={[styles.glCanvas, { width: size, height: size }]}
          onContextCreate={onContextCreate}
        />

        {/* ─── Subtle Loading Indicator (Only during active extraction) ─── */}
        {isLoading && (
          <View style={styles.centerOverlay} pointerEvents="none">
            <ActivityIndicator size="small" color="#FFFFFF" />
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
};

export default Orb;

const styles = StyleSheet.create({
  root: {
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  orbButton: {
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 999,
    overflow: 'hidden',
  },
  glCanvas: {
    backgroundColor: 'transparent',
  },
  centerOverlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
});
