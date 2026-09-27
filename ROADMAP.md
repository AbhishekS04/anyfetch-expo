# AnyFetch — Feature Roadmap & Master Plan

This document tracks upcoming features, platform expansions, and UX enhancements for **AnyFetch**. We will execute and verify these features phase by phase.

---

## 📌 Phase 1: High-Impact UX & Native Integrations (Completed ✅)

- [x] **1.1 Auto-Detect Copied Link on App Launch**
  - **Goal:** When the user opens AnyFetch or switches back from another app, check the system clipboard automatically.
  - **Implemented:** AppState listener + animated floating chip with platform icon, clean URL title, "Fetch" quick action, and dismiss button.
  - **Tech:** `expo-clipboard`, `AppState` listener, `Animated.spring`.

- [x] **1.2 "Share to AnyFetch" Android System Intent Receiver**
  - **Goal:** Download directly from Instagram / Twitter / Pinterest / browser without opening AnyFetch manually.
  - **Implemented:** Added `android.intent.action.SEND` (`text/plain`) and `anyfetch://` scheme to `AndroidManifest.xml`, handled intent extras in `MainActivity.kt`, and linked into `HomeScreen.tsx` via `Linking` to auto-paste and auto-fetch.
  - **Tech:** Android intent-filters, Kotlin `MainActivity.kt`, React Native `Linking`.

- [x] **1.3 Haptic Feedback & Micro-Interactions**
  - **Goal:** Elevate app feel to feel tactile and snappy.
  - **Implemented:** Crisp haptic ticks on clipboard detection, paste, fetch triggers, download start, and download success/error.
  - **Tech:** `expo-haptics`.

---

## 🌐 Phase 2: Platform Extractor Expansions

- [ ] **2.1 TikTok Extractor (No Watermark)**
  - **Goal:** Support TikTok public video downloads without watermark (HD MP4).
  - **Behavior:**
    - Handle standard links (`tiktok.com/@user/video/...`) and short links (`vt.tiktok.com/...`).
    - Extract author, thumbnail, caption, and HD watermark-free MP4 download URL.
  - **Tech:** API scraper fallback / TikWM client.

- [ ] **2.2 Extract Audio Only (MP3 / M4A)**
  - **Goal:** Allow saving just the audio track from videos (Reels, TikToks, Shorts, Pins).
  - **Behavior:**
    - On the result screen, offer two buttons: **"Download Video"** and **"Extract Audio (MP3)"**.
    - Saves into Android Music/Audio gallery with correct tags.
  - **Tech:** Audio stream extraction from source or direct audio download.

- [ ] **2.3 YouTube Shorts & Public Videos**
  - **Goal:** Public YouTube Shorts / video URL extraction.
  - **Behavior:**
    - Parse video metadata, available resolutions, and direct stream links.
  - **Tech:** Lightweight fallback scrapers or public cobalt API instances.

- [ ] **2.4 Reddit Video & GIF Extractor**
  - **Goal:** Public Reddit video post downloads with combined audio.
  - **Behavior:**
    - Resolve `v.redd.it` and reddit post links with audio synced.

---

## 🎨 Phase 3: Media Management & Downloads Tab

- [ ] **3.1 Dedicated "Downloads" Library / Offline Player**
  - **Goal:** In-app file manager for saved media.
  - **Behavior:**
    - Bottom tab or slide-out menu showing all downloaded media currently on the device.
    - Offline playback inside AnyFetch.
    - Quick actions: Share to WhatsApp/Telegram, open in external gallery, delete file.
  - **Tech:** `expo-media-library` / `expo-file-system`.

- [ ] **3.2 Download Quality / Resolution Selector**
  - **Goal:** Let users choose between 1080p, 720p, 480p, or Audio only when sources provide multiple video streams.

---

## 🛡️ Phase 4: Trust, Google Play Protect & Production Polish

- [ ] **4.1 Custom Release Keystore & App Signing**
  - **Goal:** Stop Google Play Protect from showing "Unrecognized app developer" warnings.
  - **Behavior:**
    - Generate permanent developer keystore (`release.keystore`) with proper CN/Organization.
    - Configure Gradle release signing block in `android/app/build.gradle`.
    - Provide Play Protect submission details.

- [ ] **4.2 In-App Privacy Policy & Terms Modal**
  - **Goal:** Compliance and user transparency.
  - **Behavior:**
    - Add "Privacy Policy" and "Open Source Licenses" options in `SettingsScreen.tsx`.
    - Modal detailing zero data collection, purely local processing, and copyright disclaimer.

- [ ] **4.3 Network Connectivity Banner**
  - **Goal:** Graceful handling of offline states or dropped Wi-Fi during downloads.

---

## 🚀 Execution Order Checklist
1. [x] **Phase 1.1**: Auto-Detect Copied Link on App Open ✅
2. [x] **Phase 1.2**: Android "Share to AnyFetch" Intent Filter ✅
3. [x] **Phase 1.3**: Haptic Feedback & Micro-Interactions ✅
4. [ ] **Phase 2.1**: TikTok Extractor (Watermark-free)
5. [ ] **Phase 2.2**: Audio-Only (MP3) Download Mode
6. [ ] **Phase 4.1 & 4.2**: Production Keystore & In-App Privacy Policy
7. [ ] **Phase 3.1**: Built-in Downloads Manager / Offline Player
