import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../../lib/useTheme';
import {
  fetchRouteWeather,
  hasRouteWeatherConcern,
  getRouteWarningMessage,
  type RouteWeatherPoint,
} from '../../lib/routeWeather';

interface Props {
  coordinates: [number, number][] | null;
  compact?: boolean;
}

export default function RouteWeatherStrip({ coordinates, compact }: Props) {
  const { theme } = useTheme();
  const [points, setPoints] = useState<RouteWeatherPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [useCelsius, setUseCelsius] = useState(false);
  const [hasConcern, setHasConcern] = useState(false);
  const [warningMsg, setWarningMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!coordinates || coordinates.length < 2) {
      setPoints([]);
      return;
    }
    setLoading(true);
    fetchRouteWeather(coordinates)
      .then(({ points: pts, useCelsius: celsius }) => {
        setPoints(pts);
        setUseCelsius(celsius);
        const concern = hasRouteWeatherConcern(pts, celsius);
        setHasConcern(concern);
        setWarningMsg(concern ? getRouteWarningMessage(pts, celsius) : null);
      })
      .catch(() => setPoints([]))
      .finally(() => setLoading(false));
  }, [coordinates]);

  if (!coordinates || coordinates.length < 2) return null;
  if (loading) {
    return (
      <View style={s.loadingWrap}>
        <ActivityIndicator size="small" color={theme.textMuted} />
        <Text style={[s.loadingText, { color: theme.textMuted }]}>Checking route weather...</Text>
      </View>
    );
  }
  if (points.length === 0) return null;

  // Clear conditions — show minimal confirmation
  if (!hasConcern) {
    return (
      <View style={s.clearWrap}>
        <Feather name="check-circle" size={14} color={theme.green} />
        <Text style={[s.clearText, { color: theme.textMuted }]}>Clear conditions along route</Text>
      </View>
    );
  }

  // Concerning conditions — show warning + full strip
  return (
    <View>
      {warningMsg && (
        <View style={[s.warningBanner, { backgroundColor: '#FF980018', borderColor: '#FF9800' }]}>
          <Feather name="alert-triangle" size={14} color="#FF9800" />
          <Text style={s.warningText}>{warningMsg}</Text>
        </View>
      )}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.strip}
        contentContainerStyle={s.stripContent}
      >
        {points.map((pt, i) => (
          <View key={i} style={[s.checkpoint, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
            <Text style={[s.cpLabel, { color: theme.textMuted }]}>{pt.label}</Text>
            <Feather name={pt.icon as any} size={compact ? 16 : 20} color={theme.textPrimary} />
            <Text style={[s.cpTemp, { color: theme.textPrimary }]}>{pt.temp}°</Text>
            {pt.rainChance > 20 && (
              <View style={s.cpRainRow}>
                <Feather name="droplet" size={10} color="#5B9BD5" />
                <Text style={[s.cpRain, { color: '#5B9BD5' }]}>{pt.rainChance}%</Text>
              </View>
            )}
            {pt.wind > 20 && (
              <Text style={[s.cpWind, { color: theme.textMuted }]}>{pt.wind} {useCelsius ? 'km/h' : 'mph'}</Text>
            )}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  loadingWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  loadingText: {
    fontSize: 12,
  },

  clearWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  clearText: {
    fontSize: 12,
  },

  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  warningText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: '#FF9800',
  },

  strip: {
    maxHeight: 120,
  },
  stripContent: {
    paddingHorizontal: 16,
    gap: 8,
    paddingBottom: 4,
  },

  checkpoint: {
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    minWidth: 70,
    gap: 3,
  },
  cpLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  cpTemp: {
    fontSize: 15,
    fontWeight: '700',
  },
  cpRainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  cpRain: {
    fontSize: 10,
    fontWeight: '600',
  },
  cpWind: {
    fontSize: 9,
  },
});
