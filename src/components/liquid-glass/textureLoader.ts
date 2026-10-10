import * as THREE from 'three';
import type { ExpoWebGLRenderingContext } from 'expo-gl';
import { Image } from 'react-native';
import { cacheDirectory, getInfoAsync, downloadAsync } from 'expo-file-system/legacy';
import { PORTRAIT_ASPECT } from './constants';

function hashUrl(url: string): string {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    hash = (hash << 5) - hash + url.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

export function createPlaceholderTexture(
  gl: ExpoWebGLRenderingContext,
  renderer: THREE.WebGLRenderer,
  r = 30,
  g = 34,
  b = 45
): THREE.Texture {
  const webglTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, webglTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

  const pixel = new Uint8Array([r, g, b, 255]);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    1,
    1,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    pixel
  );

  const texture = new THREE.Texture();
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;

  const properties = renderer.properties.get(texture) as any;
  if (properties) {
    properties.__webglTexture = webglTexture;
    properties.__version = 1;
  }
  texture.version = 1;

  return texture;
}

export function createGLTextureFromLocalUri(
  gl: ExpoWebGLRenderingContext,
  renderer: THREE.WebGLRenderer,
  localUri: string
): THREE.Texture | null {
  try {
    const webglTexture = gl.createTexture();
    if (!webglTexture) return null;

    gl.bindTexture(gl.TEXTURE_2D, webglTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    // Ensure format starts with file://
    const normalizedUri = localUri.startsWith('file://') ? localUri : `file://${localUri}`;

    // Native expo-gl loader parses { localUri } via stb_image into GPU texture
    (gl as any).texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      { localUri: normalizedUri }
    );

    const texture = new THREE.Texture();
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.colorSpace = THREE.SRGBColorSpace;

    const properties = renderer.properties.get(texture) as any;
    if (properties) {
      properties.__webglTexture = webglTexture;
      properties.__version = 1;
    }
    texture.version = 1;

    return texture;
  } catch (err) {
    console.warn('[LiquidGlass] Failed to create GL texture:', err);
    return null;
  }
}

export async function resolveImageUri(src: string): Promise<string> {
  if (!src) return '';
  if (src.startsWith('file://') || src.startsWith('/')) {
    return src;
  }

  if (src.startsWith('http://') || src.startsWith('https://')) {
    const dir = cacheDirectory || '';
    const cacheFile = `${dir}glass_tex_${hashUrl(src)}.jpg`;
    try {
      const info = await getInfoAsync(cacheFile);
      if (info.exists) {
        return cacheFile;
      }
      const res = await downloadAsync(src, cacheFile);
      return res.uri;
    } catch {
      return src;
    }
  }

  return src;
}

export function measureImageAspect(src: string): Promise<number> {
  return new Promise((resolve) => {
    if (!src) {
      resolve(PORTRAIT_ASPECT);
      return;
    }
    Image.getSize(
      src,
      (width, height) => {
        if (width > 0 && height > 0) {
          resolve(width / height);
        } else {
          resolve(PORTRAIT_ASPECT);
        }
      },
      () => {
        resolve(PORTRAIT_ASPECT);
      }
    );
  });
}

export function disposeGLTexture(
  gl: ExpoWebGLRenderingContext,
  renderer: THREE.WebGLRenderer,
  texture: THREE.Texture
) {
  try {
    const properties = renderer.properties.get(texture) as any;
    if (properties?.__webglTexture) {
      gl.deleteTexture(properties.__webglTexture);
      properties.__webglTexture = null;
    }
    texture.dispose();
  } catch {
    // Ignore dispose errors during unmount
  }
}
