# AnyFetch — Codebase Audit, Cleanup & Architecture Plan

> **Generated:** October 2026  
> **Target:** Streamline AnyFetch codebase, prune dead dependencies & speculative code, and refactor monolithic screens into a clean, maintainable architecture.

---

## 1. Executive Summary & Impact Scorecard

AnyFetch has grown into a high-performance, on-device media downloader for Android and iOS. However, several abandoned experiments, unreferenced dependencies, and monolithic screen files have accumulated.

| Metric | Current State | Target State | Net Improvement |
| :--- | :--- | :--- | :--- |
| **`HomeScreen.tsx` size** | 2,482 lines | ~350 lines | **-85% code bloat** via modular components |
| **Native Dependencies** | 20 packages | 17 packages | **-3 native libraries** (`lottie`, `async-storage`, `expo-updates`) |
| **Dead Code & Placebos** | ~1,100 lines | 0 lines | **100% removal** of non-functional code (`VideoTrimmer`, local OTA) |
| **Repository Weight** | Tracked dumps & duplicate icons | Clean assets | **~2.4 MB deleted** from git tracking |
| **Extractor Architecture** | Hardcoded `if/else` ladders | Unified Registry Pattern | Pluggable, testable extractors |

---

## 2. Keep vs. Remove Decision Matrix

### ❌ What to Remove

| Target File / Package | Category | Rationale | Net Cut |
| :--- | :---: | :--- | :--- |
| **`src/components/VideoTrimmer.tsx`** | `delete` | **592 lines of placebo code.** Has no FFmpeg, MediaCodec, or native remuxing backend. "Download Clip" downloads the full untrimmed video and merely renames the file. | -592 lines |
| **`VideoTrimmer` hooks & JSX in `HomeScreen.tsx`** | `delete` | `clipEnabled`, `clipStart`, `clipEnd`, `handlePreviewClip` 200ms polling interval, and trimmer JSX. | -120 lines |
| **`lottie-react-native`** (v7.3.8) | `native` | **0 usages** in `src/`. Empty `assets/animations/README.md`. Adds native C++/Java build overhead. | Dependency |
| **`@react-native-async-storage/async-storage`** (v2.2.0) | `native` | **0 usages** in `src/`. App persists settings and history purely via `expo-file-system/legacy` JSON. | Dependency |
| **`expo-updates`** (v57.0.23) | `delete` | Never configured in `app.json` plugins; superseded by GitHub Releases APK updater. | Dependency |
| **`scripts/serve-updates.js`** | `delete` | 268-line local IP (`192.168.29.129`) OTA server. Abandoned in favor of GitHub releases. | -268 lines |
| **`OTA_DEPLOYMENT.md`** & **`imp.md`** | `delete` | Documentation for the abandoned local OTA system. | -171 lines |
| **`app.config.js`** | `delete` | Only existed to inject local IP for `expo-updates`. Standard `app.json` is sufficient. | -12 lines |
| **`scratch/ig_share.html`** (634 KB) | `delete` | Stale 634 KB HTML scrape dump committed to git. | -634 KB |
| **`scratch/test-*.js`** | `delete` | One-off scratch test scripts. | -130 lines |
| **`assets/Screenshot_20260621_*.jpg`** (4 files) | `delete` | ~1.73 MB of reference screenshots from third-party app ("BlackHole") tracked in git. | -1.73 MB |
| **`icon.jpeg`** (64 KB in root) | `delete` | Duplicate icon; app uses `assets/icon.png` and `assets/adaptive-icon.png`. | -64 KB |
| **Silent DASH fallbacks in `youtube.ts`** | `shrink` | Itags `137` (1080p) & `135` (480p) on Invidious have no audio track on direct download. | -30 lines |
| **Duplicate JWT decode in `download.ts`** | `shrink` | Lines 176–196 duplicate `resolveDirectMediaUrl()` from `instagram.ts`. | -21 lines |

---

### ✅ What to Keep

| Component / File | Purpose | Enhancement Needed |
| :--- | :--- | :--- |
| **YouTube Extractor (`youtube.ts`)** | Roadmap Phase 2.3 requirement. High demand. | Prune silent DASH fallbacks; keep multiplexed streams (`720p`, `360p`) & audio-only (`MP3/M4A`). |
| **YouTube Quality Chips** | Lets users select 720p, 360p, or Audio. | Extract UI from `HomeScreen.tsx` into a reusable selector component. |
| **Platform Detect (`download.ts`)** | Regex parser for YouTube, Instagram, Twitter, Pinterest. | Keep as primary routing entry point. |
| **GitHub Releases Updater (`githubUpdate.ts`)** | Production APK updater with direct downloads & intent installation. | Keep; zero external cloud dependencies. |
| **`UpdateModal.tsx` & `MarkdownView.tsx`** | Clean in-app release notes viewer. | Keep; lightweight and zero-dependency. |
| **Core Extractors (`instagram.ts`, `pinterest.ts`, `twitter.ts`)** | Core functionality with resilient fallback tiers. | Standardize under a shared `Extractor` interface. |
| **Download Pipeline (`download.ts`)** | Multi-tier saving (SAF custom directory -> MediaLibrary gallery -> share sheet). | Keep; rock-solid Android 14/15 compatibility. |

---

## 3. Best Way to Organize the Codebase

### Current Problem
`src/screens/HomeScreen.tsx` currently has **2,482 lines**, acting as a "God Component":
1. It manages UI state, animations, clip state, and update modals.
2. It handles video player events, custom player controls, and progress polling.
3. It handles carousel Swiper FlatList rendering, selection toggling, and pagination.
4. It reads the system clipboard on app focus and displays the floating prompt banner.
5. It reads/writes download history JSON and handles filter chips.
6. It contains **over 820 lines of inline styles** in a single `StyleSheet.create`.

### Target Directory Structure

```text
anyfetch-expo/
├── assets/                       # Only production app assets (icon, splash, banner)
├── changelogs/                   # Version release notes (v1.1.0.md, v1.1.1.md)
├── scripts/                      # Build & publish automation
│   ├── build-apk.js              # Local release APK compiler
│   └── publish-release.js        # GitHub release publisher
├── src/
│   ├── components/
│   │   ├── common/               # Shared generic UI
│   │   │   ├── MarkdownView.tsx
│   │   │   └── ProgressBar.tsx
│   │   ├── home/                 # HomeScreen modular sections
│   │   │   ├── ClipboardBanner.tsx        # Auto-detected clipboard link banner
│   │   │   ├── HistorySection.tsx         # Download history list & filter chips
│   │   │   ├── QualitySelector.tsx        # YouTube / multi-resolution chips
│   │   │   └── CarouselSwiper.tsx         # Multi-image/video post swiper
│   │   ├── player/               # Custom video player & controls
│   │   │   ├── CustomVideoPlayer.tsx      # VideoView wrapper + seekbar + play/pause
│   │   │   └── PlayerControlsOverlay.tsx  # Volume, loop, skip ±5s, time badges
│   │   └── modals/
│   │       ├── InfoModal.tsx              # App description & usage instructions
│   │       └── UpdateModal.tsx            # APK update dialog
│   │
│   ├── extractors/               # Isolated platform extractors
│   │   ├── types.ts              # Unified MediaItem, ExtractResult interfaces
│   │   ├── index.ts              # Registry & dispatcher: getExtractor(url)
│   │   ├── instagram.ts
│   │   ├── pinterest.ts
│   │   ├── twitter.ts
│   │   └── youtube.ts
│   │
│   ├── hooks/                    # Reusable stateful logic
│   │   ├── useClipboardDetection.ts       # Clipboard check on AppState 'active'
│   │   ├── useDownloadHistory.ts          # History persistence & filtering
│   │   └── useVideoPlayerControls.ts      # Fade timeout, seeking, play/pause
│   │
│   ├── services/
│   │   └── githubUpdate.ts       # GitHub Releases API client & APK installer
│   │
│   ├── theme/                    # Design tokens & shared styling
│   │   ├── colors.ts             # Neutral dark palette (#000, #18181A, #2C2C2E)
│   │   └── platformColors.ts     # Brand colors (IG #E1306C, X #1D9BF0, YT #FF0000, PT #E60023)
│   │
│   ├── utils/
│   │   ├── download.ts           # SAF & MediaLibrary download pipeline
│   │   └── time.ts               # formatTime(), formatSeconds() helpers
│   │
│   └── screens/
│       ├── HomeScreen.tsx        # Orchestrator only (~350 lines)
│       └── SettingsScreen.tsx    # Preferences & update management
│
├── app.json                      # Clean Expo app manifest (no dead OTA wrappers)
├── package.json                  # Cleaned dependencies
└── tsconfig.json
```

---

## 4. Key Architectural Patterns to Introduce

### A. The Extractor Registry Pattern (`src/extractors/index.ts`)
Instead of `HomeScreen.tsx` chaining huge `if (platform === 'youtube') ... else if (platform === 'instagram') ...`, use a unified registry:

```typescript
// src/extractors/types.ts
export interface ExtractedMedia {
  platform: 'instagram' | 'pinterest' | 'twitter' | 'youtube';
  type: 'video' | 'image' | 'audio' | 'carousel';
  title?: string;
  author?: string;
  thumbnail?: string;
  url?: string;
  qualities?: QualityOption[];
  carouselItems?: MediaItem[];
}

// src/extractors/index.ts
export async function extractMedia(url: string): Promise<ExtractedMedia> {
  const platform = detectPlatform(url);
  switch (platform) {
    case 'youtube':   return extractYouTube(url);
    case 'instagram': return extractInstagram(url);
    case 'twitter':   return extractTwitter(url);
    case 'pinterest': return extractPinterest(url);
    default:          throw new Error('Unsupported platform');
  }
}
```

### B. Custom Hooks to De-clutter `HomeScreen.tsx`
1. **`useClipboardDetection(onUrlDetected)`**:
   Encapsulates `AppState.addEventListener('change')`, `Clipboard.getStringAsync()`, and animation values.
2. **`useDownloadHistory()`**:
   Encapsulates file loading (`download_history.json`), adding items, clearing, and active filter chips.
3. **`useVideoPlayerControls(player)`**:
   Encapsulates 2-second auto-hide timeout, play/pause toggling, mute, loop, and seekbar geometry.

---

## 5. Implementation Roadmap

### Step 1: Immediate Pruning (Zero Risk)
- Remove `lottie-react-native`, `@react-native-async-storage/async-storage`, and `expo-updates` from `package.json`.
- Delete `scripts/serve-updates.js`, `OTA_DEPLOYMENT.md`, `imp.md`, and `app.config.js`.
- Delete `scratch/` test dumps, `assets/Screenshot_*.jpg`, and root `icon.jpeg`.
- Delete `src/components/VideoTrimmer.tsx` and strip clip state from `HomeScreen.tsx`.

### Step 2: YouTube Extractor Polish
- In `src/extractors/youtube.ts`, remove silent DASH itags (`137`, `135`).
- Ensure fallback options provide working multiplexed 720p, 360p, and audio MP3.

### Step 3: Extract Sub-Components from `HomeScreen.tsx`
- Extract `CustomVideoPlayer.tsx` (~250 lines).
- Extract `HistorySection.tsx` (~180 lines).
- Extract `ClipboardBanner.tsx` (~90 lines).
- Extract `QualitySelector.tsx` (~80 lines).
- Move shared styles and color constants to `src/theme/`.

### Step 4: Verification
- Run `npm run typecheck` (`tsc --noEmit`).
- Run `npm test`.
- Build release APK via `node scripts/build-apk.js` to confirm smaller APK size and faster compile time.
