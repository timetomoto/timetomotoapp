import { useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAuthStore, useGarageStore, useSafetyStore } from '../../lib/store';
import { Colors } from '../../lib/theme';
import AddBikeModal from '../../components/garage/AddBikeModal';
import EmergencyContactsSheet from '../../components/garage/EmergencyContactsSheet';
import { BikeCardSkeleton } from '../../components/common/SkeletonLoader';

export default function GarageScreen() {
  const { user } = useAuthStore();
  const { bikes, selectedBikeId, loading, fetchBikes, selectBike } = useGarageStore();
  const { emergencyContacts, loadContacts } = useSafetyStore();
  const [showAddBike, setShowAddBike] = useState(false);
  const [showContacts, setShowContacts] = useState(false);

  useEffect(() => {
    if (user) loadContacts(user.id);
  }, [user]);

  useEffect(() => {
    if (user) fetchBikes(user.id);
  }, [user]);

  const selectedBike = bikes.find((b) => b.id === selectedBikeId);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.heading}>GARAGE</Text>
        <View style={styles.headerRight}>
          {/* Emergency contacts shortcut */}
          <Pressable
            style={[styles.contactsBtn, emergencyContacts.length > 0 && styles.contactsBtnActive]}
            onPress={() => setShowContacts(true)}
          >
            <Feather
              name="shield"
              size={14}
              color={emergencyContacts.length > 0 ? '#4CAF50' : Colors.TEXT_SECONDARY}
            />
            <Text style={[styles.contactsBtnText, emergencyContacts.length > 0 && styles.contactsBtnTextActive]}>
              {emergencyContacts.length > 0 ? `${emergencyContacts.length} CONTACTS` : 'SAFETY'}
            </Text>
          </Pressable>
          <Pressable
            style={styles.addBtn}
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
          <Feather name="tool" size={40} color={Colors.TTM_BORDER} />
          <Text style={styles.emptyTitle}>YOUR GARAGE IS EMPTY</Text>
          <Text style={styles.emptySubtitle}>
            Add your first bike to get started →
          </Text>
          <Pressable
            style={styles.emptyBtn}
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
                  style={[styles.chip, bike.id === selectedBikeId && styles.chipActive]}
                  onPress={() => selectBike(bike.id)}
                >
                  <Text style={[styles.chipText, bike.id === selectedBikeId && styles.chipTextActive]}>
                    {bike.year} {bike.make}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          )}

          {/* Selected bike card */}
          {selectedBike && (
            <View style={styles.bikeCard}>
              <View style={styles.bikeCardHeader}>
                <View>
                  <Text style={styles.bikeYear}>{selectedBike.year}</Text>
                  <Text style={styles.bikeName}>
                    {selectedBike.make} {selectedBike.model}
                  </Text>
                </View>
                <View style={styles.odoBadge}>
                  <Text style={styles.odoValue}>
                    {selectedBike.odometer?.toLocaleString() ?? '—'}
                  </Text>
                  <Text style={styles.odoLabel}>MI</Text>
                </View>
              </View>

              {/* Placeholder section tabs */}
              <View style={styles.sectionRow}>
                {['MAINTENANCE', 'MODS', 'DOCS'].map((s) => (
                  <View key={s} style={styles.sectionTab}>
                    <Text style={styles.sectionTabText}>{s}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.sectionPlaceholder}>
                <Text style={styles.sectionPlaceholderText}>
                  Maintenance logs coming soon
                </Text>
              </View>
            </View>
          )}
        </ScrollView>
      )}

      {/* Add Bike Bottom Sheet */}
      {showAddBike && (
        <AddBikeModal onClose={() => setShowAddBike(false)} />
      )}

      {/* Emergency Contacts Sheet */}
      {showContacts && (
        <EmergencyContactsSheet onClose={() => setShowContacts(false)} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.TTM_DARK,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.TTM_BORDER,
  },
  heading: {
    color: Colors.TEXT_PRIMARY,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 4,
  },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  contactsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: Colors.TTM_BORDER,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  contactsBtnActive: { borderColor: '#4CAF5066' },
  contactsBtnText: {
    color: Colors.TEXT_SECONDARY,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  contactsBtnTextActive: { color: '#4CAF50' },
  addBtn: {
    backgroundColor: Colors.TTM_RED,
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  addBtnText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
  },

  // Loading / empty
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    color: Colors.TEXT_PRIMARY,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 8,
  },
  emptySubtitle: {
    color: Colors.TEXT_SECONDARY,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 32,
  },
  emptyBtn: {
    backgroundColor: Colors.TTM_RED,
    borderRadius: 6,
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  emptyBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 2,
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
    borderColor: Colors.TTM_BORDER,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: Colors.TTM_CARD,
  },
  chipActive: {
    borderColor: Colors.TTM_RED,
    backgroundColor: 'rgba(211,47,47,0.12)',
  },
  chipText: {
    color: Colors.TEXT_SECONDARY,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
  },
  chipTextActive: {
    color: Colors.TTM_RED,
  },

  // Bike card
  bikeCard: {
    backgroundColor: Colors.TTM_CARD,
    borderWidth: 1,
    borderColor: Colors.TTM_BORDER,
    borderRadius: 8,
    overflow: 'hidden',
  },
  bikeCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.TTM_BORDER,
  },
  bikeYear: {
    color: Colors.TEXT_SECONDARY,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 2,
    marginBottom: 4,
  },
  bikeName: {
    color: Colors.TEXT_PRIMARY,
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: 1,
  },
  odoBadge: {
    alignItems: 'center',
    backgroundColor: Colors.TTM_PANEL,
    borderWidth: 1,
    borderColor: Colors.TTM_BORDER,
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  odoValue: {
    color: Colors.TEXT_PRIMARY,
    fontSize: 20,
    fontWeight: '700',
  },
  odoLabel: {
    color: Colors.TEXT_SECONDARY,
    fontSize: 10,
    letterSpacing: 2,
    marginTop: 2,
  },

  // Section tabs
  sectionRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: Colors.TTM_BORDER,
  },
  sectionTab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: Colors.TTM_BORDER,
  },
  sectionTabText: {
    color: Colors.TEXT_SECONDARY,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
  },
  sectionPlaceholder: {
    padding: 32,
    alignItems: 'center',
  },
  sectionPlaceholderText: {
    color: Colors.TEXT_SECONDARY,
    fontSize: 13,
    letterSpacing: 1,
  },
});
