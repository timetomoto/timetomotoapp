import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../../lib/useTheme';

interface Props {
  onRetry: () => void;
  message?: string;
}

export default function NetworkError({ onRetry, message }: Props) {
  const { theme } = useTheme();
  return (
    <View style={s.root}>
      <Feather name="wifi-off" size={40} color={theme.border} />
      <Text style={[s.title, { color: theme.textPrimary }]}>CAN'T REACH THE MOTHERSHIP</Text>
      <Text style={[s.body, { color: theme.textSecondary }]}>{message ?? 'Check your connection and try again.'}</Text>
      <Pressable
        style={[s.btn, { backgroundColor: theme.red }]}
        onPress={onRetry}
        accessibilityLabel="Retry loading"
        accessibilityRole="button"
      >
        <Feather name="refresh-cw" size={14} color="#fff" />
        <Text style={s.btnText}>TRY AGAIN</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 40,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1.4,
    textAlign: 'center',
    marginTop: 8,
  },
  body: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingVertical: 13,
    marginTop: 8,
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
  },
  btnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.4,
  },
});
