/**
 * releaseNotes.ts — Centralized Release Configuration for AnyFetch
 *
 * Configures major update highlights and onboarding requirements.
 * Minor and patch releases skip the What's New screen unless explicitly configured.
 */

export interface ReleaseHighlight {
  id: string;
  title: string;
  description: string;
  icon?: 'compass' | 'info' | 'cpu' | 'shield' | 'sparkles' | 'flash' | 'download';
}

export interface ReleaseConfig {
  version: string;
  title: string;
  subtitle: string;
  requireWhatsNew: boolean;
  highlights: ReleaseHighlight[];
}

export interface ParsedSemver {
  major: number;
  minor: number;
  patch: number;
  prerelease?: string;
  raw: string;
}

/**
 * Parses semver or version string into structured components.
 * Supports strings like "1.5-beta", "v1.5.0", "1.2.3-alpha", "2.0".
 */
export function parseSemver(v: string): ParsedSemver {
  const clean = v.replace(/^v/i, '').trim();
  const [numPart, ...preParts] = clean.split('-');
  const prerelease = preParts.join('-') || undefined;

  const segments = numPart.split('.').map(s => parseInt(s, 10) || 0);
  const major = segments[0] ?? 0;
  const minor = segments[1] ?? 0;
  const patch = segments[2] ?? 0;

  return { major, minor, patch, prerelease, raw: v };
}

/**
 * Normalizes version strings for dictionary lookup (e.g. "v1.5-beta" -> "1.5-beta").
 */
export function normalizeVersionKey(v: string): string {
  return v.replace(/^v/i, '').trim().toLowerCase();
}

/**
 * Centralized repository of release notes.
 * Only releases with requireWhatsNew: true and non-empty highlights trigger the full-screen page.
 */
export const RELEASE_CONFIGS: Record<string, ReleaseConfig> = {
  '1.5-beta': {
    version: '1.5-beta',
    title: 'A New AnyFetch Experience',
    subtitle: "We've upgraded AnyFetch with fluid navigation, dedicated architecture specs, and automated streak mascots.",
    requireWhatsNew: true,
    highlights: [
      {
        id: 'floating-nav',
        title: 'Redesigned Floating Navbar',
        description: 'Intuitive top header menu providing instant access to Downloads, History, and Theme Studio.',
        icon: 'compass',
      },
      {
        id: 'about-specs',
        title: 'Dedicated About Us Page',
        description: 'Comprehensive app specifications, open-source details, and privacy architecture right from the menu.',
        icon: 'info',
      },
      {
        id: 'fluid-dock',
        title: 'Balanced 4-Tab Fluid Dock',
        description: 'Streamlined bottom dock navigation with ultra-responsive spring physics and zero visual clutter.',
        icon: 'cpu',
      },
      {
        id: 'on-device-privacy',
        title: '100% On-Device & Private',
        description: 'Direct downloads to gallery without tracking, logging, or third-party intermediary servers.',
        icon: 'shield',
      },
    ],
  },
  '1.0.0': {
    version: '1.0.0',
    title: 'Welcome to AnyFetch',
    subtitle: 'The universal on-device media downloader.',
    requireWhatsNew: false,
    highlights: [],
  },
};

/**
 * Retrieves release configuration for an installed version, supporting aliases and normalized keys.
 */
export function getReleaseConfigForVersion(version: string): ReleaseConfig | null {
  if (!version) return null;
  const key = normalizeVersionKey(version);

  // Exact match
  if (RELEASE_CONFIGS[key]) {
    return RELEASE_CONFIGS[key];
  }

  // Also match normalized variants (e.g. "1.5" or "1.5.0-beta" to "1.5-beta")
  for (const [cfgKey, cfg] of Object.entries(RELEASE_CONFIGS)) {
    if (normalizeVersionKey(cfgKey) === key) {
      return cfg;
    }
  }

  return null;
}
