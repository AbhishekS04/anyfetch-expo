import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
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
// Standard 16:9 widescreen ratio for videos with 20px padding on each side
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
  const [controlsActive, setControlsActive] = useState(true);
  const controlsOpacity = useRef(new Animated.Value(1)).current;
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seekerWidthRef = useRef(0);
  const [isLooping, setIsLooping] = useState(true);

  const playingEvent = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const isPlaying = playingEvent ? playingEvent.isPlaying : player.playing;

  const timeUpdateEvent = useEvent(player, 'timeUpdate', {
    currentTime: player.currentTime,
    currentLiveTimestamp: null,
    currentOffsetFromLive: null,
    bufferedPosition: 0,
  });
  const currentTime = timeUpdateEvent ? timeUpdateEvent.currentTime : player.currentTime;

  const mutedEvent = useEvent(player, 'mutedChange', { muted: player.muted });
  const isMuted = mutedEvent ? mutedEvent.muted : player.muted;

  const showControlsAndResetTimeout = useCallback(
    (forcePlaying?: boolean) => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
      setControlsActive(true);
      Animated.timing(controlsOpacity, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }).start();

      const isActuallyPlaying = forcePlaying !== undefined ? forcePlaying : player.playing;
      if (isActuallyPlaying) {
        controlsTimeoutRef.current = setTimeout(() => {
          setControlsActive(false);
          Animated.timing(controlsOpacity, {
            toValue: 0,
            duration: 350,
            useNativeDriver: true,
          }).start();
        }, 2000);
      }
    },
    [player, controlsOpacity]
  );

  useEffect(() => {
    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (isPlaying) {
      showControlsAndResetTimeout(true);
    } else {
      setControlsActive(true);
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
      Animated.timing(controlsOpacity, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }
  }, [isPlaying, showControlsAndResetTimeout, controlsOpacity]);

  const togglePlayPause = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const nextPlaying = !isPlaying;
    if (isPlaying) {
      player.pause();
    } else {
      player.play();
    }
    showControlsAndResetTimeout(nextPlaying);
  }, [isPlaying, player, showControlsAndResetTimeout]);

  const toggleMute = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    player.muted = !player.muted;
    showControlsAndResetTimeout(isPlaying);
  }, [player, isPlaying, showControlsAndResetTimeout]);

  const toggleLoop = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const nextLoop = !isLooping;
    setIsLooping(nextLoop);
    player.loop = nextLoop;
    showControlsAndResetTimeout(isPlaying);
  }, [isLooping, isPlaying, player, showControlsAndResetTimeout]);

  const handleVideoPress = useCallback(() => {
    if (!controlsActive) {
      showControlsAndResetTimeout(isPlaying);
    } else {
      setControlsActive(false);
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
      Animated.timing(controlsOpacity, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }
  }, [controlsActive, isPlaying, showControlsAndResetTimeout]);

  const skipBackward = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    player.currentTime = Math.max(0, player.currentTime - 5);
    showControlsAndResetTimeout(isPlaying);
  }, [player, isPlaying, showControlsAndResetTimeout]);

  const skipForward = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    player.currentTime = Math.min(player.duration, player.currentTime + 5);
    showControlsAndResetTimeout(isPlaying);
  }, [player, isPlaying, showControlsAndResetTimeout]);

  const handleSeek = useCallback(
    (event: any) => {
      const { locationX } = event.nativeEvent;
      const duration = player.duration || 0;
      if (seekerWidthRef.current > 0 && duration > 0) {
        const newPct = Math.max(0, Math.min(1, locationX / seekerWidthRef.current));
        player.currentTime = newPct * duration;
        showControlsAndResetTimeout(isPlaying);
      }
    },
    [player, isPlaying, showControlsAndResetTimeout]
  );

  const progressPct = player.duration > 0 ? (currentTime || 0) / player.duration : 0;

  const [hasStarted, setHasStarted] = useState(false);
  useEffect(() => {
    if (isPlaying) setHasStarted(true);
  }, [isPlaying]);

  return (
    <View style={[s.videoWrapper, { height }]}>
      {thumbnailUrl && !hasStarted && (
        <Image
          source={{ uri: thumbnailUrl }}
          style={[StyleSheet.absoluteFill, { width: '100%', height }]}
          resizeMode="cover"
        />
      )}
      <Pressable style={s.videoPressable} onPress={handleVideoPress}>
        <VideoView
          player={player}
          style={[s.videoView, { height }]}
          nativeControls={false}
          contentFit="contain"
        />
      </Pressable>

      <Animated.View
        pointerEvents={controlsActive ? 'auto' : 'none'}
        style={[s.controlsOverlay, { opacity: controlsOpacity }]}>
        {/* Center Controls (Skip -5s, Play/Pause, Skip +5s) */}
        <View style={s.centerControlsRow}>
          <TouchableOpacity onPress={skipBackward} style={s.iconButton}>
            <Backward size={20} color="#FFFFFF" />
            <Text style={s.skipText}>5s</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={togglePlayPause} style={s.glassPlayBtn}>
            {isPlaying ? (
              <Pause size={28} color="#FFFFFF" weight="Filled" />
            ) : (
              <Play size={28} color="#FFFFFF" weight="Filled" />
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={skipForward} style={s.iconButton}>
            <Forward size={20} color="#FFFFFF" />
            <Text style={s.skipText}>5s</Text>
          </TouchableOpacity>
        </View>

        {/* Bottom Panel (Seeker, Time, Mute, Loop) */}
        <View style={s.bottomControlsPanel}>
          <Pressable
            style={s.seekerContainer}
            onLayout={e => {
              seekerWidthRef.current = e.nativeEvent.layout.width;
            }}
            onPress={handleSeek}>
            <View style={s.seekerBg} pointerEvents="none">
              <View style={[s.seekerFill, { width: `${progressPct * 100}%` }]} />
              <View style={[s.seekerKnob, { left: `${progressPct * 100}%` }]} />
            </View>
          </Pressable>

          <View style={s.bottomPanelMetaRow}>
            <Text style={s.timeText}>
              {formatTime(currentTime)} • {formatTime(player.duration)}
            </Text>

            <View style={s.rightActionsRow}>
              <TouchableOpacity onPress={toggleMute} style={s.glassControlBtn}>
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
                ]}>
                <Repeat
                  size={14}
                  color={isLooping ? '#000000' : '#FFFFFF'}
                />
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
  videoPressable: {
    width: '100%',
    height: '100%',
  },
  videoView: {
    width: '100%',
  },
  controlsOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
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
    height: 18,
    justifyContent: 'center',
  },
  seekerBg: {
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    borderRadius: 2,
    position: 'relative',
    width: '100%',
  },
  seekerFill: {
    height: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 2,
  },
  seekerKnob: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FFFFFF',
    position: 'absolute',
    top: -3,
    marginLeft: -5,
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
