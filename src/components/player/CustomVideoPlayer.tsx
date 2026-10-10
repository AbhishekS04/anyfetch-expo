import React, { useCallback, useEffect, useRef, useState } from 'react';
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
  Backward,
  Forward,
  Play,
  Pause,
  VolumeCross,
  VolumeHigh,
  Repeat,
} from 'reicon-react-native';
import * as Haptics from 'expo-haptics';
import { formatTime } from '../../utils/time';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DEFAULT_VIDEO_HEIGHT = Math.round((SCREEN_WIDTH - 40) * (9 / 16));

interface CustomVideoPlayerProps {
  player: VideoPlayer;
  height?: number;
  thumbnailUrl?: string;
  themeColor?: string;
}

export default function CustomVideoPlayer({
  player,
  height = DEFAULT_VIDEO_HEIGHT,
  thumbnailUrl,
  themeColor = '#FF9F0A',
}: CustomVideoPlayerProps) {
  const [controlsVisible, setControlsVisible] = useState(true);
  const controlsOpacity = useRef(new Animated.Value(1)).current;
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seekerWidthRef = useRef(0);
  const [isLooping, setIsLooping] = useState(true);

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

  const toggleLoop = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next = !isLooping;
    setIsLooping(next);
    player.loop = next;
    showControls(isPlaying);
  }, [isLooping, isPlaying, player, showControls]);

  const skipBackward = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    player.currentTime = Math.max(0, player.currentTime - 10);
    showControls(isPlaying);
  }, [player, isPlaying, showControls]);

  const skipForward = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    player.currentTime = Math.min(player.duration || 0, player.currentTime + 10);
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
    <View style={[s.videoWrapper, { height }]}>
      <VideoView
        player={player}
        style={[s.videoView, { height }]}
        nativeControls={false}
        contentFit="contain"
      />

      {/* Thumbnail before first frame */}
      {showThumbnail && (
        <Image
          source={{ uri: thumbnailUrl }}
          style={[StyleSheet.absoluteFill, { width: '100%', height }]}
          resizeMode="cover"
        />
      )}

      {/* Buffering overlay — shown mid-playback when stalling */}
      {isBuffering && hasStarted && (
        <View style={s.bufferingOverlay} pointerEvents="none">
          <View style={s.glassLoadingBox}>
            <ActivityIndicator size="large" color="#FFFFFF" />
            <Text style={s.bufferingText}>Buffering…</Text>
          </View>
        </View>
      )}

      {/* Tap zone — covers full surface to detect taps for controls toggle */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={handleVideoAreaPress}
      />

      {/* Controls overlay — rendered above tap zone using absolute position */}
      <Animated.View
        style={[s.controlsOverlay, { opacity: controlsOpacity }]}
        pointerEvents={controlsVisible ? 'box-none' : 'none'}
      >
        {/* Center row: Skip-10, Play/Pause, Skip+10 */}
        <View style={s.centerControlsRow} pointerEvents="box-none">
          {isBuffering && !hasStarted ? (
            <View style={s.glassLoadingBox}>
              <ActivityIndicator size="large" color="#FFFFFF" />
            </View>
          ) : (
            <>
              <TouchableOpacity onPress={skipBackward} style={s.iconButton} activeOpacity={0.75}>
                <Backward size={20} color="#FFFFFF" />
                <Text style={s.skipText}>10s</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={togglePlayPause} style={s.glassPlayBtn} activeOpacity={0.75}>
                {isPlaying ? (
                  <Pause size={28} color="#FFFFFF" weight="Filled" />
                ) : (
                  <Play size={28} color="#FFFFFF" weight="Filled" />
                )}
              </TouchableOpacity>

              <TouchableOpacity onPress={skipForward} style={s.iconButton} activeOpacity={0.75}>
                <Forward size={20} color="#FFFFFF" />
                <Text style={s.skipText}>10s</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Bottom panel: seeker + time + mute + loop */}
        <View style={s.bottomControlsPanel} pointerEvents="box-none">
          {/* Seeker with buffered indicator */}
          <Pressable
            style={s.seekerContainer}
            onLayout={e => { seekerWidthRef.current = e.nativeEvent.layout.width; }}
            onPress={handleSeek}
          >
            <View style={s.seekerBg} pointerEvents="none">
              {/* Buffered fill */}
              <View style={[s.seekerBuffered, { width: `${bufferedPct * 100}%` }]} />
              {/* Played fill */}
              <View style={[s.seekerFill, { width: `${progressPct * 100}%` }]} />
              {/* Knob */}
              <View style={[s.seekerKnob, { left: `${progressPct * 100}%` }]} />
            </View>
          </Pressable>

          <View style={s.bottomPanelMetaRow} pointerEvents="box-none">
            <Text style={s.timeText}>
              {formatTime(currentTime)} • {formatTime(duration)}
            </Text>

            <View style={s.rightActionsRow} pointerEvents="box-none">
              <TouchableOpacity onPress={toggleMute} style={s.glassControlBtn} activeOpacity={0.75}>
                {isMuted ? (
                  <VolumeCross size={14} color="#FFFFFF" />
                ) : (
                  <VolumeHigh size={14} color="#FFFFFF" />
                )}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={toggleLoop}
                style={[
                  s.glassControlBtn,
                  isLooping && { backgroundColor: themeColor, borderColor: themeColor },
                ]}
                activeOpacity={0.75}
              >
                <Repeat size={14} color={isLooping ? '#000000' : '#FFFFFF'} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  videoWrapper: {
    position: 'relative',
    width: '100%',
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#000000',
    borderWidth: 1,
    borderColor: '#1C1C1E',
  },
  videoView: {
    width: '100%',
  },
  bufferingOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  controlsOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'space-between',
    padding: 16,
  },
  centerControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 28,
    flex: 1,
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
  iconButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
  },
  skipText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
    marginTop: -1,
  },
  glassPlayBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
  },
  bottomControlsPanel: {
    backgroundColor: 'rgba(15, 15, 15, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  bottomPanelMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timeText: {
    color: '#E5E5EA',
    fontSize: 11,
    fontWeight: '700',
  },
  seekerContainer: {
    width: '100%',
    height: 20,
    justifyContent: 'center',
  },
  seekerBg: {
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 2,
    position: 'relative',
    width: '100%',
  },
  seekerBuffered: {
    height: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
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
  },
  rightActionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  glassControlBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
