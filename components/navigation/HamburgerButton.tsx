import { Pressable, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '@/lib/useTheme';

interface Props {
  onPress: () => void;
}

export default function HamburgerButton({ onPress }: Props) {
  const { theme } = useTheme();
  return (
    <Pressable
      style={[styles.btn, { backgroundColor: theme.red }]}
      onPress={onPress}
      accessibilityLabel="Open menu"
      accessibilityRole="button"
      hitSlop={8}
    >
      <Feather name="menu" size={22} color="#fff" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
