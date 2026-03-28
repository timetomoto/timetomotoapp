import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { useSafetyStore } from '../../lib/store';
import * as Haptics from 'expo-haptics';
import { useAuthStore, useGarageStore, useTabResetStore, bikeLabel } from '../../lib/store';
import AddBikeModal from '../../components/garage/AddBikeModal';
import MaintenanceSection from '../../components/garage/MaintenanceSection';
import ModificationsSection from '../../components/garage/ModificationsSection';
import ServiceIntervalsSection from '../../components/garage/ServiceIntervalsSection';
import ServiceBulletinsSection from '../../components/garage/ServiceBulletinsSection';
import SpecificationsSection from '../../components/garage/SpecificationsSection';
import { useScoutStore } from '../../lib/scoutStore';
import { BikeCardSkeleton } from '../../components/common/SkeletonLoader';
import { useTheme } from '../../lib/useTheme';
import { fetchWikimediaBikePhoto, clearWikiPhotoCache } from '../../lib/bikePhoto';
import { exportBikePdf } from '../../lib/bikePdf';
import MotorcycleIcon from '../../components/icons/MotorcycleIcon';
import HamburgerButton from '../../components/navigation/HamburgerButton';
import HamburgerMenu from '../../components/navigation/HamburgerMenu';

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function GarageScreen() {
  const { theme } = useTheme();
  const { user } = useAuthStore();
  const { bikes, selectedBikeId, loading, fetchBikes, selectBike, removeBike } = useGarageStore();
  const [showAddBike, setShowAddBike] = useState(false);
  const [editingBike, setEditingBike] = useState<typeof bikes[0] | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pdfExporting, setPdfExporting] = useState(false);
  const pdfCancelRef = useRef(false);
  const garageReset = useTabResetStore((s) => s.garageReset);

  // Collapsible sections — default: maintenance expanded, rest collapsed
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({ maintenance: true });

  const selectedBike = bikes.find((b) => b.id === selectedBikeId) ?? null;

  // Load/save expanded state
  useEffect(() => {
    if (!selectedBike) return;
    AsyncStorage.getItem(`@ttm/garage_sections_${selectedBike.id}`).then((stored) => {
      if (stored) {
        try { setExpandedSections(JSON.parse(stored)); } catch { /* ignore */ }
      } else {
        setExpandedSections({ maintenance: true });
      }
    }).catch(() => {});
  }, [selectedBike?.id]);

  // Section counts for badges
  const [sectionCounts, setSectionCounts] = useState<Record<string, number>>({});
  function updateCount(key: string, n: number) {
    setSectionCounts((prev) => prev[key] === n ? prev : { ...prev, [key]: n });
  }

  function toggleSection(key: string) {
    setExpandedSections((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      if (selectedBike) {
        AsyncStorage.setItem(`@ttm/garage_sections_${selectedBike.id}`, JSON.stringify(next)).catch(() => {});
      }
      return next;
    });
  }

  // Reset to maintenance on tab reset
  useEffect(() => {
    if (garageReset > 0) setExpandedSections({ maintenance: true });
  }, [garageReset]);


  useEffect(() => {
    fetchBikes(user?.id ?? 'local');
  }, [user]);

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

  const lastKnownLocation = useSafetyStore((s) => s.lastKnownLocation);
  const mapToken = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '';
  const staticMapLat = lastKnownLocation?.lat ?? 30.2672;
  const staticMapLng = lastKnownLocation?.lng ?? -97.7431;
  const staticMapUrl = `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/static/${staticMapLng},${staticMapLat},10,0/400x200@2x?access_token=${mapToken}`;

  return (
    <View style={[styles.root, { backgroundColor: theme.bg }]}>
      {/* Static map background */}
      <Image source={{ uri: staticMapUrl }} style={styles.staticMap} contentFit="cover" />
      <View style={[styles.staticMapOverlay, { backgroundColor: theme.bg + 'CC' }]} />

      {/* Floating controls */}
      <View style={[styles.floatingHeader, { top: Platform.OS === 'ios' ? 52 : 10 }]}>
        <HamburgerButton onPress={() => setMenuOpen(true)} />
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

      {/* Garage panel — solid background, starts below floating header */}
      <View style={[styles.garagePanel, { backgroundColor: theme.bg }]}>
      {loading ? (
        <ScrollView contentContainerStyle={styles.scrollContent} scrollIndicatorInsets={{ bottom: 40 }}>
          <BikeCardSkeleton />
          <View style={{ height: 16 }} />
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
        <ScrollView contentContainerStyle={styles.scrollContent} scrollIndicatorInsets={{ bottom: 40 }}>
          {/* Bike selector chips */}
          {bikes.length > 1 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.chipRow}
              contentContainerStyle={styles.chipContent}
            >
              {[...bikes].sort((a, b) => a.id === selectedBikeId ? -1 : b.id === selectedBikeId ? 1 : 0).map((bike) => (
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
          {selectedBike && (<>
            <View style={[styles.bikeCard, { backgroundColor: theme.bgCard, borderColor: theme.border }, theme.cardBorderTop && { borderTopColor: theme.cardBorderTop, borderBottomColor: theme.cardBorderBottom, borderTopWidth: 1, borderBottomWidth: 1 }]}>
              {/* Bike profile photo */}
              {bikePhotoUri ? (
                <Image
                  source={{ uri: bikePhotoUri }}
                  style={styles.bikePhoto}
                  contentFit="cover"
                  cachePolicy="memory-disk"
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
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setPdfExporting(true);
                      const signal = { cancelled: false };
                      pdfCancelRef.current = signal as any;
                      exportBikePdf(selectedBike, user?.id, bikePhotoUri ?? null, signal)
                        .then(() => setPdfExporting(false))
                        .catch((e) => {
                          setPdfExporting(false);
                          if (e?.message !== 'cancelled') {
                            Alert.alert('Export failed', e.message ?? 'Could not generate PDF.');
                          }
                        });
                    }}
                    accessibilityLabel="Export bike PDF"
                  >
                    <Feather name="file-text" size={16} color={theme.textSecondary} />
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

            </View>

            {/* ASK SCOUT about this bike */}
            <Pressable
              style={[styles.askScoutBtn, { borderColor: theme.red }]}
              onPress={() => {
                const bike = selectedBike;
                const label = [bike.year, bike.make, bike.model].filter(Boolean).join(' ');
                // Select this bike so Scout context picks it up
                useGarageStore.getState().selectBike(bike.id);
                useScoutStore.getState().openScout({
                  initialMessage: `Tell me about my ${label}${bike.nickname ? ` "${bike.nickname}"` : ''} — specs, maintenance, modifications, and service intervals.`,
                });
              }}
            >
              <Feather name="compass" size={14} color={theme.red} />
              <Text style={[styles.askScoutBtnText, { color: theme.red }]}>ASK SCOUT ABOUT THIS BIKE</Text>
            </Pressable>

            {/* Collapsible sections */}
                {[
                  { key: 'maintenance', label: 'MAINTENANCE LOG', content: <MaintenanceSection bikeId={selectedBike.id} userId={user?.id} onCountChange={(n: number) => updateCount('maintenance', n)} /> },
                  { key: 'mods', label: 'MODIFICATIONS', content: <ModificationsSection bikeId={selectedBike.id} userId={user?.id} onCountChange={(n: number) => updateCount('mods', n)} /> },
                  { key: 'specs', label: 'SPECIFICATIONS', content: <SpecificationsSection bike={selectedBike} onCountChange={(n: number) => updateCount('specs', n)} /> },
                  { key: 'intervals', label: 'SERVICE INTERVALS', content: <ServiceIntervalsSection bike={selectedBike} onCountChange={(n: number) => updateCount('intervals', n)} /> },
                  { key: 'bulletins', label: 'SERVICE BULLETINS', content: <ServiceBulletinsSection bike={selectedBike} onCountChange={(n: number) => updateCount('bulletins', n)} /> },
                ].map(({ key, label, content }) => {
                  const open = !!expandedSections[key];
                  const count = sectionCounts[key] ?? 0;
                  return (
                    <View key={key} style={[styles.sectionCard, { borderColor: theme.border, backgroundColor: theme.bgCard }]}>
                      <Pressable style={[styles.sectionHeader, { borderBottomColor: open ? theme.border : 'transparent' }]} onPress={() => toggleSection(key)}>
                        <Feather name={open ? 'chevron-down' : 'chevron-right'} size={14} color={theme.textSecondary} />
                        <Text style={[styles.sectionLabel, { color: theme.textSecondary, marginLeft: 8 }]}>{label}</Text>
                        {count > 0 && (
                          <View style={[styles.countBadge, { backgroundColor: theme.red }]}>
                            <Text style={styles.countBadgeText}>{count}</Text>
                          </View>
                        )}
                      </Pressable>
                      {open && <View style={styles.sectionContent}>{content}</View>}
                    </View>
                  );
                })}
          </>)}
        </ScrollView>
      )}
      </View>

      {/* Add Bike Modal — always mounted, visibility controlled */}
      <AddBikeModal
        visible={showAddBike}
        onClose={() => {
          setShowAddBike(false);
          fetchBikes(user?.id ?? 'local');
        }}
      />

      {/* Edit Bike Modal */}
      <AddBikeModal
        visible={!!editingBike}
        bike={editingBike ?? undefined}
        defaultPhotoUrl={wikiPhoto}
        onClose={() => {
          setEditingBike(null);
          fetchBikes(user?.id ?? 'local');
        }}
      />

      {/* Hamburger menu */}
      <HamburgerMenu open={menuOpen} onClose={() => setMenuOpen(false)} />

      {/* PDF export loading overlay */}
      <Modal visible={pdfExporting} transparent animationType="fade">
        <View style={styles.pdfOverlay}>
          <View style={[styles.pdfCard, { backgroundColor: theme.bgPanel, borderColor: theme.border }]}>
            <ActivityIndicator size="large" color={theme.red} />
            <Text style={[styles.pdfText, { color: theme.textPrimary }]}>Generating PDF…</Text>
            <Text style={[styles.pdfSubtext, { color: theme.textMuted }]}>Fetching bike data</Text>
            <Pressable
              style={[styles.pdfCancel, { borderColor: theme.border }]}
              onPress={() => {
                if (pdfCancelRef.current && typeof pdfCancelRef.current === 'object') {
                  (pdfCancelRef.current as any).cancelled = true;
                }
                setPdfExporting(false);
              }}
            >
              <Text style={{ color: theme.textSecondary, fontSize: 14, fontWeight: '600' }}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },

  // Static map
  staticMap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 160,
  },
  staticMapOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 160,
  },
  floatingHeader: {
    position: 'absolute',
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 10,
  },
  addBtn: {
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  addBtnText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
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
    letterSpacing: 0.5,
  },

  // Scroll
  garagePanel: {
    flex: 1,
    marginTop: Platform.OS === 'ios' ? 108 : 70,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden',
  },
  scrollContent: {
    paddingTop: 16,
    paddingHorizontal: 12,
    paddingBottom: 150,
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
    marginBottom: 16,
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
    letterSpacing: 1,
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
  sectionCard: {
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 8,
    alignSelf: 'stretch',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.7,
    flex: 1,
  },
  sectionContent: {
    paddingHorizontal: 0,
    paddingBottom: 0,
    paddingTop: 0,
  },
  countBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  countBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  askScoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 14,
    marginTop: 12,
    marginBottom: 12,
    marginHorizontal: 16,
  },
  askScoutBtnText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  pdfOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pdfCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 32,
    alignItems: 'center',
    gap: 12,
    width: 240,
  },
  pdfText: {
    fontSize: 16,
    fontWeight: '700',
  },
  pdfSubtext: {
    fontSize: 12,
  },
  pdfCancel: {
    marginTop: 8,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
});
