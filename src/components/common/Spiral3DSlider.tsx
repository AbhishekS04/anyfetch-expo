/**
 * Spiral3DSlider.tsx — Hardware-Accelerated 3D Helix Video Gallery
 *
 * Polished WebGL 3D Helix Gallery ported to Expo (expo-gl + Three.js):
 * - Textures correctly oriented (flipped right-side up)
 * - Front-side only culling (no inverted backfaces or reversed cards)
 * - Anti-aliased rounded corners with glass rim border
 * - Smooth opacity fade for cards rounding the back of the cylinder
 * - Gentle cylindrical surface curve (subtle uBend)
 * - Distance blur & contrast enhancement via GLSL fragment shader
 * - Butter-smooth 60/90/120Hz touch gestures & momentum coasting
 * - Non-clickable cards (purely for visual presentation)
 */

import React, { useEffect, useMemo, useRef, useCallback } from 'react';
import {
  View,
  StyleSheet,
  PanResponder,
  Dimensions,
  PixelRatio,
  AppState,
  LayoutChangeEvent,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import * as THREE from 'three';

import { patchWebGLRenderingContext } from '../liquid-glass/CarouselEngine';
import {
  createPlaceholderTexture,
  createGLTextureFromLocalUri,
  resolveImageUri,
  measureImageAspect,
  disposeGLTexture,
} from '../liquid-glass/textureLoader';

export interface Spiral3DSlide {
  /** Image source rendered inside the slide */
  src: string;
  alt?: string;
  title?: string;
  platform?: string;
  duration?: string;
  originalItem?: any;
}

export interface Spiral3DSliderProps {
  /** Images arranged along the spiral */
  items: Spiral3DSlide[];
  /** Maximum horizontal radius of the spiral in pixels */
  radius?: number;
  /** Vertical distance between neighboring images in pixels */
  verticalGap?: number;
  /** Maximum width of every image plane in pixels */
  cardWidth?: number;
  /** Width divided by height for every image plane */
  cardAspectRatio?: number;
  /** Whether the spiral advances automatically while idle */
  autoRotate?: boolean;
  /** Automatic movement in slides per second */
  autoSpeed?: number;
  /** Amount of swipe required to move along the spiral */
  scrollSensitivity?: number;
  /** Motion smoothing between 0 and 1 */
  smoothing?: number;
  /** Maximum blur applied to distant images */
  blurStrength?: number;
  /** Amount each image plane bends into the spiral */
  bend?: number;
  /** Perspective camera field of view in degrees */
  fov?: number;
  style?: StyleProp<ViewStyle>;
}

const vertexShader = `
  uniform float uBend;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vec3 transformed = position;
    // Gentle cylindrical curve along the X axis
    float curve = 1.0 - cos(position.x * 3.14159265);
    transformed.z -= curve * uBend;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
  }
`;

const fragmentShader = `
  precision highp float;

  uniform sampler2D uTexture;
  uniform float uImageAspect;
  uniform float uPlaneAspect;
  uniform float uBlur;
  uniform float uOpacity;
  varying vec2 vUv;

  vec2 coverUv(vec2 uv) {
    vec2 scale = vec2(1.0);
    if (uImageAspect > uPlaneAspect) {
      scale.x = uPlaneAspect / uImageAspect;
    } else {
      scale.y = uImageAspect / uPlaneAspect;
    }
    return (uv - 0.5) * scale + 0.5;
  }

  void main() {
    // 1. Anti-aliased rounded corner SDF (14px border radius)
    vec2 d = abs(vUv - 0.5) - vec2(0.5 - 0.046);
    float dist = length(max(d, vec2(0.0)));
    float alpha = 1.0 - smoothstep(0.044, 0.048, dist);
    if (alpha <= 0.001) discard;

    // 2. Texture sample (vertically flipped to correct Expo-GL stb_image upside-down orientation)
    vec2 correctedUv = vec2(vUv.x, 1.0 - vUv.y);
    vec2 uv = coverUv(correctedUv);
    vec2 stepSize = vec2(0.0055) * uBlur;

    vec4 color = texture2D(uTexture, uv) * 0.24;
    color += texture2D(uTexture, uv + vec2(stepSize.x, 0.0)) * 0.12;
    color += texture2D(uTexture, uv - vec2(stepSize.x, 0.0)) * 0.12;
    color += texture2D(uTexture, uv + vec2(stepSize.x * 2.0, 0.0)) * 0.06;
    color += texture2D(uTexture, uv - vec2(stepSize.x * 2.0, 0.0)) * 0.06;
    color += texture2D(uTexture, uv + vec2(0.0, stepSize.y)) * 0.12;
    color += texture2D(uTexture, uv - vec2(0.0, stepSize.y)) * 0.12;
    color += texture2D(uTexture, uv + vec2(0.0, stepSize.y * 2.0)) * 0.06;
    color += texture2D(uTexture, uv - vec2(0.0, stepSize.y * 2.0)) * 0.06;
    color += texture2D(uTexture, uv + stepSize) * 0.02;
    color += texture2D(uTexture, uv - stepSize) * 0.02;

    // 3. Vibrance and contrast boost
    float luminance = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
    color.rgb = mix(vec3(luminance), color.rgb, 1.15);
    color.rgb = (color.rgb - 0.5) * 1.06 + 0.5;
    float brightness = 1.03 - min(uBlur * 0.02, 0.06);

    // 4. Subtle glowing glass border highlight (1.5px rim)
    float rim = smoothstep(0.036, 0.044, dist) * (1.0 - smoothstep(0.044, 0.048, dist));
    color.rgb = mix(color.rgb, vec3(0.9, 0.95, 1.0), rim * 0.42);

    gl_FragColor = vec4(clamp(color.rgb * brightness, 0.0, 1.0), alpha * uOpacity);
  }
`;

function wrappedPosition(value: number, length: number): number {
  const wrapped = ((value % length) + length) % length;
  return wrapped > length / 2 ? wrapped - length : wrapped;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export function Spiral3DSlider({
  items,
  radius = 165,
  verticalGap = 72,
  cardWidth = 250,
  cardAspectRatio = 16 / 9,
  autoRotate = true,
  autoSpeed = 0.12,
  scrollSensitivity = 0.0035,
  smoothing = 0.08,
  blurStrength = 1.45,
  bend = 0.045,
  fov = 42,
  style,
}: Spiral3DSliderProps) {
  const containerSizeRef = useRef({
    width: Math.round(SCREEN_WIDTH),
    height: Math.round(SCREEN_HEIGHT),
  });

  const engineRef = useRef<{
    resize: (w: number, h: number) => void;
    destroy: () => void;
  } | null>(null);

  // Gesture state references
  const targetProgress = useRef(0);
  const velocity = useRef(0);
  const isDragging = useRef(false);
  const lastTouchY = useRef(0);
  const lastInteraction = useRef(Date.now());

  // App active state to pause rendering in background
  const isAppActiveRef = useRef(true);
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      isAppActiveRef.current = state === 'active';
    });
    return () => sub.remove();
  }, []);

  // 14 scene meshes along the helix
  const SCENE_COUNT = 14;
  const sceneItems = useMemo(() => {
    if (!items || items.length === 0) return [];
    return Array.from(
      { length: Math.max(items.length, SCENE_COUNT) },
      (_, index) => items[index % items.length]!
    );
  }, [items]);

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) {
      containerSizeRef.current = { width, height };
      engineRef.current?.resize(width, height);
    }
  }, []);

  const handleContextCreate = useCallback(
    (gl: ExpoWebGLRenderingContext) => {
      let isMounted = true;
      patchWebGLRenderingContext();

      let W = Math.max(1, containerSizeRef.current.width);
      let H = Math.max(1, containerSizeRef.current.height);
      const dpr = Math.min(PixelRatio.get() || 1, 2);

      if (typeof (gl as any).getContextAttributes !== 'function') {
        (gl as any).getContextAttributes = () => ({
          alpha: true,
          depth: true,
          stencil: false,
          antialias: true,
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

      const g = (typeof globalThis !== 'undefined' ? globalThis : {}) as any;
      const originalWGL1 = g.WebGLRenderingContext;

      let renderer: THREE.WebGLRenderer;
      try {
        g.WebGLRenderingContext = undefined;
        renderer = new THREE.WebGLRenderer({
          canvas,
          context: gl as any,
          antialias: true,
          alpha: true,
        });
      } finally {
        g.WebGLRenderingContext = originalWGL1;
      }

      renderer.setSize(W, H);
      renderer.setPixelRatio(dpr);
      renderer.setClearColor(0x000000, 0); // Transparent background

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(fov, W / H, 0.1, 100);
      camera.position.set(0, 0, 10.5);

      const count = SCENE_COUNT;
      const geometry = new THREE.PlaneGeometry(1, 1, 40, 2);

      const meshes: THREE.Mesh[] = [];
      const materials: THREE.ShaderMaterial[] = [];
      const texturesToDispose: THREE.Texture[] = [];

      for (let i = 0; i < count; i++) {
        const placeholder = createPlaceholderTexture(gl, renderer, 22, 24, 30);
        texturesToDispose.push(placeholder);

        const mat = new THREE.ShaderMaterial({
          uniforms: {
            uTexture: { value: placeholder },
            uImageAspect: { value: cardAspectRatio },
            uPlaneAspect: { value: cardAspectRatio },
            uBlur: { value: 0 },
            uBend: { value: 0 },
            uOpacity: { value: 1 },
          },
          vertexShader,
          fragmentShader,
          side: THREE.FrontSide, // Front side only: automatically culls reversed backfaces
          depthTest: true,
          depthWrite: false, // Prevents transparent sorting artifacts
          transparent: true,
        });

        const mesh = new THREE.Mesh(geometry, mat);
        mesh.frustumCulled = false;
        scene.add(mesh);

        meshes.push(mesh);
        materials.push(mat);
      }

      // Asynchronously load real textures for cards
      sceneItems.forEach(async (item, index) => {
        if (!item?.src) return;
        try {
          const resolvedUri = await resolveImageUri(item.src);
          if (!isMounted) return;
          const tex = createGLTextureFromLocalUri(gl, renderer, resolvedUri);
          if (tex && materials[index]) {
            texturesToDispose.push(tex);
            materials[index].uniforms.uTexture.value = tex;
            const aspect = await measureImageAspect(resolvedUri);
            if (materials[index]) {
              materials[index].uniforms.uImageAspect.value = aspect;
              materials[index].needsUpdate = true;
            }
          }
        } catch {
          // Graceful fallback to stylish placeholder
        }
      });

      // Internal motion state
      let progress = 0;
      let lastTime = performance.now();
      let rafId: number;

      const tick = (now: number) => {
        if (!isMounted) return;
        if (!isAppActiveRef.current) {
          rafId = requestAnimationFrame(tick);
          return;
        }

        const dt = Math.min((now - lastTime) / 1000, 0.05);
        lastTime = now;

        // Idle auto-rotation when user is not touching
        if (
          autoRotate &&
          !isDragging.current &&
          now - lastInteraction.current > 450
        ) {
          targetProgress.current += autoSpeed * dt;
        }

        // Momentum inertia after release
        if (!isDragging.current && Math.abs(velocity.current) > 0.0001) {
          targetProgress.current += velocity.current;
          velocity.current *= 0.94;
        }

        // Frame-rate independent smooth lerp
        const frameScale = Math.min(dt * 60, 3);
        const ease = 1 - Math.pow(1 - smoothing, frameScale);
        progress += (targetProgress.current - progress) * ease;

        // Viewport scale calculations
        const vFovRad = (camera.fov * Math.PI) / 180;
        const viewportHeight = 2 * Math.tan(vFovRad / 2) * camera.position.z;
        const viewportWidth = viewportHeight * (W / H);
        const factor = Math.max(W / viewportWidth, 1);

        const planeWidth = Math.min(cardWidth / factor, viewportWidth * 0.62);
        const planeHeight = planeWidth / cardAspectRatio;
        const spiralRadius = Math.min(radius / factor, viewportWidth * 0.38);
        const gap = Math.min(verticalGap / factor, viewportHeight * 0.13);

        // Update all 3D mesh positions and shader uniforms
        for (let i = 0; i < count; i++) {
          const mesh = meshes[i];
          const mat = materials[i];
          if (!mesh || !mat) continue;

          const position = wrappedPosition(i - progress, count);
          const angle = position * 0.65;
          const cosA = Math.cos(angle);
          const depth = (cosA + 1) / 2;
          const distance = Math.min(Math.abs(position) / (count * 0.4), 1);
          const scale = 0.76 + depth * 0.24;

          // Position along the vertical 3D helix
          mesh.position.set(
            Math.sin(angle) * spiralRadius,
            -position * gap,
            cosA * 2.2
          );
          mesh.rotation.set(0, Math.sin(angle) * -0.95, 0);
          mesh.scale.set(planeWidth * scale, planeHeight * scale, 1);

          // Smooth opacity: cards heading around the back of the cylinder fade to 0
          const opacity = Math.max(0, Math.min(1, (cosA + 0.28) / 1.28));
          mat.uniforms.uOpacity.value = Math.pow(opacity, 1.4);
          mesh.visible = opacity > 0.01;
          mesh.renderOrder = Math.round(depth * 100);

          mat.uniforms.uBlur.value = Math.pow(distance, 1.25) * blurStrength;
          mat.uniforms.uBend.value = Math.min(planeWidth * bend, 0.09);
          mat.uniforms.uPlaneAspect.value = cardAspectRatio;
        }

        renderer.render(scene, camera);
        gl.endFrameEXP();

        rafId = requestAnimationFrame(tick);
      };

      rafId = requestAnimationFrame(tick);

      engineRef.current = {
        resize: (newW: number, newH: number) => {
          W = Math.max(1, newW);
          H = Math.max(1, newH);
          renderer.setSize(W, H);
          camera.aspect = W / H;
          camera.updateProjectionMatrix();
        },
        destroy: () => {
          isMounted = false;
          cancelAnimationFrame(rafId);
          geometry.dispose();
          materials.forEach(m => m.dispose());
          texturesToDispose.forEach(t => disposeGLTexture(gl, renderer, t));
          renderer.dispose();
        },
      };
    },
    [
      sceneItems,
      fov,
      cardWidth,
      cardAspectRatio,
      radius,
      verticalGap,
      autoRotate,
      autoSpeed,
      smoothing,
      blurStrength,
      bend,
    ]
  );

  useEffect(() => {
    return () => {
      engineRef.current?.destroy();
      engineRef.current = null;
    };
  }, []);

  // Gesture responder: direct touch drag & momentum flick
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, g) =>
          Math.abs(g.dy) > 2 || Math.abs(g.dx) > 2,
        onPanResponderGrant: () => {
          isDragging.current = true;
          velocity.current = 0;
          lastTouchY.current = 0;
          lastInteraction.current = performance.now();
        },
        onPanResponderMove: (_, g) => {
          lastInteraction.current = performance.now();
          const delta = g.dy - lastTouchY.current;
          lastTouchY.current = g.dy;
          targetProgress.current += -delta * scrollSensitivity;
        },
        onPanResponderRelease: (_, g) => {
          isDragging.current = false;
          lastInteraction.current = performance.now();
          velocity.current = -g.vy * (scrollSensitivity * 4.2);
        },
        onPanResponderTerminate: () => {
          isDragging.current = false;
        },
      }),
    [scrollSensitivity]
  );

  if (!items || items.length === 0) return null;

  return (
    <View
      style={[styles.container, style]}
      onLayout={handleLayout}
      {...panResponder.panHandlers}
    >
      <GLView style={StyleSheet.absoluteFill} onContextCreate={handleContextCreate} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
});

export default Spiral3DSlider;
