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
      style={styles.btn}
      onPress={onPress}
      accessibilityLabel="Open menu"
      accessibilityRole="button"
      hitSlop={8}
    >
      <Feather name="menu" size={22} color={theme.textPrimary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
