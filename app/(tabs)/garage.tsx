import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAuthStore, useGarageStore, useTabResetStore, bikeLabel } from '../../lib/store';
import AddBikeModal from '../../components/garage/AddBikeModal';
import MaintenanceSection from '../../components/garage/MaintenanceSection';
import ModificationsSection from '../../components/garage/ModificationsSection';
import ServiceIntervalsSection from '../../components/garage/ServiceIntervalsSection';
import ServiceBulletinsSection from '../../components/garage/ServiceBulletinsSection';
import SpecificationsSection from '../../components/garage/SpecificationsSection';
import { BikeCardSkeleton } from '../../components/common/SkeletonLoader';
import { useTheme } from '../../lib/useTheme';
import { fetchWikimediaBikePhoto, clearWikiPhotoCache } from '../../lib/bikePhoto';
import MotorcycleIcon from '../../components/icons/MotorcycleIcon';
import HamburgerButton from '../../components/navigation/HamburgerButton';
import HamburgerMenu from '../../components/navigation/HamburgerMenu';

export default function GarageScreen() {
  const { theme } = useTheme();
  const { user } = useAuthStore();
  const { bikes, selectedBikeId, loading, fetchBikes, selectBike, removeBike } = useGarageStore();
  const [showAddBike, setShowAddBike] = useState(false);
  const [editingBike, setEditingBike] = useState<typeof bikes[0] | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<'MAINTENANCE' | 'MODS' | 'SERVICE'>('MAINTENANCE');
  const garageReset = useTabResetStore((s) => s.garageReset);
  useEffect(() => {
    if (garageReset > 0) setActiveSection('MAINTENANCE');
  }, [garageReset]);

  useEffect(() => {
    fetchBikes(user?.id ?? 'local');
  }, [user]);

  const selectedBike = bikes.find((b) => b.id === selectedBikeId);

  // Fetch Wikimedia default photo when no user-uploaded photo
  const [wikiPhotos, setWikiPhotos] = useState<Record<string, string>>({});
  const fetchingRef = useRef<Set<string>>(new Set());
  const wikiPhoto = selectedBike ? (wikiPhotos[selectedBike.id] ?? null) : null;

  const lastFetchKey = useRef<string>('');
  useEffect(() => {
    if (!selectedBike) return;
    if (selectedBike.photo_url) return;
    if (!selectedBike.make || !selectedBike.model) return;

    const fetchKey = `${selectedBike.id}|${selectedBike.make}|${selectedBike.model}`;
    const makeModelChanged = lastFetchKey.current && lastFetchKey.current.startsWith(selectedBike.id) && fetchKey !== lastFetchKey.current;

    // Skip if already fetched for this exact make/model
    if (fetchKey === lastFetchKey.current && wikiPhotos[selectedBike.id]) return;
    // Skip if already fetching the same key
    if (fetchingRef.current.has(fetchKey)) return;

    const bikeId = selectedBike.id;

    // Clear stale cache if make/model changed
    if (makeModelChanged) {
      clearWikiPhotoCache(bikeId);
      setWikiPhotos((prev) => { const next = { ...prev }; delete next[bikeId]; return next; });
    }
    lastFetchKey.current = fetchKey;
    fetchingRef.current.add(fetchKey);

    fetchWikimediaBikePhoto(selectedBike.make, selectedBike.model, bikeId)
      .then((url) => {
        if (url) setWikiPhotos((prev) => ({ ...prev, [bikeId]: url }));
      })
      .catch(() => {})
      .finally(() => fetchingRef.current.delete(fetchKey));
  }, [selectedBike?.id, selectedBike?.photo_url, selectedBike?.make, selectedBike?.model]);

  const bikePhotoUri = selectedBike?.photo_url || wikiPhoto;

  function handleRemoveBike() {
    if (!selectedBike) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    Alert.alert(
      'REMOVE BIKE',
      `Remove ${selectedBike.year} ${selectedBike.make} ${selectedBike.model} from your garage? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => removeBike(selectedBike.id, !user),
        },
      ],
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.bg }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <HamburgerButton onPress={() => setMenuOpen(true)} />
        <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <Text style={[styles.heading, { color: theme.textPrimary }]}>GARAGE</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <Pressable
            style={[styles.addBtn, { backgroundColor: theme.red }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              setShowAddBike(true);
            }}
            accessibilityLabel="Add a bike"
            accessibilityRole="button"
          >
            <Text style={styles.addBtnText}>+ ADD BIKE</Text>
          </Pressable>
        </View>
      </View>

      {loading ? (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <BikeCardSkeleton />
        </ScrollView>
      ) : bikes.length === 0 ? (
        <View style={styles.centered}>
          <Feather name="tool" size={40} color={theme.border} />
          <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>YOUR GARAGE IS EMPTY</Text>
          <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
            Add your first bike to get started →
          </Text>
          <Pressable
            style={[styles.emptyBtn, { backgroundColor: theme.red }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              setShowAddBike(true);
            }}
            accessibilityLabel="Add your first bike"
            accessibilityRole="button"
          >
            <Text style={styles.emptyBtnText}>ADD YOUR FIRST BIKE</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Bike selector chips */}
          {bikes.length > 1 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.chipRow}
              contentContainerStyle={styles.chipContent}
            >
              {bikes.map((bike) => (
                <Pressable
                  key={bike.id}
                  style={[
                    styles.chip,
                    { borderColor: theme.border, backgroundColor: theme.bgCard },
                    bike.id === selectedBikeId && { borderColor: theme.red, backgroundColor: theme.red + '1F' },
                  ]}
                  onPress={() => selectBike(bike.id)}
                >
                  <Text style={[
                    styles.chipText,
                    { color: theme.textSecondary },
                    bike.id === selectedBikeId && { color: theme.red },
                  ]}>
                    {bikeLabel(bike)}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          )}

          {/* Selected bike card */}
          {selectedBike && (
            <View style={[styles.bikeCard, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
              {/* Bike profile photo */}
              {bikePhotoUri ? (
                <Image
                  source={{ uri: bikePhotoUri }}
                  style={styles.bikePhoto}
                  resizeMode="cover"
                />
              ) : (
                <View style={[styles.bikePhotoPlaceholder, { backgroundColor: theme.bgPanel }]}>
                  <MotorcycleIcon size={48} color={theme.textMuted} />
                </View>
              )}

              <View style={[styles.bikeCardHeader, { borderBottomColor: theme.border }]}>
                <View style={styles.bikeNameContainer}>
                  {selectedBike.nickname ? (
                    <>
                      <Text style={[styles.bikeNickname, { color: theme.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                        {selectedBike.nickname}
                      </Text>
                      <Text style={[styles.bikeRealName, { color: theme.textSecondary }]}>
                        {selectedBike.year} {selectedBike.make} {selectedBike.model}
                      </Text>
                    </>
                  ) : (
                    <>
                      <Text style={[styles.bikeYear, { color: theme.textSecondary }]}>{selectedBike.year}</Text>
                      <Text style={[styles.bikeName, { color: theme.textPrimary }]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7}>
                        {selectedBike.make} {selectedBike.model}
                      </Text>
                    </>
                  )}
                  <View style={[styles.odoBadge, { backgroundColor: theme.bgPanel, borderColor: theme.border }]}>
                    <Text style={[styles.odoValue, { color: theme.textPrimary }]}>
                      {selectedBike.odometer?.toLocaleString() ?? '—'}
                    </Text>
                    <Text style={[styles.odoLabel, { color: theme.textSecondary }]}>MI</Text>
                  </View>
                </View>
                <View style={styles.actionRow}>
                  <Pressable
                    style={[styles.removeBtn, { borderColor: theme.border }]}
                    onPress={() => setEditingBike(selectedBike)}
                    accessibilityLabel="Edit bike"
                  >
                    <Feather name="edit-2" size={16} color={theme.textSecondary} />
                  </Pressable>
                  <Pressable
                    style={[styles.removeBtn, { borderColor: theme.border }]}
                    onPress={handleRemoveBike}
                    accessibilityLabel="Remove bike"
                  >
                    <Feather name="trash-2" size={16} color={theme.red} />
                  </Pressable>
                </View>
              </View>

              {/* Section tabs */}
              <View style={[styles.sectionRow, { borderBottomColor: theme.border }]}>
                {(['MAINTENANCE', 'MODS', 'SERVICE'] as const).map((s, i, arr) => (
                  <Pressable
                    key={s}
                    style={[
                      styles.sectionTab,
                      { borderRightColor: theme.border },
                      i === arr.length - 1 && { borderRightWidth: 0 },
                      activeSection === s && { borderBottomWidth: 2, borderBottomColor: theme.red },
                    ]}
                    onPress={() => setActiveSection(s)}
                  >
                    <Text style={[styles.sectionTabText, { color: activeSection === s ? theme.red : theme.textSecondary }]}>{s}</Text>
                  </Pressable>
                ))}
              </View>

              {activeSection === 'MAINTENANCE' && selectedBike && (
                <MaintenanceSection bikeId={selectedBike.id} userId={user?.id} />
              )}
              {activeSection === 'MODS' && selectedBike && (
                <ModificationsSection bikeId={selectedBike.id} userId={user?.id} />
              )}
              {activeSection === 'SERVICE' && selectedBike && (
                <>
                  <SpecificationsSection bike={selectedBike} />
                  <View style={[styles.serviceDivider, { backgroundColor: theme.border }]} />
                  <ServiceIntervalsSection bike={selectedBike} />
                  <View style={[styles.serviceDivider, { backgroundColor: theme.border }]} />
                  <ServiceBulletinsSection bike={selectedBike} />
                </>
              )}
            </View>
          )}
        </ScrollView>
      )}

      {/* Add Bike Bottom Sheet */}
      {showAddBike && (
        <AddBikeModal onClose={() => {
          setShowAddBike(false);
          fetchBikes(user?.id ?? 'local');
        }} />
      )}

      {/* Edit Bike Bottom Sheet */}
      {editingBike && (
        <AddBikeModal bike={editingBike} defaultPhotoUrl={wikiPhoto} onClose={() => {
          setEditingBike(null);
          fetchBikes(user?.id ?? 'local');
        }} />
      )}

      {/* Hamburger menu */}
      <HamburgerMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  heading: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  addBtn: {
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  addBtnText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  // Loading / empty
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 0.7,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 32,
  },
  emptyBtn: {
    borderRadius: 6,
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  emptyBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.7,
  },

  // Scroll
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },

  // Bike selector chips
  chipRow: {
    marginBottom: 16,
  },
  chipContent: {
    gap: 8,
    paddingHorizontal: 4,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.3,
  },

  // Bike photo
  bikePhoto: {
    width: '100%',
    aspectRatio: 16 / 9,
  },
  bikePhotoPlaceholder: {
    width: '100%',
    aspectRatio: 16 / 9,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Bike card
  bikeCard: {
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
  bikeCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 20,
    borderBottomWidth: 1,
  },
  bikeYear: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.7,
    marginBottom: 2,
  },
  bikeNameContainer: {
    flex: 1,
    marginRight: 12,
  },
  bikeName: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  bikeNickname: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.2,
    marginBottom: 3,
  },
  bikeRealName: {
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.3,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  odoBadge: {
    flexDirection: 'row',
    alignItems: 'baseline',
    alignSelf: 'flex-start',
    gap: 4,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 10,
  },
  removeBtn: {
    borderWidth: 1,
    borderRadius: 6,
    padding: 8,
  },
  odoValue: {
    fontSize: 20,
    fontWeight: '700',
  },
  odoLabel: {
    fontSize: 10,
    letterSpacing: 0.7,
    marginTop: 2,
  },

  serviceDivider: {
    height: 1,
    marginHorizontal: 16,
  },

  // Section tabs
  sectionRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  sectionTab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRightWidth: 1,
  },
  sectionTabText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.7,
  },

});
