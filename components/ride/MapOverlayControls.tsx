import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Colors } from '../../lib/theme';

interface Props {
  fuelRangeOn:      boolean;
  offRoadOn:        boolean;
  publicLandsOn:    boolean;
  fuelStationsOn:   boolean;
  fuelStationsLoading: boolean;
  onToggleFuelRange:    () => void;
  onToggleOffRoad:      () => void;
  onTogglePublicLands:  () => void;
  onToggleFuelStations: () => void;
}

interface BtnProps {
  icon: string;
  label: string;
  active: boolean;
  activeColor: string;
  loading?: boolean;
  onPress: () => void;
}

function OverlayBtn({ icon, label, active, activeColor, loading, onPress }: BtnProps) {
  return (
    <Pressable
      style={[s.btn, active && { borderColor: activeColor, backgroundColor: activeColor + '22' }]}
      onPress={onPress}
    >
      {loading
        ? <ActivityIndicator size="small" color={activeColor} />
        : <Feather name={icon as any} size={14} color={active ? activeColor : Colors.TEXT_SECONDARY} />
      }
      <Text style={[s.btnLabel, active && { color: activeColor }]}>{label}</Text>
    </Pressable>
  );
}

export default function MapOverlayControls({
  fuelRangeOn, offRoadOn, publicLandsOn, fuelStationsOn,
  fuelStationsLoading,
  onToggleFuelRange, onToggleOffRoad, onTogglePublicLands, onToggleFuelStations,
}: Props) {
  return (
    <View style={s.root}>
      <OverlayBtn
        icon="crosshair"
        label="RANGE"
        active={fuelRangeOn}
        activeColor="#FFD600"
        onPress={onToggleFuelRange}
      />
      <OverlayBtn
        icon="map"
        label="TRAIL"
        active={offRoadOn}
        activeColor="#4ECDC4"
        onPress={onToggleOffRoad}
      />
      <OverlayBtn
        icon="globe"
        label="LANDS"
        active={publicLandsOn}
        activeColor="#4CAF50"
        onPress={onTogglePublicLands}
      />
      <OverlayBtn
        icon="droplet"
        label="FUEL"
        active={fuelStationsOn}
        activeColor="#FFD600"
        loading={fuelStationsLoading}
        onPress={onToggleFuelStations}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 104 : 64,
    right: 16,
    gap: 6,
  },
  btn: {
    width: 52,
    paddingVertical: 7,
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(20,20,20,0.85)',
    borderWidth: 1,
    borderColor: Colors.TTM_BORDER,
    borderRadius: 7,
  },
  btnLabel: {
    color: Colors.TEXT_SECONDARY,
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
});
