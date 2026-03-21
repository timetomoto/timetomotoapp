import { useEffect, useRef } from 'react';
import { Animated, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
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
  onSaveFavorite?: (place: PlaceDetail) => void;
}

export default function PlaceDetailPanel({ place, onClose, onNavigateInApp, onSaveFavorite }: Props) {
  const { theme } = useTheme();
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

  const accentColor = place?.kind === 'fuel' ? '#FFD600' : '#FF6B35';
  const icon = place?.kind === 'fuel' ? 'droplet' : 'coffee';

  return (
    <Animated.View
      style={[
        styles.panel,
        {
          backgroundColor: theme.bgPanel,
          borderColor: theme.border,
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      {/* Header — icon, name, close */}
      <View style={styles.header}>
        <View style={[styles.iconBadge, { backgroundColor: accentColor + '22', borderColor: accentColor }]}>
          <Feather name={icon as any} size={20} color={accentColor} />
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
        <Pressable onPress={onClose} hitSlop={8} style={{ padding: 2 }}>
          <Feather name="x" size={20} color={theme.textSecondary} />
        </Pressable>
      </View>

      {/* Address */}
      {!!place?.address && (
        <View style={styles.infoRow}>
          <Feather name="map-pin" size={13} color={theme.textMuted} />
          <Text style={[styles.infoText, { color: theme.textMuted }]} numberOfLines={2}>{place.address}</Text>
        </View>
      )}

      {/* Distance */}
      {place?.distanceMiles !== undefined && (
        <View style={styles.infoRow}>
          <Feather name="navigation" size={13} color={theme.textMuted} />
          <Text style={[styles.infoText, { color: theme.textMuted }]}>
            {place.distanceMiles < 0.1 ? 'Less than 0.1 mi away' : `${place.distanceMiles.toFixed(1)} mi away`}
          </Text>
        </View>
      )}

      {/* Actions */}
      <View style={{ gap: 8, marginTop: 6 }}>
        <Pressable
          style={({ pressed }) => [styles.navBtn, { backgroundColor: theme.red }, pressed && { opacity: 0.8 }]}
          onPress={handleNavigate}
        >
          <Feather name="navigation" size={14} color="#fff" />
          <Text style={styles.navBtnText}>NAVIGATE HERE</Text>
        </Pressable>
        {onSaveFavorite && place && (
          <Pressable
            style={({ pressed }) => [styles.favBtn, { borderColor: theme.border }, pressed && { opacity: 0.8 }]}
            onPress={() => { onSaveFavorite(place); onClose(); }}
          >
            <Feather name="heart" size={14} color={theme.textSecondary} />
            <Text style={[styles.favBtnText, { color: theme.textSecondary }]}>SAVE AS FAVORITE</Text>
          </Pressable>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    bottom: 100,
    left: 16,
    right: 16,
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    zIndex: 9990,
    elevation: 15,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  iconBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
  },
  subtype: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
    marginTop: 2,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
  },
  navBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 8,
    paddingVertical: 12,
    marginTop: 6,
  },
  navBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  favBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 8,
    borderWidth: 1,
    paddingVertical: 12,
  },
  favBtnText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
