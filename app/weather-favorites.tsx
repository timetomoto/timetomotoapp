import { useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '@/lib/useTheme';
import type { FavoriteLocation } from './(tabs)/weather';

const FAVORITES_KEY = 'ttm_weather_favorites';

async function loadFavorites(): Promise<FavoriteLocation[]> {
  try {
    const raw = await AsyncStorage.getItem(FAVORITES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

async function saveFavorites(favs: FavoriteLocation[]): Promise<void> {
  await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(favs));
}

export default function WeatherFavoritesScreen() {
  const { theme } = useTheme();
  const router    = useRouter();
  const [favorites, setFavorites] = useState<FavoriteLocation[]>([]);

  useEffect(() => {
    loadFavorites().then(setFavorites);
  }, []);

  async function handleDelete(name: string) {
    Alert.alert(
      'Remove Favorite',
      `Remove "${name}" from favorites?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const updated = favorites.filter((f) => f.name !== name);
            setFavorites(updated);
            await saveFavorites(updated);
          },
        },
      ],
    );
  }

  return (
    <SafeAreaView style={[s.root, { backgroundColor: theme.bg }]} edges={['top']}>
      {/* Header */}
      <View style={[s.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={() => router.back()} style={s.backBtn} hitSlop={8}>
          <Feather name="arrow-left" size={20} color={theme.textPrimary} />
        </Pressable>
        <Text style={[s.heading, { color: theme.textPrimary }]}>FAVORITE LOCATIONS</Text>
        <View style={s.backBtn} />
      </View>

      <ScrollView contentContainerStyle={s.content}>
        {favorites.length === 0 ? (
          <View style={s.emptyState}>
            <Feather name="star" size={40} color={theme.border} />
            <Text style={[s.emptyTitle, { color: theme.textPrimary }]}>No favorites yet</Text>
            <Text style={[s.emptyDetail, { color: theme.textSecondary }]}>
              Search for a location in the Weather tab and tap the star icon to save it here.
            </Text>
          </View>
        ) : (
          <View style={[s.card, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
            {favorites.map((fav, i) => {
              const isLast = i === favorites.length - 1;
              return (
                <View
                  key={fav.name}
                  style={[
                    s.row,
                    { borderBottomColor: theme.border },
                    isLast && { borderBottomWidth: 0 },
                  ]}
                >
                  <Feather name="star" size={16} color="#FFD600" style={{ marginRight: 12 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={[s.favName, { color: theme.textPrimary }]}>{fav.name}</Text>
                    <Text style={[s.favCoords, { color: theme.textSecondary }]}>
                      {fav.lat.toFixed(3)}, {fav.lon.toFixed(3)}
                    </Text>
                  </View>
                  <Pressable onPress={() => handleDelete(fav.name)} hitSlop={8}>
                    <Feather name="trash-2" size={16} color={theme.textSecondary} />
                  </Pressable>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  backBtn: { width: 40, alignItems: 'flex-start' },
  heading: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 3,
  },

  content: {
    padding: 16,
    paddingBottom: 48,
  },

  card: {
    borderWidth: 1,
    borderRadius: 10,
    overflow: 'hidden',
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },

  favName: {
    fontSize: 14,
    fontWeight: '600',
  },
  favCoords: {
    fontSize: 11,
    marginTop: 2,
  },

  emptyState: {
    alignItems: 'center',
    paddingTop: 80,
    gap: 12,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  emptyDetail: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },
});
