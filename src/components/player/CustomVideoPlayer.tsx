import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { VideoPlayer, VideoView } from 'expo-video';
import { useEvent } from 'expo';
import {
  Play,
  Pause,
  VolumeCross,
  VolumeHigh,
} from 'reicon-react-native';
import * as Haptics from 'expo-haptics';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const CONTAINER_WIDTH = Math.min(SCREEN_WIDTH - 40, 440);
const MAX_PLAYER_HEIGHT = Math.min(Math.round(SCREEN_HEIGHT * 0.58), 510);
const MIN_PLAYER_HEIGHT = 136;

function getInitialRatio(platformName?: string): number {
  const p = (platformName || '').toLowerCase();
  if (p === 'instagram' || p === 'tiktok' || p === 'snapchat' || p === 'reels' || p === 'shorts') {
    return 9 / 16;
  }
  return 16 / 9;
}

interface CustomVideoPlayerProps {
  player: VideoPlayer;
  height?: number;
  thumbnailUrl?: string;
  themeColor?: string;
  platform?: string;
}

export default function CustomVideoPlayer({
  player,
  height,
  thumbnailUrl,
  themeColor = '#FF9F0A',
  platform,
}: CustomVideoPlayerProps) {
  const [controlsVisible, setControlsVisible] = useState(true);
  const controlsOpacity = useRef(new Animated.Value(1)).current;
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seekerWidthRef = useRef(0);

  // Set looping by default
  useEffect(() => {
    player.loop = true;
  }, [player]);

  // ── Automatic Aspect Ratio Detection & Transition ──────────────────────────
  const initialRatio = useMemo(() => getInitialRatio(platform), [platform]);
  const [detectedRatio, setDetectedRatio] = useState<number | null>(null);

  // Reset detected ratio when media source changes
  useEffect(() => {
    setDetectedRatio(null);
  }, [thumbnailUrl, platform]);

  // 1. Detect from thumbnail dimensions if available
  useEffect(() => {
    if (!thumbnailUrl) return;
    let isMounted = true;
    Image.getSize(
      thumbnailUrl,
      (w, h) => {
        if (isMounted && w > 0 && h > 0) {
          setDetectedRatio(w / h);
        }
      },
      () => {}
    );
    return () => {
      isMounted = false;
    };
  }, [thumbnailUrl]);

  // 2. Detect from expo-video sourceLoad track metadata
  const sourceLoadEvent = useEvent(player, 'sourceLoad');
  useEffect(() => {
    try {
      const tracks = (sourceLoadEvent as any)?.availableVideoTracks;
      if (tracks && tracks.length > 0) {
        const { width: w, height: h } = tracks[0].size || {};
        if (w && h && w > 0 && h > 0) {
          setDetectedRatio(w / h);
        }
      }
    } catch {}
  }, [sourceLoadEvent]);

  // 3. Fallback on videoTrackChange
  const videoTrackEvent = useEvent(player, 'videoTrackChange');
  useEffect(() => {
    try {
      const size = (videoTrackEvent as any)?.videoTrack?.size;
      if (size && size.width > 0 && size.height > 0) {
        setDetectedRatio(size.width / size.height);
      }
    } catch {}
  }, [videoTrackEvent]);

  // 4. Check direct player properties if already loaded
  useEffect(() => {
    try {
      const track = (player as any).videoTrack;
      if (track?.size?.width && track?.size?.height && track.size.width > 0 && track.size.height > 0) {
        setDetectedRatio(track.size.width / track.size.height);
        return;
      }
      const tracks = (player as any).availableVideoTracks;
      if (tracks && tracks.length > 0) {
        const { width: w, height: h } = tracks[0]?.size || {};
        if (w && h && w > 0 && h > 0) {
          setDetectedRatio(w / h);
        }
      }
    } catch {}
  }, [player]);

  const activeRatio = detectedRatio ?? initialRatio;

  // Compute exact aspect-ratio-matched dimensions to eliminate black bars
  const { targetWidth, targetHeight } = useMemo(() => {
    if (height) {
      return { targetWidth: CONTAINER_WIDTH, targetHeight: height };
    }
    const ratio = activeRatio && activeRatio > 0 ? activeRatio : 16 / 9;
    const maxW = CONTAINER_WIDTH;
    const maxH = MAX_PLAYER_HEIGHT;

    let w = maxW;
    let h = Math.round(w / ratio);

    if (h > maxH) {
      // Tall / vertical reel: clamp height and scale width to hug video tightly with zero black bars
      h = maxH;
      w = Math.round(h * ratio);
    } else if (h < MIN_PLAYER_HEIGHT) {
      // Ultrawide video: clamp min height and adjust width
      h = MIN_PLAYER_HEIGHT;
      w = Math.min(maxW, Math.round(h * ratio));
    }

    return { targetWidth: w, targetHeight: h };
  }, [height, activeRatio]);

  // Smooth responsive animated morphing for width and height
  const animatedWidth = useRef(new Animated.Value(targetWidth)).current;
  const animatedHeight = useRef(new Animated.Value(targetHeight)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(animatedWidth, {
        toValue: targetWidth,
        friction: 9,
        tension: 45,
        useNativeDriver: false,
      }),
      Animated.spring(animatedHeight, {
        toValue: targetHeight,
        friction: 9,
        tension: 45,
        useNativeDriver: false,
      }),
    ]).start();
  }, [targetWidth, targetHeight, animatedWidth, animatedHeight]);

  // ── Player state via events ────────────────────────────────────────────────
  const playingEvent = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const isPlaying = playingEvent?.isPlaying ?? player.playing;

  const statusEvent = useEvent(player, 'statusChange', { status: player.status });
  const playerStatus = statusEvent?.status ?? player.status;

  const timeUpdateEvent = useEvent(player, 'timeUpdate', {
    currentTime: player.currentTime,
    currentLiveTimestamp: null,
    currentOffsetFromLive: null,
    bufferedPosition: 0,
  });
  const currentTime = timeUpdateEvent?.currentTime ?? player.currentTime;
  const bufferedPosition = timeUpdateEvent?.bufferedPosition ?? 0;

  const mutedEvent = useEvent(player, 'mutedChange', { muted: player.muted });
  const isMuted = mutedEvent?.muted ?? player.muted;

  // Track if playback has actually started (hides thumbnail)
  const [hasStarted, setHasStarted] = useState(false);
  useEffect(() => {
    if (isPlaying || (currentTime && currentTime > 0.1)) {
      setHasStarted(true);
    }
  }, [isPlaying, currentTime]);

  // ── Controls visibility logic ──────────────────────────────────────────────
  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const showControls = useCallback(
    (playing?: boolean) => {
      clearHideTimer();
      setControlsVisible(true);
      Animated.timing(controlsOpacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }).start();

      // Auto-hide after 3.5s only when playing
      const actuallyPlaying = playing !== undefined ? playing : isPlaying;
      if (actuallyPlaying) {
        hideTimerRef.current = setTimeout(() => {
          setControlsVisible(false);
          Animated.timing(controlsOpacity, {
            toValue: 0,
            duration: 250,
            useNativeDriver: true,
          }).start();
        }, 3500);
      }
    },
    [clearHideTimer, controlsOpacity, isPlaying]
  );

  // Always show controls when paused
  useEffect(() => {
    if (!isPlaying) {
      showControls(false);
    } else {
      showControls(true);
    }
  }, [isPlaying]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => clearHideTimer();
  }, [clearHideTimer]);

  // ── Tap to toggle controls ─────────────────────────────────────────────────
  const handleVideoAreaPress = useCallback(() => {
    if (controlsVisible) {
      clearHideTimer();
      setControlsVisible(false);
      Animated.timing(controlsOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    } else {
      showControls(isPlaying);
    }
  }, [controlsVisible, clearHideTimer, controlsOpacity, showControls, isPlaying]);

  // ── Playback controls ──────────────────────────────────────────────────────
  const togglePlayPause = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (isPlaying) {
      player.pause();
    } else {
      player.play();
    }
    showControls(!isPlaying);
  }, [isPlaying, player, showControls]);

  const toggleMute = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    player.muted = !player.muted;
    showControls(isPlaying);
  }, [player, isPlaying, showControls]);

  const handleSeek = useCallback(
    (event: any) => {
      const { locationX } = event.nativeEvent;
      const duration = player.duration || 0;
      if (seekerWidthRef.current > 0 && duration > 0) {
        const pct = Math.max(0, Math.min(1, locationX / seekerWidthRef.current));
        player.currentTime = pct * duration;
        showControls(isPlaying);
      }
    },
    [player, isPlaying, showControls]
  );

  // ── Derived state ──────────────────────────────────────────────────────────
  const duration = player.duration || 0;
  const progressPct = duration > 0 ? Math.min(1, (currentTime || 0) / duration) : 0;
  const bufferedPct = duration > 0 ? Math.min(1, (bufferedPosition || 0) / duration) : 0;

  // Show spinner when buffering (loading status but has started before)
  const isBuffering = playerStatus === 'loading';
  const showThumbnail = Boolean(thumbnailUrl && !hasStarted);

  return (
    <Animated.View
      style={[
        s.videoWrapper,
        {
          width: animatedWidth,
          height: animatedHeight,
        },
      ]}
    >
      <VideoView
        player={player}
        style={[StyleSheet.absoluteFill, s.videoView]}
        nativeControls={false}
        contentFit="cover"
      />

      {/* Thumbnail before first frame */}
      {showThumbnail && (
        <Image
          source={{ uri: thumbnailUrl }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
      )}

      {/* Buffering overlay — shown mid-playback when stalling */}
      {isBuffering && hasStarted && (
        <View style={s.bufferingOverlay} pointerEvents="none">
          <View style={s.glassLoadingBox}>
            <ActivityIndicator size="small" color="#FFFFFF" />
            <Text style={s.bufferingText}>Buffering…</Text>
          </View>
        </View>
      )}

      {/* Tap zone — covers full surface to detect taps for controls toggle */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={handleVideoAreaPress}
      />

      {/* Controls overlay — unboxed direct row: Play/Pause (left) | Progress bar (middle) | Mute (right) */}
      <Animated.View
        style={[
          s.controlsOverlay,
          { opacity: controlsOpacity },
        ]}
        pointerEvents={controlsVisible ? 'box-none' : 'none'}
      >
        <View style={s.controlsRow} pointerEvents="box-none">
          {/* Left: Play / Pause */}
          <TouchableOpacity
            onPress={togglePlayPause}
            style={s.sideBtn}
            activeOpacity={0.7}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            {isPlaying ? (
              <Pause size={18} color="#FFFFFF" weight="Filled" />
            ) : (
              <Play size={18} color="#FFFFFF" weight="Filled" />
            )}
          </TouchableOpacity>

          {/* Middle: Progress bar */}
          <Pressable
            style={s.seekerContainer}
            onLayout={e => { seekerWidthRef.current = e.nativeEvent.layout.width; }}
            onPress={handleSeek}
            hitSlop={{ top: 12, bottom: 12 }}
          >
            <View style={s.seekerBg} pointerEvents="none">
              {/* Buffered fill */}
              <View style={[s.seekerBuffered, { width: `${bufferedPct * 100}%` }]} />
              {/* Played fill */}
              <View style={[s.seekerFill, { width: `${progressPct * 100}%` }]} />
              {/* Knob */}
              <View
                style={[
                  s.seekerKnob,
                  { left: `${progressPct * 100}%` },
                ]}
              />
            </View>
          </Pressable>

          {/* Right: Mute / Unmute */}
          <TouchableOpacity
            onPress={toggleMute}
            style={s.sideBtn}
            activeOpacity={0.7}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            {isMuted ? (
              <VolumeCross size={18} color="#FFFFFF" />
            ) : (
              <VolumeHigh size={18} color="#FFFFFF" />
            )}
          </TouchableOpacity>
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  videoWrapper: {
    position: 'relative',
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#000000',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    alignSelf: 'center',
  },
  videoView: {
    width: '100%',
    height: '100%',
  },
  bufferingOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  glassLoadingBox: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  bufferingText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
  },
  controlsOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'transparent',
    justifyContent: 'flex-end',
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    gap: 12,
  },
  sideBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  seekerContainer: {
    flex: 1,
    height: 24,
    justifyContent: 'center',
  },
  seekerBg: {
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.28)',
    borderRadius: 2,
    position: 'relative',
    width: '100%',
  },
  seekerBuffered: {
    height: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.45)',
    borderRadius: 2,
    position: 'absolute',
    top: 0,
    left: 0,
  },
  seekerFill: {
    height: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 2,
    position: 'absolute',
    top: 0,
    left: 0,
  },
  seekerKnob: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    position: 'absolute',
    top: -4,
    marginLeft: -6,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.4,
    shadowRadius: 2.5,
  },
});
