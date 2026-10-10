import * as THREE from 'three';
import { gsap } from 'gsap';
import type { ExpoWebGLRenderingContext } from 'expo-gl';
import type {
  LiquidGlassCarouselItem,
  LiquidGlassCarouselHandle,
  PanelRect,
} from './types';
import {
  LENS,
  FOCUS,
  ENTRY,
  LENS_FX_KEYS,
  REPEATS,
  TOUCH_CLICK_SLOP,
  FLICK_IDLE_MS,
  PORTRAIT_ASPECT,
} from './constants';
import {
  createPlaceholderTexture,
  createGLTextureFromLocalUri,
  resolveImageUri,
  measureImageAspect,
  disposeGLTexture,
} from './textureLoader';

export function patchWebGLRenderingContext() {
  const g = (typeof globalThis !== 'undefined' ? globalThis : {}) as any;
  if (g.WebGLRenderingContext) {
    try {
      Object.defineProperty(g.WebGLRenderingContext, Symbol.hasInstance, {
        value: () => false,
        configurable: true,
        writable: true,
      });
    } catch {
      try {
        g.WebGLRenderingContext[Symbol.hasInstance] = () => false;
      } catch {}
    }
  }
}
patchWebGLRenderingContext();

function hexToNumber(background: string): number {
  const value = background.trim();
  if (value.startsWith('#') && (value.length === 7 || value.length === 4)) {
    const hex =
      value.length === 4
        ? `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`
        : value;
    const parsed = Number.parseInt(hex.slice(1), 16);
    return Number.isFinite(parsed) ? parsed : 0x09090b;
  }
  return 0x09090b;
}

type Source = {
  tex: THREE.Texture | null;
  aspect: number;
  locked: boolean;
};

type PoolItem = {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  srcIndex: number;
  bound: boolean;
};

export interface EngineOptions {
  items: LiquidGlassCarouselItem[];
  panelHeight: number;
  gap: number;
  background: string;
  entry: boolean;
  onActiveChange: (index: number) => void;
  onFocusChange: (open: boolean) => void;
  onEntryDone: (done: boolean) => void;
  onItemPress?: (item: LiquidGlassCarouselItem, index: number) => void;
}

export function createCarouselEngine(
  gl: ExpoWebGLRenderingContext,
  initialWidth: number,
  initialHeight: number,
  pixelRatio: number,
  options: EngineOptions
): LiquidGlassCarouselHandle & {
  handleTouchDown: (x: number, y: number) => void;
  handleTouchMove: (x: number, y: number) => void;
  handleTouchUp: (x: number, y: number) => void;
  resize: (w: number, h: number) => void;
} {
  patchWebGLRenderingContext();

  const entryOn = options.entry;
  const items = options.items;

  let W = Math.max(1, initialWidth);
  let H = Math.max(1, initialHeight);
  const dpr = Math.min(pixelRatio || 1, 2);

  const panelHFor = () =>
    Math.max(160, Math.min(options.panelHeight, Math.round(H * 0.58)));
  let PANEL_H = panelHFor();
  const GAP = options.gap;
  const EASE = 0.12;
  const SNAP_EASE = 0.08;
  const TOUCH_DRAG = 1.35;
  const TOUCH_EASE = 0.22;
  const FRICTION = 0.865;
  const SNAP_IDLE_MS = 140;
  const SHRINK_MAX = 60;
  const SHRINK_ATTACK = 0.25;
  const SHRINK_DECAY = 0.06;

  // Ensure getContextAttributes exists on gl
  if (typeof (gl as any).getContextAttributes !== 'function') {
    (gl as any).getContextAttributes = () => ({
      alpha: true,
      depth: true,
      stencil: true,
      antialias: false,
      premultipliedAlpha: false,
    });
  }

  const canvas = {
    width: gl.drawingBufferWidth || W,
    height: gl.drawingBufferHeight || H,
    style: {},
    addEventListener: () => {},
    removeEventListener: () => {},
  } as any;

  // 1. WebGL Renderer with Expo Context
  // In Expo GL, WebGL2RenderingContext inherits from WebGLRenderingContext.
  // Three.js r163+ throws if context instanceof WebGLRenderingContext is true.
  // We temporarily hide WebGLRenderingContext so Three.js bypasses this guard check.
  const g = (typeof globalThis !== 'undefined' ? globalThis : {}) as any;
  const originalWGL1 = g.WebGLRenderingContext;

  let renderer: THREE.WebGLRenderer;
  try {
    g.WebGLRenderingContext = undefined;
    renderer = new THREE.WebGLRenderer({
      canvas,
      context: gl as any,
      antialias: true,
      alpha: false,
    });
  } finally {
    g.WebGLRenderingContext = originalWGL1;
  }

  renderer.setSize(W, H);
  renderer.setPixelRatio(dpr);
  renderer.setClearColor(hexToNumber(options.background), 1);

  // 2. Main Scene & Orthographic Camera
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(
    -W / 2,
    W / 2,
    H / 2,
    -H / 2,
    -100,
    100
  );
  camera.position.z = 10;

  // Placeholder textures
  const fallbackTexture = createPlaceholderTexture(gl, renderer, 22, 24, 30);

  // Sources tracking
  const sources: Source[] = items.map((img) => ({
    tex: null,
    aspect: img.aspect || PORTRAIT_ASPECT,
    locked: img.aspect != null,
  }));

  // Asynchronously resolve & load textures for each item
  items.forEach(async (item, idx) => {
    const s = sources[idx];
    if (!s) return;

    if (!s.locked) {
      measureImageAspect(item.src).then((asp) => {
        s.aspect = asp;
        recomputeTotal();
      });
    }

    try {
      const local = await resolveImageUri(item.src);
      const tex = createGLTextureFromLocalUri(gl, renderer, local);
      if (tex) {
        s.tex = tex;
        // Bind to pool items for this source
        pool.forEach((p) => {
          if (p.srcIndex === idx) {
            p.mat.map = tex;
            p.mat.color.set(0xffffff);
            p.mat.needsUpdate = true;
            p.bound = true;
          }
        });
      }
    } catch (err) {
      console.warn(`[LiquidGlass] Image ${idx} load error:`, err);
    }
  });

  function slotWidth(srcIndex: number) {
    const s = sources[srcIndex];
    const asp = s ? s.aspect : PORTRAIT_ASPECT;
    return asp * PANEL_H + GAP;
  }

  let userInteracted = false;
  let offsets: number[] = [];
  let totalWidth = 0;
  function recomputeTotal() {
    offsets = [];
    let acc = 0;
    for (let i = 0; i < sources.length; i++) {
      offsets.push(acc);
      acc += slotWidth(i);
    }
    totalWidth = acc;
    if (!userInteracted) {
      scroll = centerForIndex(0);
      target = scroll;
    }
  }
  recomputeTotal();

  function centerForIndex(idx: number) {
    const N = Math.max(1, sources.length);
    const loop = Math.floor(idx / N);
    const s = ((idx % N) + N) % N;
    const off = offsets[s] ?? 0;
    return off + slotWidth(s) / 2 - GAP / 2 + loop * totalWidth;
  }

  function nearestIndex(value: number) {
    if (!totalWidth) return 0;
    const N = sources.length;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < N; i++) {
      const off = offsets[i] ?? 0;
      const center = off + slotWidth(i) / 2 - GAP / 2;
      const k = Math.round((value - center) / totalWidth);
      const dist = Math.abs(center + k * totalWidth - value);
      if (dist < bestDist) {
        bestDist = dist;
        best = i + k * N;
      }
    }
    return best;
  }

  function centerIndex(value: number) {
    if (!totalWidth) return 0;
    let bestI = 0;
    let bestDist = Infinity;
    for (let i = 0; i < sources.length; i++) {
      const off = offsets[i] ?? 0;
      const center = off + slotWidth(i) / 2 - GAP / 2;
      const k = Math.round((value - center) / totalWidth);
      const dist = Math.abs(center + k * totalWidth - value);
      if (dist < bestDist) {
        bestDist = dist;
        bestI = i;
      }
    }
    return bestI;
  }

  let lastCenter = -1;
  const pool: PoolItem[] = [];
  const cardGeometry = new THREE.PlaneGeometry(1, 1, 1, 1);
  // Flip texture V coordinate so native image textures are rendered right-side up
  const uvAttr = cardGeometry.attributes.uv;
  for (let i = 0; i < uvAttr.count; i++) {
    uvAttr.setY(i, 1 - uvAttr.getY(i));
  }
  uvAttr.needsUpdate = true;

  for (let r = 0; r < REPEATS; r++) {
    for (let i = 0; i < sources.length; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        map: fallbackTexture,
        transparent: true,
      });
      const mesh = new THREE.Mesh(cardGeometry, mat);
      mesh.visible = false;
      scene.add(mesh);
      pool.push({ mesh, mat, srcIndex: i, bound: false });
    }
  }

  let scroll = centerForIndex(0);
  let target = scroll;
  let velocity = 0;
  let prevScroll = 0;
  let scrollEnergy = 0;
  let pendingFocus: { srcIndex: number } | null = null;
  let lastInput = performance.now();
  let snapped = false;

  // 3. Render Target & Dual-Pass Lens Scene
  const rt = new THREE.WebGLRenderTarget(
    Math.round(W * dpr),
    Math.round(H * dpr),
    {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
    }
  );

  const lensScene = new THREE.Scene();
  const lensCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  // Exact shader uniforms
  const lensUniforms = {
    uTex: { value: rt.texture },
    uRes: { value: new THREE.Vector2(W * dpr, H * dpr) },
    uCenter: { value: new THREE.Vector2(0.5, 0.5) },
    uSizeX: { value: LENS.sizeX },
    uSizeY: { value: LENS.sizeY },
    uShape: { value: 0 },
    uSquareRound: { value: 0 },
    uRotation: { value: 0 },
    uAspect: { value: W / H },
    uZoom: { value: LENS.zoom },
    uDispersion: { value: LENS.dispersion },
    uBlur: { value: LENS.blur },
    uGlow: { value: LENS.glow },
    uWhiteGlow: { value: LENS.whiteGlow },
    uNovaSize: { value: LENS.novaSize },
    uBlueRing: { value: LENS.blueRing },
    uRingRadius: { value: LENS.ringRadius },
    uRingWidth: { value: LENS.ringWidth },
    uShimmer: { value: LENS.shimmer ? 1 : 0 },
    uShimmerFreq: { value: LENS.shimmerFreq },
    uShimmerSpeed: { value: LENS.shimmerSpeed },
    uShimmerDepth: { value: LENS.shimmerDepth },
    uTime: { value: 0 },
    uRimStart: { value: LENS.rimStart },
    uRimTangential: { value: LENS.rimTangential },
    uRimInward: { value: LENS.rimInward },
    uRimFreq1: { value: LENS.rimFreq1 },
    uRimFreq2: { value: LENS.rimFreq2 },
    uBlueColor: { value: new THREE.Color(LENS.blueColor) },
    uRimLine: { value: LENS.rimLine },
    uRimLinePos: { value: LENS.rimLinePos },
    uRimLineWidth: { value: LENS.rimLineWidth },
    uVignette: { value: LENS.vignette },
    uVignetteSize: { value: LENS.vignetteSize },
    uSamples: { value: LENS.samples },
  };

  const { LENS_VERTEX, LENS_FRAGMENT } = require('./shaders');
  const lensMat = new THREE.ShaderMaterial({
    uniforms: lensUniforms as any,
    vertexShader: LENS_VERTEX,
    fragmentShader: LENS_FRAGMENT,
    depthTest: false,
    depthWrite: false,
  });

  const lensQuadGeo = new THREE.PlaneGeometry(2, 2);
  const lensQuad = new THREE.Mesh(lensQuadGeo, lensMat);
  lensScene.add(lensQuad);

  const focusState = {
    active: false,
    srcIndex: -1,
    poolIdx: -1,
    lensFx: entryOn ? 0 : 1,
    anim: null as gsap.core.Timeline | null,
  };

  const totalPoolSize = REPEATS * sources.length;
  const drop = new Array(totalPoolSize).fill(0);
  let focusScale = 1;
  const lastCenterX: Array<number | undefined> = new Array(totalPoolSize);
  const pEntry = new Array(totalPoolSize).fill(entryOn ? 0 : 1);
  let entryActive = entryOn;
  let entrySettled = false;
  const growArr = new Array(totalPoolSize).fill(entryOn ? 0 : 1);
  let entryAnim: gsap.core.Timeline | null = null;

  const lensFxFull: Record<(typeof LENS_FX_KEYS)[number], number> = {
    uDispersion: lensUniforms.uDispersion.value,
    uBlueRing: lensUniforms.uBlueRing.value,
    uRimLine: lensUniforms.uRimLine.value,
    uVignette: lensUniforms.uVignette.value,
    uZoom: lensUniforms.uZoom.value,
    uRimTangential: lensUniforms.uRimTangential.value,
    uRimInward: lensUniforms.uRimInward.value,
  };

  let panelRects: PanelRect[] = [];
  let centeredPanel: {
    srcIndex: number;
    centerX: number;
    wPx: number;
    h: number;
    poolIdx: number;
  } | null = null;

  function layout() {
    panelRects = [];
    centeredPanel = null;
    let centeredDist = Infinity;
    const half = W / 2;
    const buffer = PANEL_H;

    pool.forEach((p, poolIdx) => {
      const rep = Math.floor(poolIdx / sources.length);
      const i = p.srcIndex;
      const src = sources[i] ?? { aspect: PORTRAIT_ASPECT, tex: null };
      const slotCenterInLoop = (offsets[i] ?? 0) + slotWidth(i) / 2 - GAP / 2;
      let x = slotCenterInLoop - scroll;
      x = ((x % totalWidth) + totalWidth) % totalWidth;
      x += (rep - Math.floor(REPEATS / 2)) * totalWidth;
      if (x > half + totalWidth) x -= totalWidth * REPEATS;

      const centerX = x;
      const inEntry = entryActive || entrySettled;
      if (!inEntry && (centerX < -half - buffer || centerX > half + buffer)) {
        p.mesh.visible = false;
        lastCenterX[poolIdx] = undefined;
        return;
      }
      lastCenterX[poolIdx] = centerX;

      const shrink = 1 - 0.25 * scrollEnergy;
      const h = PANEL_H * shrink;
      const wPx = src.aspect * PANEL_H * shrink;

      let y = 0;
      const isFocused = focusState.active && focusState.poolIdx === poolIdx;
      const d = drop[poolIdx] || 0;
      let drawW = wPx;
      let drawH = h;
      if (isFocused) {
        drawW = wPx * focusScale;
        drawH = h * focusScale;
      } else if (d > 0) {
        y = -d * H * FOCUS.dropDist;
      }

      p.mesh.visible = true;
      let finalX = centerX;
      let finalY = y;
      let finalW = drawW;
      let finalH = drawH;

      if (entryActive || entrySettled) {
        const pe = pEntry[poolIdx] || 0;
        const g = growArr[poolIdx] || 0;
        const curH = ENTRY.startH + (drawH - ENTRY.startH) * g;
        finalH = curH;
        finalW = curH * src.aspect;

        const cSrc = centerIndex(scroll);
        let di = i - cSrc;
        if (di > sources.length / 2) di -= sources.length;
        if (di < -sources.length / 2) di += sources.length;
        const N = sources.length;
        const midRep = Math.floor(REPEATS / 2);
        if (rep !== midRep) {
          p.mesh.visible = false;
          lastCenterX[poolIdx] = undefined;
          return;
        }
        const slotH = (s: number) => {
          const gg = growArr[midRep * N + s] || 0;
          return ENTRY.startH + (PANEL_H - ENTRY.startH) * gg;
        };
        let off = 0;
        if (di > 0) {
          for (let k = 0; k < di; k++) {
            const sa = (((cSrc + k) % N) + N) % N;
            const sb = (((cSrc + k + 1) % N) + N) % N;
            const saAsp = sources[sa]?.aspect ?? PORTRAIT_ASPECT;
            const sbAsp = sources[sb]?.aspect ?? PORTRAIT_ASPECT;
            off += (saAsp * slotH(sa) + sbAsp * slotH(sb)) / 2 + GAP;
          }
        } else if (di < 0) {
          for (let k = 0; k < -di; k++) {
            const sa = (((cSrc - k) % N) + N) % N;
            const sb = (((cSrc - k - 1) % N) + N) % N;
            const saAsp = sources[sa]?.aspect ?? PORTRAIT_ASPECT;
            const sbAsp = sources[sb]?.aspect ?? PORTRAIT_ASPECT;
            off -= (saAsp * slotH(sa) + sbAsp * slotH(sb)) / 2 + GAP;
          }
        }
        finalX = off;
        if (finalX < -half - buffer || finalX > half + buffer) {
          p.mesh.visible = false;
          lastCenterX[poolIdx] = undefined;
          return;
        }
        const below = -H * ENTRY.fromBelow;
        finalY = below + (y - below) * pe;
      }

      p.mesh.position.set(finalX, finalY, 0);
      p.mesh.scale.set(finalW, finalH, 1);

      const sx = centerX + W / 2;
      const sy = H / 2 - y;
      panelRects.push({
        left: sx - drawW / 2,
        right: sx + drawW / 2,
        top: sy - drawH / 2,
        bottom: sy + drawH / 2,
        poolIdx,
        srcIndex: i,
        centerX,
      });

      if (Math.abs(centerX) < centeredDist) {
        centeredDist = Math.abs(centerX);
        centeredPanel = { srcIndex: i, centerX, wPx, h, poolIdx };
      }
    });
  }

  function panelAtPointer(px: number, py: number): PanelRect | null {
    for (const r of panelRects) {
      if (px >= r.left && px <= r.right && py >= r.top && py <= r.bottom) {
        return r;
      }
    }
    return null;
  }

  function openFocus() {
    if (focusState.active || !centeredPanel) return;

    focusState.active = true;
    focusState.srcIndex = centeredPanel.srcIndex;
    const focusPoolIdx = centeredPanel.poolIdx;
    focusState.poolIdx = focusPoolIdx;
    target = centerForIndex(nearestIndex(scroll));

    const focusX = lastCenterX[focusPoolIdx] || 0;
    const others = pool
      .map((_, idx) => ({ idx, x: lastCenterX[idx] }))
      .filter((o) => o.idx !== focusPoolIdx && o.x !== undefined)
      .map((o) => ({ idx: o.idx, dist: Math.abs((o.x ?? 0) - focusX) }))
      .sort((a, b) => a.dist - b.dist);

    let rank = 0;
    let prevDist = -1;
    const ranked = others.map((o) => {
      if (prevDist >= 0 && o.dist - prevDist > 1) rank += 1;
      prevDist = o.dist;
      return { idx: o.idx, rank };
    });

    for (const key of LENS_FX_KEYS) {
      lensFxFull[key] = lensUniforms[key].value;
    }

    if (focusState.anim) focusState.anim.kill();
    const scaleProxy = { v: focusScale };
    const tl = gsap.timeline();
    tl.to(focusState, { lensFx: 0, duration: FOCUS.lensFade, ease: 'power3.out' }, 0);
    tl.to(
      scaleProxy,
      {
        v: FOCUS.centerScale,
        duration: FOCUS.focusDuration,
        ease: FOCUS.focusEase,
        onUpdate() {
          focusScale = scaleProxy.v;
        },
      },
      0
    );
    ranked.forEach((o) => {
      tl.to(
        drop,
        { [o.idx]: 1, duration: FOCUS.cardDuration, ease: FOCUS.cardEase },
        o.rank * FOCUS.stagger
      );
    });
    focusState.anim = tl;
    options.onFocusChange(true);
  }

  function closeFocus() {
    if (!focusState.active) return;
    if (focusState.anim) focusState.anim.kill();

    const focusX = lastCenterX[focusState.poolIdx] || 0;
    const others = pool
      .map((_, idx) => ({ idx, x: lastCenterX[idx] }))
      .filter((o) => o.x !== undefined && (drop[o.idx] || 0) > 0)
      .map((o) => ({ idx: o.idx, dist: Math.abs((o.x ?? 0) - focusX) }))
      .sort((a, b) => b.dist - a.dist);

    let rank = 0;
    let prevDist = -1;
    const ranked = others.map((o) => {
      if (prevDist >= 0 && prevDist - o.dist > 1) rank += 1;
      prevDist = o.dist;
      return { idx: o.idx, rank };
    });

    options.onFocusChange(false);
    const scaleProxy = { v: focusScale };
    const tl = gsap.timeline({
      onComplete: () => {
        focusState.active = false;
        focusState.srcIndex = -1;
      },
    });
    tl.to(
      focusState,
      { lensFx: 1, duration: FOCUS.lensFade * 0.8, ease: 'power3.inOut' },
      0
    );
    tl.to(
      scaleProxy,
      {
        v: 1,
        duration: FOCUS.focusDuration * 0.85,
        ease: FOCUS.focusEase,
        onUpdate() {
          focusScale = scaleProxy.v;
        },
      },
      0
    );
    ranked.forEach((o) => {
      tl.to(
        drop,
        {
          [o.idx]: 0,
          duration: FOCUS.cardDuration * 0.85,
          ease: FOCUS.cardEase,
        },
        o.rank * FOCUS.stagger * 0.7
      );
    });
    focusState.anim = tl;
  }

  function playEntry() {
    if (!entryOn) {
      options.onEntryDone(true);
      return;
    }
    if (entryAnim) entryAnim.kill();
    for (let k = 0; k < pEntry.length; k++) pEntry[k] = 0;
    entryActive = true;
    entrySettled = false;
    options.onEntryDone(false);
    for (let k = 0; k < growArr.length; k++) growArr[k] = 0;
    focusState.lensFx = 0;
    target = centerForIndex(nearestIndex(scroll));
    scroll = target;
    velocity = 0;
    snapped = true;
    layout();

    const visible: number[] = [];
    for (let k = 0; k < lastCenterX.length; k++) {
      if (lastCenterX[k] !== undefined) visible.push(k);
    }
    const tl = gsap.timeline({ delay: ENTRY.delay });
    const spread = ENTRY.stagger * Math.max(visible.length - 1, 1);
    let lastRiseEnd = 0;
    visible.forEach((idx) => {
      const atTime = Math.random() * spread;
      lastRiseEnd = Math.max(lastRiseEnd, atTime + ENTRY.riseDuration);
      tl.to(
        pEntry,
        { [idx]: 1, duration: ENTRY.riseDuration, ease: ENTRY.riseEase },
        atTime
      );
    });
    tl.call(
      () => {
        entryActive = false;
        entrySettled = true;
      },
      [],
      lastRiseEnd
    );

    const cSrcG = centerIndex(scroll);
    const Ng = sources.length;
    const midRepG = Math.floor(REPEATS / 2);
    const growList: { idx: number; rank: number }[] = [];
    let maxRank = 0;
    for (let k = 0; k < lastCenterX.length; k++) {
      if (lastCenterX[k] === undefined) continue;
      if (Math.floor(k / Ng) !== midRepG) continue;
      let di = (k % Ng) - cSrcG;
      if (di > Ng / 2) di -= Ng;
      if (di < -Ng / 2) di += Ng;
      const r = Math.abs(di);
      maxRank = Math.max(maxRank, r);
      growList.push({ idx: k, rank: r });
    }
    const growRanked = growList.map((v) => ({
      idx: v.idx,
      rank: maxRank - v.rank,
    }));
    const growStart = lastRiseEnd + ENTRY.growDelay;
    let growEnd = growStart;
    tl.to(
      focusState,
      { lensFx: 1, duration: ENTRY.lensBloom, ease: ENTRY.lensBloomEase },
      growStart
    );
    growRanked.forEach((o) => {
      const atTime = growStart + o.rank * ENTRY.growStagger;
      growEnd = Math.max(growEnd, atTime + ENTRY.growDuration);
      tl.to(
        growArr,
        { [o.idx]: 1, duration: ENTRY.growDuration, ease: ENTRY.growEase },
        atTime
      );
    });
    tl.call(
      () => {
        entrySettled = false;
        for (let k = 0; k < growArr.length; k++) growArr[k] = 1;
        options.onEntryDone(true);
      },
      [],
      growEnd
    );
    entryAnim = tl;
  }

  function step(direction: number) {
    if (focusState.active || entryActive || entrySettled) return;
    velocity = 0;
    pendingFocus = null;
    target = centerForIndex(nearestIndex(scroll) + direction);
    snapped = true;
    lastInput = performance.now();
  }

  // --- Gesture tracking ---
  let isDragging = false;
  let dragLastX = 0;
  let dragDist = 0;
  let dragVel = 0;
  let dragMoveT = 0;

  function handleTouchDown(x: number, _y: number) {
    if (focusState.active) {
      closeFocus();
      return;
    }
    if (entryActive || entrySettled) return;
    userInteracted = true;
    isDragging = true;
    dragLastX = x;
    dragDist = 0;
    dragVel = 0;
    dragMoveT = performance.now();
    velocity = 0;
    pendingFocus = null;
    snapped = false;
    lastInput = dragMoveT;
  }

  function handleTouchMove(x: number, _y: number) {
    if (!isDragging) return;
    const dx = x - dragLastX;
    dragLastX = x;
    dragDist += Math.abs(dx);
    target -= dx * TOUCH_DRAG;
    dragVel = dragVel * 0.6 + -dx * TOUCH_DRAG * 0.4;
    dragMoveT = performance.now();
    lastInput = dragMoveT;
    snapped = false;
  }

  function handleTouchUp(x: number, y: number) {
    if (!isDragging) return;
    isDragging = false;

    if (focusState.active) {
      closeFocus();
      return;
    }

    // Check if it was a quick tap
    if (dragDist <= TOUCH_CLICK_SLOP) {
      const hit = panelAtPointer(x, y);
      if (hit) {
        if (centeredPanel && hit.poolIdx === centeredPanel.poolIdx) {
          pendingFocus = null;
          openFocus();
          const it = items[hit.srcIndex];
          if (it && options.onItemPress) {
            options.onItemPress(it, hit.srcIndex);
          }
          return;
        }
        velocity = 0;
        target = centerForIndex(nearestIndex(scroll + hit.centerX));
        snapped = true;
        pendingFocus = { srcIndex: hit.srcIndex };
        return;
      }
    }

    velocity = performance.now() - dragMoveT > FLICK_IDLE_MS ? 0 : dragVel;
    dragVel = 0;
    lastInput = performance.now();
    snapped = false;
  }

  // --- Render Loop ---
  let rafId = 0;
  let isRunning = true;

  function tick() {
    if (!isRunning) return;

    if (!isDragging) {
      target += velocity;
      velocity *= FRICTION;
      if (Math.abs(velocity) < 0.05) velocity = 0;
      if (
        !snapped &&
        !focusState.active &&
        performance.now() - lastInput > SNAP_IDLE_MS
      ) {
        target = centerForIndex(nearestIndex(scroll));
        snapped = true;
      }
    }

    const follow =
      isDragging
        ? TOUCH_EASE
        : snapped && !pendingFocus
          ? SNAP_EASE
          : EASE;
    scroll += (target - scroll) * follow;

    const ci = centerIndex(scroll);
    if (ci !== lastCenter) {
      lastCenter = ci;
      options.onActiveChange(ci);
    }

    const rawSpeed = scroll - prevScroll;
    prevScroll = scroll;
    const norm = Math.min(1, Math.abs(rawSpeed) / Math.max(1, SHRINK_MAX));
    const k = norm > scrollEnergy ? SHRINK_ATTACK : SHRINK_DECAY;
    scrollEnergy += (norm - scrollEnergy) * k;

    layout();

    if (pendingFocus && !focusState.active) {
      if (Math.abs(target - scroll) < 0.5) {
        const pf = pendingFocus;
        pendingFocus = null;
        if (centeredPanel && centeredPanel.srcIndex === pf.srcIndex) {
          openFocus();
        }
      }
    }

    lensUniforms.uCenter.value.set(LENS.posX, LENS.posY);
    const mobileScale = W < H ? (W / H) * 1.35 : 1.0;
    lensUniforms.uSizeX.value = LENS.sizeX * mobileScale;
    lensUniforms.uSizeY.value = LENS.sizeY * mobileScale;
    lensUniforms.uAspect.value = W / H;
    lensUniforms.uTime.value = performance.now() * 0.001;
    const rad = (a: number) => (a * Math.PI) / 180;
    lensUniforms.uRotation.value =
      rad(LENS.rotation) + rad(LENS.spin) * (performance.now() * 0.001);
    const fx = focusState.lensFx;
    for (const key of LENS_FX_KEYS) {
      lensUniforms[key].value = lensFxFull[key] * fx;
    }

    // Dual-pass rendering
    renderer.setRenderTarget(rt);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(lensScene, lensCam);

    // Swap native buffers in expo-gl
    gl.endFrameEXP();

    rafId = requestAnimationFrame(tick);
  }

  function resize(newW: number, newH: number) {
    W = Math.max(1, newW);
    H = Math.max(1, newH);
    PANEL_H = panelHFor();
    recomputeTotal();

    renderer.setSize(W, H);
    camera.left = -W / 2;
    camera.right = W / 2;
    camera.top = H / 2;
    camera.bottom = -H / 2;
    camera.updateProjectionMatrix();

    rt.setSize(Math.round(W * dpr), Math.round(H * dpr));
    lensUniforms.uRes.value.set(W * dpr, H * dpr);
    lensUniforms.uAspect.value = W / H;
    const mobileScale = W < H ? (W / H) * 1.35 : 1.0;
    lensUniforms.uSizeX.value = LENS.sizeX * mobileScale;
    lensUniforms.uSizeY.value = LENS.sizeY * mobileScale;

    if (!userInteracted) {
      scroll = centerForIndex(0);
      target = scroll;
    }
  }

  rafId = requestAnimationFrame(tick);
  if (entryOn) playEntry();
  else options.onEntryDone(true);

  function destroy() {
    isRunning = false;
    cancelAnimationFrame(rafId);
    if (focusState.anim) focusState.anim.kill();
    if (entryAnim) entryAnim.kill();

    renderer.dispose();
    rt.dispose();
    lensQuadGeo.dispose();
    lensMat.dispose();
    cardGeometry.dispose();

    disposeGLTexture(gl, renderer, fallbackTexture);
    sources.forEach((s) => {
      if (s.tex) disposeGLTexture(gl, renderer, s.tex);
    });
    pool.forEach((p) => {
      p.mat.dispose();
    });
  }

  return {
    closeFocus,
    next: () => step(1),
    previous: () => step(-1),
    destroy,
    handleTouchDown,
    handleTouchMove,
    handleTouchUp,
    resize,
  };
}
