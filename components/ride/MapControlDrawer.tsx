import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../../lib/useTheme';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MapStyleOption = 'standard' | 'terrain' | 'satellite' | 'hybrid';

interface Props {
  visible: boolean;
  onClose: () => void;
  mapStyle: MapStyleOption;
  onChangeMapStyle: (s: MapStyleOption) => void;
  weatherOn: boolean;
  fuelOn: boolean;
  fuelLoading: boolean;
  foodOn: boolean;
  foodLoading: boolean;
  onToggleWeather: () => void;
  onToggleFuel: () => void;
  onToggleFood: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function MapControlDrawer({
  visible,
  onClose,
  mapStyle,
  onChangeMapStyle,
  weatherOn,
  fuelOn,
  fuelLoading,
  foodOn,
  foodLoading,
  onToggleWeather,
  onToggleFuel,
  onToggleFood,
}: Props) {
  const { theme } = useTheme();
  const translateX = useRef(new Animated.Value(280)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const [panelMounted, setPanelMounted] = useState(visible);

  useEffect(() => {
    if (visible) {
      setPanelMounted(true);
      Animated.parallel([
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
          damping: 22,
          stiffness: 200,
          mass: 0.8,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.spring(translateX, {
          toValue: 280,
          useNativeDriver: true,
          damping: 22,
          stiffness: 200,
          mass: 0.8,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) setPanelMounted(false);
      });
    }
  }, [visible]);

  if (!panelMounted) return null;

  const MAP_STYLE_OPTIONS: { key: MapStyleOption; label: string; icon: string }[] = [
    { key: 'standard', label: 'Standard', icon: 'map' },
    { key: 'terrain', label: 'Terrain', icon: 'layers' },
    { key: 'satellite', label: 'Satellite', icon: 'globe' },
    { key: 'hybrid', label: 'Hybrid', icon: 'image' },
  ];

  return (
    <View style={styles.container} pointerEvents="box-none">
      {/* Backdrop */}
      <Animated.View
        style={[styles.backdrop, { opacity: backdropOpacity }]}
        pointerEvents={visible ? 'auto' : 'none'}
      >
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
      </Animated.View>

      {/* Drawer panel */}
      <Animated.View
        style={[
          styles.drawer,
          {
            backgroundColor: theme.bgPanel,
            borderLeftColor: theme.border,
            transform: [{ translateX }],
          },
        ]}
      >
        {/* Header */}
        <View style={[styles.drawerHeader, { borderBottomColor: theme.border }]}>
          <Text style={[styles.drawerTitle, { color: theme.textPrimary }]}>MAP CONTROLS</Text>
          <Pressable onPress={onClose} style={styles.closeBtn}>
            <Feather name="x" size={18} color={theme.textMuted} />
          </Pressable>
        </View>

        {/* Section: BASE MAPS */}
        <Text style={[styles.sectionHeader, { color: theme.textMuted }]}>BASE MAPS</Text>
        {MAP_STYLE_OPTIONS.map((opt) => {
          const active = mapStyle === opt.key;
          return (
            <Pressable
              key={opt.key}
              style={[styles.row, { borderBottomColor: theme.border }]}
              onPress={() => onChangeMapStyle(opt.key)}
            >
              <Feather
                name={opt.icon as any}
                size={16}
                color={active ? theme.red : theme.textSecondary}
              />
              <Text
                style={[
                  styles.rowLabel,
                  { color: active ? theme.textPrimary : theme.textSecondary },
                ]}
              >
                {opt.label}
              </Text>
              <View style={styles.rowRight}>
                <View
                  style={[
                    styles.radioOuter,
                    {
                      borderColor: active ? theme.red : theme.border,
                    },
                  ]}
                >
                  {active && (
                    <View style={[styles.radioInner, { backgroundColor: theme.red }]} />
                  )}
                </View>
              </View>
            </Pressable>
          );
        })}

        {/* Section: LAYERS */}
        <Text style={[styles.sectionHeader, { color: theme.textMuted }]}>LAYERS</Text>

        <View style={[styles.row, { borderBottomColor: theme.border }]}>
          <Feather
            name="cloud"
            size={16}
            color={weatherOn ? '#5B9BD5' : theme.textSecondary}
          />
          <Text
            style={[
              styles.rowLabel,
              { color: weatherOn ? theme.textPrimary : theme.textSecondary },
            ]}
          >
            Weather
          </Text>
          <View style={styles.rowRight}>
            <Switch
              value={weatherOn}
              onValueChange={onToggleWeather}
              trackColor={{ false: theme.toggleTrackOff, true: '#5B9BD5' }}
              thumbColor={weatherOn ? theme.toggleThumbOn : theme.toggleThumbOff}
              ios_backgroundColor={theme.toggleTrackOff}
            />
          </View>
        </View>

        <View style={[styles.row, { borderBottomColor: theme.border }]}>
          {fuelLoading ? (
            <ActivityIndicator size="small" color="#FFD600" />
          ) : (
            <Feather
              name="droplet"
              size={16}
              color={fuelOn ? '#FFD600' : theme.textSecondary}
            />
          )}
          <Text
            style={[
              styles.rowLabel,
              { color: fuelOn ? theme.textPrimary : theme.textSecondary },
            ]}
          >
            Fuel Stations
          </Text>
          <View style={styles.rowRight}>
            <Switch
              value={fuelOn}
              onValueChange={onToggleFuel}
              trackColor={{ false: theme.toggleTrackOff, true: '#FFD600' }}
              thumbColor={fuelOn ? theme.toggleThumbOn : theme.toggleThumbOff}
              ios_backgroundColor={theme.toggleTrackOff}
              disabled={fuelLoading}
            />
          </View>
        </View>

        <View style={[styles.row, { borderBottomColor: theme.border }]}>
          {foodLoading ? (
            <ActivityIndicator size="small" color="#FF6B35" />
          ) : (
            <Feather
              name="coffee"
              size={16}
              color={foodOn ? '#FF6B35' : theme.textSecondary}
            />
          )}
          <Text
            style={[
              styles.rowLabel,
              { color: foodOn ? theme.textPrimary : theme.textSecondary },
            ]}
          >
            Food
          </Text>
          <View style={styles.rowRight}>
            <Switch
              value={foodOn}
              onValueChange={onToggleFood}
              trackColor={{ false: theme.toggleTrackOff, true: '#FF6B35' }}
              thumbColor={foodOn ? theme.toggleThumbOn : theme.toggleThumbOff}
              ios_backgroundColor={theme.toggleTrackOff}
              disabled={foodLoading}
            />
          </View>
        </View>

      </Animated.View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9998,
    elevation: 19,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  drawer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: 280,
    borderLeftWidth: 1,
    paddingTop: 60,
  },
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    marginBottom: 8,
  },
  drawerTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  closeBtn: {
    padding: 4,
  },
  sectionHeader: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  rowLabel: {
    flex: 1,
    fontSize: 14,
  },
  rowRight: {
    alignItems: 'flex-end',
  },
  radioOuter: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
