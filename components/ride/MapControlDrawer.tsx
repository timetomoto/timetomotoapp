import { useRef } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../../lib/useTheme';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MapStyleOption = 'hybrid' | 'outdoors' | 'streets' | 'dark';

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
  constructionOn?: boolean;
  constructionLoading?: boolean;
  onToggleWeather: () => void;
  onToggleFuel: () => void;
  onToggleFood: () => void;
  onToggleConstruction?: () => void;
}

const SCREEN_H = Dimensions.get('window').height;
const PANEL_MAX_H = SCREEN_H * 0.75;

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
  constructionOn = false,
  constructionLoading = false,
  onToggleConstruction,
}: Props) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderRelease: (_, g) => {
        if (g.dy > 50) onClose();
      },
    })
  ).current;

  const MAP_STYLE_OPTIONS: { key: MapStyleOption; label: string; icon: string }[] = [
    { key: 'hybrid', label: 'Hybrid', icon: 'image' },
    { key: 'outdoors', label: 'Outdoors', icon: 'compass' },
    { key: 'streets', label: 'Streets', icon: 'map' },
    { key: 'dark', label: 'Dark', icon: 'moon' },
  ];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={s.overlay}>
        {/* Tap top area to dismiss */}
        <Pressable style={{ flex: 1 }} onPress={onClose} />

        {/* Panel */}
        <View style={[s.panel, { backgroundColor: theme.bgPanel, paddingBottom: insets.bottom + 16 }]}>
          {/* Drag handle */}
          <View {...panResponder.panHandlers}>
            <View style={[s.handle, { backgroundColor: theme.border }]} />
          </View>

          {/* Close button */}
          <Pressable onPress={onClose} style={s.closeBtn}>
            <Feather name="x" size={20} color={theme.textMuted} />
          </Pressable>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
            {/* Section: BASE MAPS */}
            <Text style={[s.sectionHeader, { color: theme.textMuted }]}>BASE MAPS</Text>
            {MAP_STYLE_OPTIONS.map((opt) => {
              const active = mapStyle === opt.key;
              return (
                <Pressable
                  key={opt.key}
                  style={[s.row, { borderBottomColor: theme.border }]}
                  onPress={() => onChangeMapStyle(opt.key)}
                >
                  <Feather name={opt.icon as any} size={16} color={active ? theme.red : theme.textSecondary} />
                  <Text style={[s.rowLabel, { color: active ? theme.textPrimary : theme.textSecondary }]}>{opt.label}</Text>
                  <View style={s.rowRight}>
                    <View style={[s.radioOuter, { borderColor: active ? theme.red : theme.border }]}>
                      {active && <View style={[s.radioInner, { backgroundColor: theme.red }]} />}
                    </View>
                  </View>
                </Pressable>
              );
            })}

            {/* Section: LAYERS */}
            <Text style={[s.sectionHeader, { color: theme.textMuted }]}>LAYERS</Text>

            <View style={[s.row, { borderBottomColor: theme.border }]}>
              <Feather name="cloud" size={16} color={weatherOn ? '#5B9BD5' : theme.textSecondary} />
              <Text style={[s.rowLabel, { color: weatherOn ? theme.textPrimary : theme.textSecondary }]}>Weather</Text>
              <View style={s.rowRight}>
                <Switch
                  value={weatherOn}
                  onValueChange={onToggleWeather}
                  trackColor={{ false: theme.toggleTrackOff, true: '#5B9BD5' }}
                  thumbColor={weatherOn ? theme.toggleThumbOn : theme.toggleThumbOff}
                  ios_backgroundColor={theme.toggleTrackOff}
                />
              </View>
            </View>

            <View style={[s.row, { borderBottomColor: theme.border }]}>
              {fuelLoading ? (
                <ActivityIndicator size="small" color="#FFD600" />
              ) : (
                <Feather name="droplet" size={16} color={fuelOn ? '#FFD600' : theme.textSecondary} />
              )}
              <Text style={[s.rowLabel, { color: fuelOn ? theme.textPrimary : theme.textSecondary }]}>Fuel Stations</Text>
              <View style={s.rowRight}>
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

            <View style={[s.row, { borderBottomColor: theme.border }]}>
              {foodLoading ? (
                <ActivityIndicator size="small" color="#FF6B35" />
              ) : (
                <Feather name="coffee" size={16} color={foodOn ? '#FF6B35' : theme.textSecondary} />
              )}
              <Text style={[s.rowLabel, { color: foodOn ? theme.textPrimary : theme.textSecondary }]}>Food</Text>
              <View style={s.rowRight}>
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

            {onToggleConstruction && (
              <View style={[s.row, { borderBottomColor: theme.border }]}>
                {constructionLoading ? (
                  <ActivityIndicator size="small" color="#FF9800" />
                ) : (
                  <Feather name="alert-triangle" size={16} color={constructionOn ? '#FF9800' : theme.textSecondary} />
                )}
                <Text style={[s.rowLabel, { color: constructionOn ? theme.textPrimary : theme.textSecondary }]}>Construction</Text>
                <View style={s.rowRight}>
                  <Switch
                    value={constructionOn}
                    onValueChange={onToggleConstruction}
                    trackColor={{ false: theme.toggleTrackOff, true: '#FF9800' }}
                    thumbColor={constructionOn ? theme.toggleThumbOn : theme.toggleThumbOff}
                    ios_backgroundColor={theme.toggleTrackOff}
                    disabled={constructionLoading}
                  />
                </View>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  panel: {
    maxHeight: PANEL_MAX_H,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 8,
  },
  closeBtn: {
    position: 'absolute',
    top: 12,
    right: 16,
    zIndex: 10,
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
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  rowLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
});
