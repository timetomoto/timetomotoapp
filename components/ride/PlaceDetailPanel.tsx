import { useEffect, useRef } from 'react';
import { Animated, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../../lib/useTheme';

export interface PlaceDetail {
  name: string;
  address: string;
  lat: number;
  lng: number;
  kind: 'fuel' | 'food';
  subtype?: string;
  distanceMiles?: number;
}

interface Props {
  place: PlaceDetail | null;
  onClose: () => void;
  onNavigateInApp?: (dest: { name: string; lat: number; lng: number }) => void;
}

export default function PlaceDetailPanel({ place, onClose, onNavigateInApp }: Props) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(300)).current;

  useEffect(() => {
    if (place) {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        damping: 22,
        stiffness: 220,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: 300,
        duration: 220,
        useNativeDriver: true,
      }).start();
    }
  }, [place]);

  if (!place && (slideAnim as any).__getValue() >= 299) return null;

  function handleNavigate() {
    if (!place) return;
    if (onNavigateInApp) {
      onNavigateInApp({ name: place.name, lat: place.lat, lng: place.lng });
      onClose();
      return;
    }
    const label = encodeURIComponent(place.name);
    const url = Platform.OS === 'ios'
      ? `maps://?daddr=${place.lat},${place.lng}&dirflg=d`
      : `geo:${place.lat},${place.lng}?q=${label}`;
    Linking.openURL(url).catch(() => {
      Linking.openURL(`https://maps.google.com/?daddr=${place.lat},${place.lng}`);
    });
  }

  const icon = place?.kind === 'fuel' ? 'droplet' : 'coffee';
  const accentColor = place?.kind === 'fuel' ? '#FFD600' : '#FF6B35';
  const infoIconColor = place?.kind === 'food' ? '#FF6B35' : theme.textMuted;

  return (
    <Animated.View
      style={[
        styles.panel,
        {
          backgroundColor: theme.bgPanel,
          borderTopColor: theme.border,
          paddingBottom: insets.bottom + 12,
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      {/* Handle */}
      <View style={[styles.handle, { backgroundColor: theme.border }]} />

      {/* Close */}
      <Pressable style={styles.closeBtn} onPress={onClose}>
        <Feather name="x" size={18} color={theme.textMuted} />
      </Pressable>

      {/* Icon + name */}
      <View style={styles.titleRow}>
        <View style={[styles.iconBadge, { backgroundColor: accentColor + '22', borderColor: accentColor }]}>
          <Feather name={icon as any} size={18} color={accentColor} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.name, { color: theme.textPrimary }]} numberOfLines={2}>
            {place?.name ?? ''}
          </Text>
          {place?.subtype && (
            <Text style={[styles.subtype, { color: theme.textMuted }]}>
              {place.subtype.replace(/_/g, ' ').toUpperCase()}
            </Text>
          )}
        </View>
      </View>

      {/* Address */}
      {!!place?.address && (
        <View style={[styles.infoRow, { borderBottomColor: theme.border }]}>
          <Feather name="map-pin" size={14} color={infoIconColor} />
          <Text style={[styles.infoText, { color: theme.textSecondary }]}>{place.address}</Text>
        </View>
      )}

      {/* Distance */}
      {place?.distanceMiles !== undefined && (
        <View style={[styles.infoRow, { borderBottomColor: theme.border }]}>
          <Feather name="navigation" size={14} color={infoIconColor} />
          <Text style={[styles.infoText, { color: theme.textSecondary }]}>
            {place.distanceMiles < 0.1
              ? 'Less than 0.1 mi away'
              : `${place.distanceMiles.toFixed(1)} mi away`}
          </Text>
        </View>
      )}

      {/* Navigate button */}
      <Pressable
        style={({ pressed }) => [styles.navBtn, { backgroundColor: theme.red }, pressed && { opacity: 0.8 }]}
        onPress={handleNavigate}
      >
        <Feather name="navigation-2" size={16} color="#fff" />
        <Text style={styles.navBtnText}>NAVIGATE</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    elevation: 20,
    borderTopWidth: 1,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
  },
  closeBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    padding: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
    paddingRight: 32,
  },
  iconBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  subtype: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.3,
    marginTop: 2,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  navBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
    borderRadius: 8,
    paddingVertical: 14,
  },
  navBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.7,
  },
});
