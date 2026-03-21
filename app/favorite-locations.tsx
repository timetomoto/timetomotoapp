import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  Animated,
  Easing,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Mapbox, { Camera, MapView, PointAnnotation } from '@rnmapbox/maps';
import { useTheme } from '@/lib/useTheme';
import { useAuthStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { geocodeLocation } from '@/lib/discoverStore';
import {
  loadFavorites,
  addFavorite,
  removeFavorite,
  updateFavoriteNickname,
  setAsHome,
  type FavoriteLocation,
} from '@/lib/favorites';

const DEFAULT_CENTER = [-97.7431, 30.2672] as [number, number];

export default function FavoriteLocationsScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const { user } = useAuthStore();
  const userId = user?.id ?? 'local';

  const [favorites, setFavorites] = useState<FavoriteLocation[]>([]);
  const [adding, setAdding] = useState(false);

  // Add-view state
  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ name: string; lat: number; lng: number }>>([]);
  const [selectedLocation, setSelectedLocation] = useState<{ name: string; lat: number; lng: number } | null>(null);
  const [nickname, setNickname] = useState('');
  const [makeHome, setMakeHome] = useState(false);
  const [saving, setSaving] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<TextInput>(null);
  const cameraRef = useRef<Camera>(null);

  // Animation
  const addViewAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    loadFavorites(userId).then(setFavorites);
  }, [userId]);

  function openAddView() {
    setAdding(true);
    setSearchText('');
    setSearchResults([]);
    setSelectedLocation(null);
    setNickname('');
    setMakeHome(false);
    Animated.timing(addViewAnim, {
      toValue: 1,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start(() => {
      searchInputRef.current?.focus();
    });
  }

  function closeAddView() {
    Keyboard.dismiss();
    Animated.timing(addViewAnim, {
      toValue: 0,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start(() => {
      setAdding(false);
      setSearchText('');
      setSearchResults([]);
      setSelectedLocation(null);
    });
  }

  const handleSearchChange = useCallback((text: string) => {
    setSearchText(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!text.trim()) {
      setSearchResults([]);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      const results = await geocodeLocation(text);
      setSearchResults(results);
    }, 350);
  }, []);

  function handleSelectResult(result: { name: string; lat: number; lng: number }) {
    setSelectedLocation(result);
    setSearchResults([]);
    setSearchText(result.name);
    Keyboard.dismiss();
    cameraRef.current?.setCamera({
      centerCoordinate: [result.lng, result.lat],
      zoomLevel: 15,
      animationMode: 'flyTo',
      animationDuration: 600,
    });
  }

  async function handleAddToFavorites() {
    if (!selectedLocation || saving) return;
    setSaving(true);
    try {
      const favToAdd: FavoriteLocation = {
        ...selectedLocation,
        nickname: nickname.trim() || null,
      };
      let updated = await addFavorite(favToAdd, userId);
      if (makeHome) {
        // Find the just-added favorite and set as home
        const added = updated.find((f) => f.lat === favToAdd.lat && f.lng === favToAdd.lng);
        if (added) updated = await setAsHome(added, userId);
      }
      setFavorites(updated);
      closeAddView();
    } catch {
      Alert.alert('Error', 'Could not save location. Try again.');
    } finally {
      setSaving(false);
    }
  }

  function handleDelete(fav: FavoriteLocation) {
    Alert.alert(
      `Remove ${fav.nickname || fav.name} from favorites?`,
      undefined,
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

  function handleLongPress(fav: FavoriteLocation) {
    const options = ['Edit Nickname', fav.is_home ? 'Remove Home' : 'Set as Home', 'Delete', 'Cancel'];
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex: 3,
          destructiveButtonIndex: 2,
          title: fav.nickname || fav.name,
        },
        (idx) => {
          if (idx === 0) handleEditNickname(fav);
          else if (idx === 1) handleToggleHome(fav);
          else if (idx === 2) handleDelete(fav);
        },
      );
    } else {
      Alert.alert(
        fav.nickname || fav.name,
        undefined,
        [
          { text: 'Edit Nickname', onPress: () => handleEditNickname(fav) },
          { text: fav.is_home ? 'Remove Home' : 'Set as Home', onPress: () => handleToggleHome(fav) },
          { text: 'Delete', style: 'destructive', onPress: () => handleDelete(fav) },
          { text: 'Cancel', style: 'cancel' },
        ],
      );
    }
  }

  function handleEditNickname(fav: FavoriteLocation) {
    Alert.prompt(
      'Edit Nickname',
      `Set a nickname for ${fav.name}`,
      async (text) => {
        const updated = await updateFavoriteNickname(fav, text?.trim() || null, userId);
        setFavorites(updated);
      },
      'plain-text',
      fav.nickname ?? '',
    );
  }

  async function handleToggleHome(fav: FavoriteLocation) {
    if (fav.is_home) {
      // Remove home — just clear is_home locally + in DB
      const cached = favorites.map((f) => ({ ...f, is_home: false }));
      setFavorites(cached);
      if (userId && userId !== 'local') {
        try { await supabase.from('favorite_locations').update({ is_home: false }).eq('user_id', userId); } catch {}
      }
    } else {
      const updated = await setAsHome(fav, userId);
      setFavorites(updated);
    }
  }

  const mapStyle = 'mapbox://styles/mapbox/outdoors-v12';

  // Animated values
  const mapHeight = addViewAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 240],
  });
  const addViewOpacity = addViewAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, 0, 1],
  });

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

      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        {/* Add view (animated) */}
        {adding && (
          <Animated.View style={{ opacity: addViewOpacity }}>
            {/* Search input */}
            <View style={[s.searchWrap, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
              <Feather name="search" size={16} color={theme.textMuted} />
              <TextInput
                ref={searchInputRef}
                style={[s.searchInput, { color: theme.textPrimary }]}
                placeholder="Search for a location..."
                placeholderTextColor={theme.textMuted}
                value={searchText}
                onChangeText={handleSearchChange}
                returnKeyType="search"
              />
              {searchText.length > 0 && (
                <Pressable onPress={() => { setSearchText(''); setSearchResults([]); }} hitSlop={8}>
                  <Feather name="x" size={16} color={theme.textMuted} />
                </Pressable>
              )}
            </View>

            {/* Search results dropdown */}
            {searchResults.length > 0 && (
              <View style={[s.dropdown, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
                {searchResults.map((result, idx) => (
                  <Pressable
                    key={`${result.lat}-${result.lng}-${idx}`}
                    style={[s.dropdownItem, { borderBottomColor: theme.border }]}
                    onPress={() => handleSelectResult(result)}
                  >
                    <Feather name="map-pin" size={12} color={theme.textSecondary} />
                    <Text style={[s.dropdownText, { color: theme.textPrimary }]} numberOfLines={1}>
                      {result.name}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}

            {/* Map preview */}
            <Animated.View style={[s.mapWrap, { height: mapHeight, borderColor: theme.border }]}>
              <MapView
                style={StyleSheet.absoluteFillObject}
                styleURL={mapStyle}
                scrollEnabled={false}
                zoomEnabled={false}
                rotateEnabled={false}
                attributionEnabled={false}
                logoEnabled={false}
                scaleBarEnabled={false}
              >
                <Camera
                  ref={cameraRef}
                  defaultSettings={{
                    centerCoordinate: selectedLocation
                      ? [selectedLocation.lng, selectedLocation.lat]
                      : DEFAULT_CENTER,
                    zoomLevel: selectedLocation ? 15 : 14,
                  }}
                />
                {selectedLocation && (
                  <PointAnnotation
                    id="selected-location"
                    coordinate={[selectedLocation.lng, selectedLocation.lat]}
                  >
                    <View style={s.pin}>
                      <Feather name="map-pin" size={24} color={theme.red} />
                    </View>
                  </PointAnnotation>
                )}
              </MapView>
            </Animated.View>

            {/* Selected location label */}
            {selectedLocation && (
              <View style={s.selectedRow}>
                <Feather name="map-pin" size={16} color={theme.red} />
                <Text style={[s.selectedName, { color: theme.textPrimary }]} numberOfLines={2}>
                  {selectedLocation.name}
                </Text>
              </View>
            )}

            {/* Nickname input */}
            {selectedLocation && (
              <View style={[s.nicknameWrap, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
                <TextInput
                  style={[s.nicknameInput, { color: theme.textPrimary }]}
                  placeholder="Nickname (optional, e.g. Home, Work)"
                  placeholderTextColor={theme.textMuted}
                  value={nickname}
                  onChangeText={setNickname}
                  returnKeyType="done"
                />
              </View>
            )}

            {/* Set as Home toggle */}
            {selectedLocation && (
              <View style={[s.homeToggleRow, { borderColor: theme.border }]}>
                <View style={s.homeToggleLeft}>
                  <Feather name="home" size={16} color={makeHome ? theme.green : theme.textMuted} />
                  <View>
                    <Text style={[s.homeToggleLabel, { color: theme.textPrimary }]}>
                      {favorites.some((f) => f.is_home) ? 'Replace current Home' : 'Set as Home'}
                    </Text>
                    {favorites.some((f) => f.is_home) && (
                      <Text style={[s.homeToggleSub, { color: theme.textMuted }]}>
                        Current: {favorites.find((f) => f.is_home)?.nickname || favorites.find((f) => f.is_home)?.name}
                      </Text>
                    )}
                  </View>
                </View>
                <Switch
                  value={makeHome}
                  onValueChange={setMakeHome}
                  trackColor={{ false: '#C7C7CC', true: theme.green ?? '#2E7D32' }}
                  thumbColor="#FFFFFF"
                  ios_backgroundColor="#C7C7CC"
                />
              </View>
            )}

            {/* Action buttons */}
            <Pressable
              style={[
                s.addConfirmBtn,
                { backgroundColor: selectedLocation ? theme.red : theme.border },
              ]}
              onPress={handleAddToFavorites}
              disabled={!selectedLocation || saving}
            >
              <Text style={s.addConfirmBtnText}>
                {saving ? 'SAVING...' : 'ADD TO FAVORITES'}
              </Text>
            </Pressable>
            <Pressable style={s.cancelBtn} onPress={closeAddView}>
              <Text style={[s.cancelBtnText, { color: theme.textSecondary }]}>Cancel</Text>
            </Pressable>
          </Animated.View>
        )}

        {/* Add location button (shown in list view) */}
        {!adding && (
          <Pressable
            style={[s.addBtn, { backgroundColor: theme.red }, theme.btnBorderTop && { borderTopColor: theme.btnBorderTop, borderBottomColor: theme.btnBorderBottom, borderTopWidth: 1, borderBottomWidth: 1 }]}
            onPress={openAddView}
          >
            <Text style={s.addBtnText}>+ ADD LOCATION</Text>
          </Pressable>
        )}

        {/* Favorites list */}
        {!adding && (
          favorites.length === 0 ? (
            <View style={s.emptyState}>
              <Feather name="map-pin" size={32} color={theme.border} />
              <Text style={[s.emptyTitle, { color: theme.textPrimary }]}>
                No favorites yet.
              </Text>
              <Text style={[s.emptySubtitle, { color: theme.textSecondary }]}>
                Save locations you ride to often for quick access.
              </Text>
            </View>
          ) : (
            <View style={[s.card, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
              {[...favorites].sort((a, b) => (b.is_home ? 1 : 0) - (a.is_home ? 1 : 0)).map((fav, i) => {
                const isLast = i === favorites.length - 1;
                return (
                  <Pressable
                    key={`${fav.name}-${fav.lat}-${fav.lng}`}
                    style={[
                      s.favRow,
                      { borderBottomColor: theme.border },
                      isLast && { borderBottomWidth: 0 },
                    ]}
                    onLongPress={() => handleLongPress(fav)}
                  >
                    <Feather name="map-pin" size={16} color={theme.red} />
                    <View style={s.favInfo}>
                      <Text style={[s.favName, { color: theme.textPrimary }]} numberOfLines={1}>
                        {fav.nickname || fav.name}
                      </Text>
                      {fav.nickname ? (
                        <Text style={[s.favAddress, { color: theme.textMuted }]} numberOfLines={1}>
                          {fav.name}
                        </Text>
                      ) : null}
                      {fav.address ? (
                        <Text style={[s.favAddress, { color: theme.textMuted }]} numberOfLines={1}>
                          {fav.address}
                        </Text>
                      ) : null}
                    </View>
                    {fav.is_home && (
                      <View style={[s.homeBadge, { backgroundColor: theme.green + '22' }]}>
                        <Text style={[s.homeBadgeText, { color: theme.green }]}>Home</Text>
                      </View>
                    )}
                    <Pressable onPress={() => handleLongPress(fav)} hitSlop={8} style={s.iconBtn}>
                      <Feather name="edit-2" size={14} color={theme.textSecondary} />
                    </Pressable>
                    <Pressable onPress={() => handleDelete(fav)} hitSlop={8} style={s.iconBtn}>
                      <Feather name="trash-2" size={14} color={theme.textSecondary} />
                    </Pressable>
                  </Pressable>
                );
              })}
            </View>
          )
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

  // Add button
  addBtn: {
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 16,
  },
  addBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  // Search
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    padding: 0,
  },

  // Dropdown
  dropdown: {
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 8,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  dropdownText: {
    flex: 1,
    fontSize: 13,
  },

  // Map
  mapWrap: {
    borderWidth: 1,
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 12,
  },
  pin: {
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Selected location
  selectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  selectedName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },

  // Confirm add
  addConfirmBtn: {
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  addConfirmBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  cancelBtn: {
    alignItems: 'center',
    paddingVertical: 10,
    marginBottom: 16,
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '500',
  },

  // Nickname input
  nicknameWrap: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
  },
  nicknameInput: {
    fontSize: 14,
    padding: 0,
  },

  // Home toggle
  homeToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 16,
  },
  homeToggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  homeToggleLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  homeToggleSub: {
    fontSize: 11,
    marginTop: 1,
  },

  // Favorites list
  card: {
    borderWidth: 1,
    borderRadius: 10,
    overflow: 'hidden',
  },
  favRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    gap: 10,
  },
  favInfo: {
    flex: 1,
  },
  favName: {
    fontSize: 14,
    fontWeight: '600',
  },
  favAddress: {
    fontSize: 11,
    marginTop: 2,
  },
  homeBadge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  homeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  iconBtn: {
    padding: 4,
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingTop: 60,
    gap: 10,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },
});
