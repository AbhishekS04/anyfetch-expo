import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface InfoModalProps {
  visible: boolean;
  onDismiss: () => void;
}

export default function InfoModal({ visible, onDismiss }: InfoModalProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      animationType="fade"
      transparent={true}
      visible={visible}
      onRequestClose={onDismiss}>
      <View
        style={[
          s.overlay,
          {
            paddingTop: Math.max(insets.top, 24),
            paddingBottom: Math.max(insets.bottom, 24),
          },
        ]}>
        <View style={s.card}>
          <Text style={s.title}>ANYFETCH</Text>
          <Text style={s.sub}>Universal Media Downloader</Text>
          <View style={s.divider} />
          <Text style={s.desc}>
            Download videos, audio, & images from YouTube, Instagram, Twitter/X, and Pinterest.
          </Text>
          <Text style={s.instructions}>
            1. Copy any supported link.{'\n'}
            2. Open Anyfetch — clipboard is auto-read.{'\n'}
            3. Tap Fetch or the glowing circle to preview.{'\n'}
            4. Tap Download to save directly to your gallery.
          </Text>
          <Pressable style={s.closeBtn} onPress={onDismiss}>
            <Text style={s.closeTxt}>Dismiss</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#18181A',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#2C2C2E',
    padding: 24,
    alignItems: 'center',
  },
  title: {
    color: '#FF9F0A',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 2,
  },
  sub: {
    color: '#8E8E93',
    fontSize: 12,
    marginTop: 4,
  },
  divider: {
    width: '100%',
    height: 1,
    backgroundColor: '#2C2C2E',
    marginVertical: 16,
  },
  desc: {
    color: '#FFFFFF',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 14,
  },
  instructions: {
    color: '#8E8E93',
    fontSize: 12,
    lineHeight: 20,
    marginBottom: 20,
    alignSelf: 'flex-start',
  },
  closeBtn: {
    backgroundColor: '#FF9F0A',
    paddingHorizontal: 28,
    paddingVertical: 10,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
  },
  closeTxt: {
    color: '#000000',
    fontWeight: '700',
    fontSize: 14,
  },
});
