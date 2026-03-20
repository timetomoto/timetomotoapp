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
import { Feather, Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '@/lib/useTheme';
import { useAuthStore } from '@/lib/store';
import {
  loadFavorites,
  removeFavorite,
  type FavoriteLocation,
} from '@/lib/favorites';

export default function WeatherFavoritesScreen() {
  const { theme } = useTheme();
  const router    = useRouter();
  const { user }  = useAuthStore();
  const userId    = user?.id ?? 'local';
  const [favorites, setFavorites] = useState<FavoriteLocation[]>([]);

  useEffect(() => {
    loadFavorites(userId).then(setFavorites);
  }, [userId]);

  async function handleDelete(name: string) {
    const fav = favorites.find((f) => f.name === name);
    if (!fav) return;
    Alert.alert(
      'Remove Favorite',
      `Remove "${name}" from favorites?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const updated = await removeFavorite(fav, userId);
            setFavorites(updated);
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
            <Ionicons name="heart-outline" size={40} color={theme.border} />
            <Text style={[s.emptyTitle, { color: theme.textPrimary }]}>No favorites yet</Text>
            <Text style={[s.emptyDetail, { color: theme.textSecondary }]}>
              Search for a location to save it here.
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
                  <Ionicons name="heart" size={16} color={theme.red} style={{ marginRight: 12 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={[s.favName, { color: theme.textPrimary }]}>{fav.name}</Text>
                    <Text style={[s.favCoords, { color: theme.textSecondary }]}>
                      {fav.lat.toFixed(3)}, {fav.lng.toFixed(3)}
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
    letterSpacing: 1.2,
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
