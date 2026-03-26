import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../../lib/useTheme';

// ---------------------------------------------------------------------------
// Scout Voice Indicator — small badge on the ride screen
// Four visual states: idle (listening), wake-word-detected, recording, speaking
// ---------------------------------------------------------------------------

export type VoiceState = 'idle' | 'wake_detected' | 'recording' | 'speaking';

interface Props {
  isActive: boolean;
  voiceState: VoiceState;
  onPress: () => void;
}

const STATE_COLORS: Record<VoiceState, string> = {
  idle: '#555555',
  wake_detected: '#FFA000',
  recording: '#D32F2F',
  speaking: '#4CAF50',
};

const ScoutVoiceIndicator = memo(function ScoutVoiceIndicator({
  isActive,
  voiceState,
  onPress,
}: Props) {
  const { theme } = useTheme();

  if (!isActive) return null;

  const dotColor = STATE_COLORS[voiceState];

  return (
    <Pressable style={styles.container} onPress={onPress} hitSlop={12}>
      <View style={[styles.badge, { backgroundColor: theme.mapOverlayBg, borderColor: theme.border }]}>
        <Feather name="compass" size={14} color={dotColor} />
        <Text style={[styles.label, { color: theme.textPrimary }]}>Scout</Text>
        {voiceState !== 'idle' && (
          <View style={[styles.dot, { backgroundColor: dotColor }]} />
        )}
      </View>
    </Pressable>
  );
});

export default ScoutVoiceIndicator;

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 110,
    left: 16,
    zIndex: 20,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginLeft: 2,
  },
});
