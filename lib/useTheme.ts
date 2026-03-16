import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { useThemeStore } from './store';

export function useTheme() {
  const systemScheme = useColorScheme();
  const { theme, mode, setMode, resolveTheme } = useThemeStore();

  useEffect(() => {
    resolveTheme(systemScheme === 'dark' || systemScheme === 'light' ? systemScheme : null);
  }, [systemScheme]);

  return { theme, mode, setMode };
}
