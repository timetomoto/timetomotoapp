import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../../lib/useTheme';
import { supabase } from '../../lib/supabase';
import type { Bike, BikeSpecs } from '../../lib/store';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_NINJAS_KEY = process.env.EXPO_PUBLIC_API_NINJAS_KEY ?? '';
const GEMINI_KEY = process.env.EXPO_PUBLIC_GEMINI_KEY ?? '';

const FUEL_OPTIONS = ['Regular', 'Premium', 'E85'] as const;

// ---------------------------------------------------------------------------
// Spec row definitions
// ---------------------------------------------------------------------------

type SpecRowDef = {
  key: string;
  icon: string;
  label: string;
  getValue: (s: BikeSpecs) => string;
  editKeys?: string[]; // keys for inline editing (multiple = multi-input)
  editLabels?: string[];
  isNumeric?: boolean;
  isFuelType?: boolean;
};

const OPERATIONAL_ROWS: SpecRowDef[] = [
  {
    key: 'tirePressure',
    icon: 'disc',
    label: 'Tire Pressure',
    getValue: (s) => {
      const f = s.tirePressureFrontPsi;
      const r = s.tirePressureRearPsi;
      if (f == null && r == null) return '\u2014';
      return `Front ${f ?? '\u2014'} psi \u00B7 Rear ${r ?? '\u2014'} psi`;
    },
    editKeys: ['tirePressureFrontPsi', 'tirePressureRearPsi'],
    editLabels: ['Front (psi)', 'Rear (psi)'],
    isNumeric: true,
  },
  {
    key: 'tireSizes',
    icon: 'circle',
    label: 'Tire Sizes',
    getValue: (s) => {
      const f = s.tireFrontSize;
      const r = s.tireRearSize;
      if (!f && !r) return '\u2014';
      return `Front ${f || '\u2014'} \u00B7 Rear ${r || '\u2014'}`;
    },
    editKeys: ['tireFrontSize', 'tireRearSize'],
    editLabels: ['Front', 'Rear'],
  },
  {
    key: 'fuelType',
    icon: 'droplet',
    label: 'Fuel Type',
    getValue: (s) => s.fuelType || '\u2014',
    isFuelType: true,
  },
  {
    key: 'fuelCapacity',
    icon: 'droplet',
    label: 'Fuel Capacity',
    getValue: (s) => (s.fuelCapacityGal != null ? `${s.fuelCapacityGal} gal` : '\u2014'),
    editKeys: ['fuelCapacityGal'],
    editLabels: ['Gallons'],
    isNumeric: true,
  },
  {
    key: 'engine',
    icon: 'settings',
    label: 'Engine',
    getValue: (s) => {
      const parts = [s.engineDisplacement, s.engineType].filter(Boolean);
      return parts.length ? parts.join(' \u00B7 ') : '\u2014';
    },
    editKeys: ['engineDisplacement', 'engineType'],
    editLabels: ['Displacement', 'Type'],
  },
  {
    key: 'oilType',
    icon: 'thermometer',
    label: 'Oil Type',
    getValue: (s) => s.oilType || '\u2014',
    editKeys: ['oilType'],
    editLabels: ['e.g. 10W-40'],
  },
  {
    key: 'oilCapacity',
    icon: 'thermometer',
    label: 'Oil Capacity',
    getValue: (s) => (s.oilCapacityQt != null ? `${s.oilCapacityQt} qt` : '\u2014'),
    editKeys: ['oilCapacityQt'],
    editLabels: ['Quarts'],
    isNumeric: true,
  },
  {
    key: 'maxLoad',
    icon: 'package',
    label: 'Max Load',
    getValue: (s) => (s.maxLoadLbs != null ? `${s.maxLoadLbs} lbs` : '\u2014'),
    editKeys: ['maxLoadLbs'],
    editLabels: ['Lbs'],
    isNumeric: true,
  },
];

const DIMENSION_ROWS: SpecRowDef[] = [
  {
    key: 'seatHeight',
    icon: 'arrow-up',
    label: 'Seat Height',
    getValue: (s) => s.seatHeight || '\u2014',
    editKeys: ['seatHeight'],
    editLabels: [''],
  },
  {
    key: 'groundClearance',
    icon: 'arrow-down',
    label: 'Ground Clearance',
    getValue: (s) => s.groundClearance || '\u2014',
    editKeys: ['groundClearance'],
    editLabels: [''],
  },
  {
    key: 'overallLength',
    icon: 'maximize-2',
    label: 'Overall Length',
    getValue: (s) => s.overallLength || '\u2014',
    editKeys: ['overallLength'],
    editLabels: [''],
  },
  {
    key: 'overallWidth',
    icon: 'maximize-2',
    label: 'Overall Width',
    getValue: (s) => s.overallWidth || '\u2014',
    editKeys: ['overallWidth'],
    editLabels: [''],
  },
  {
    key: 'overallHeight',
    icon: 'maximize-2',
    label: 'Overall Height',
    getValue: (s) => s.overallHeight || '\u2014',
    editKeys: ['overallHeight'],
    editLabels: [''],
  },
  {
    key: 'wetWeight',
    icon: 'package',
    label: 'Wet Weight',
    getValue: (s) => (s.wetWeightLbs != null ? `${s.wetWeightLbs} lbs` : '\u2014'),
    editKeys: ['wetWeightLbs'],
    editLabels: ['Lbs'],
    isNumeric: true,
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function deriveFuelType(fuelSystem: string | undefined): string | undefined {
  if (!fuelSystem) return undefined;
  const lower = fuelSystem.toLowerCase();
  if (lower.includes('e85')) return 'E85';
  // Most motorcycles use regular unless explicitly premium
  return undefined;
}

async function lookupApiNinjas(
  make: string,
  model: string,
  year: string,
): Promise<{ specs: Partial<BikeSpecs>; fuelCapacity?: number } | null> {
  if (!API_NINJAS_KEY || API_NINJAS_KEY === 'your_key_here') return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(
      `https://api.api-ninjas.com/v1/motorcycles?make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}&year=${encodeURIComponent(year)}`,
      {
        headers: { 'X-Api-Key': API_NINJAS_KEY },
        signal: controller.signal,
      },
    );
    if (!res.ok) return null;
    const results = await res.json();
    if (!Array.isArray(results) || results.length === 0) return null;

    const bike = results[0];
    const specs: Partial<BikeSpecs> = {};

    if (bike.front_tire) specs.tireFrontSize = bike.front_tire;
    if (bike.rear_tire) specs.tireRearSize = bike.rear_tire;
    if (bike.displacement) specs.engineDisplacement = bike.displacement;
    if (bike.engine) specs.engineType = bike.engine;
    if (bike.seat_height) specs.seatHeight = bike.seat_height;
    if (bike.ground_clearance) specs.groundClearance = bike.ground_clearance;
    if (bike.total_length) specs.overallLength = bike.total_length;
    if (bike.total_width) specs.overallWidth = bike.total_width;
    if (bike.total_height) specs.overallHeight = bike.total_height;
    if (bike.total_weight) {
      const parsed = parseFloat(bike.total_weight);
      if (!isNaN(parsed)) specs.wetWeightLbs = parsed;
    }
    const ft = deriveFuelType(bike.fuel_system);
    if (ft) specs.fuelType = ft;

    let fuelCapacity: number | undefined;
    if (bike.fuel_capacity) {
      const parsed = parseFloat(bike.fuel_capacity);
      if (!isNaN(parsed)) {
        fuelCapacity = parsed;
        specs.fuelCapacityGal = parsed;
      }
    }

    return { specs, fuelCapacity };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// All fillable spec field keys and their expected types for the Gemini prompt
const SPEC_FIELD_HINTS: Record<string, string> = {
  tirePressureFrontPsi: 'number (psi)',
  tirePressureRearPsi: 'number (psi)',
  tireFrontSize: 'string e.g. "90/90-21"',
  tireRearSize: 'string e.g. "150/70-R17"',
  fuelType: '"Regular" | "Premium" | "E85"',
  fuelCapacityGal: 'number (US gallons)',
  engineDisplacement: 'string e.g. "888cc"',
  engineType: 'string e.g. "Inline 3-cylinder"',
  oilType: 'string e.g. "10W-40"',
  oilCapacityQt: 'number (US quarts)',
  maxLoadLbs: 'number (lbs)',
  seatHeight: 'string e.g. "33.9 in"',
  groundClearance: 'string e.g. "9.8 in"',
  overallLength: 'string e.g. "90.2 in"',
  overallWidth: 'string e.g. "35.8 in"',
  overallHeight: 'string e.g. "57.9 in"',
  wetWeightLbs: 'number (lbs)',
};

function getMissingFields(current: BikeSpecs): string[] {
  return Object.keys(SPEC_FIELD_HINTS).filter((k) => {
    const v = (current as any)[k];
    return v === null || v === undefined || v === '';
  });
}

async function lookupGemini(
  year: string,
  make: string,
  model: string,
  missingFields: string[],
): Promise<Partial<BikeSpecs> | null> {
  if (!GEMINI_KEY || missingFields.length === 0) return null;

  const fieldList = missingFields
    .map((f) => `"${f}": ${SPEC_FIELD_HINTS[f] ?? 'value'} or null`)
    .join('\n');

  const prompt = `You are a motorcycle specifications database.
Return ONLY a valid JSON object. No explanation, no markdown, no backticks.
Only include the fields listed below. Use null if genuinely unknown.

Motorcycle: ${year} ${make} ${model}

Return ONLY these fields:
${fieldList}`;

  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 2048 },
  });

  const endpoints = [
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
    'https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent',
  ];

  for (const endpoint of endpoints) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15_000);
      const resp = await fetch(`${endpoint}?key=${GEMINI_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!resp.ok) continue;
      const json = await resp.json();
      const raw: string = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      if (!raw.trim()) continue;

      // Strip markdown fences and clean malformed JSON
      let cleaned = raw
        .replace(/```json\s*/gi, '')
        .replace(/```\s*/gi, '')
        .trim();
      // Remove trailing commas before } or ]
      cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');
      if (!cleaned) continue;
      // Bail if response isn't JSON
      if (!cleaned.startsWith('{') && !cleaned.startsWith('[')) {
        console.error('[Specs] Gemini response is not JSON:', cleaned.slice(0, 200));
        continue;
      }

      // Fix truncated JSON — find last complete object/array boundary
      const lastBrace = cleaned.lastIndexOf('}');
      const lastBracket = cleaned.lastIndexOf(']');
      const lastValid = Math.max(lastBrace, lastBracket);
      if (lastValid > 0) cleaned = cleaned.substring(0, lastValid + 1);

      const parsed = JSON.parse(cleaned);
      const result: Partial<BikeSpecs> = {};
      for (const [key, value] of Object.entries(parsed)) {
        if (value !== null && value !== undefined && missingFields.includes(key)) {
          (result as any)[key] = value;
        }
      }
      return result;
    } catch (e: any) {
      if (e.name === 'AbortError') continue;
      console.warn('[Specs] Gemini response truncated or malformed, retrying...', e.message);
      continue;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Inline editable row
// ---------------------------------------------------------------------------

function SpecRow({
  def,
  specs,
  onSave,
}: {
  def: SpecRowDef;
  specs: BikeSpecs;
  onSave: (patch: Partial<BikeSpecs>) => void;
}) {
  const { theme } = useTheme();
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const startEditing = useCallback(() => {
    if (def.isFuelType) return; // handled by segmented picker
    const keys = def.editKeys ?? [];
    const initial: Record<string, string> = {};
    for (const k of keys) {
      const val = (specs as any)[k];
      initial[k] = val != null ? String(val) : '';
    }
    setDrafts(initial);
    setEditing(true);
  }, [def, specs]);

  const handleBlur = useCallback(() => {
    const patch: Partial<BikeSpecs> = {};
    for (const k of def.editKeys ?? []) {
      const raw = drafts[k]?.trim() ?? '';
      if (def.isNumeric) {
        const num = parseFloat(raw);
        (patch as any)[k] = isNaN(num) ? undefined : num;
      } else {
        (patch as any)[k] = raw || undefined;
      }
    }
    onSave(patch);
    setEditing(false);
  }, [drafts, def, onSave]);

  // Fuel type segmented picker
  if (def.isFuelType) {
    return (
      <View style={[st.row, { borderBottomColor: theme.border }]}>
        <Feather name={def.icon as any} size={14} color={theme.textMuted} />
        <Text style={[st.rowLabel, { color: theme.textSecondary }]}>{def.label}</Text>
        <View style={st.fuelPicker}>
          {FUEL_OPTIONS.map((opt) => {
            const active = specs.fuelType === opt;
            return (
              <Pressable
                key={opt}
                style={[
                  st.fuelOption,
                  { borderColor: theme.border },
                  active && { borderColor: theme.red, backgroundColor: theme.red + '1F' },
                ]}
                onPress={() => onSave({ fuelType: opt })}
              >
                <Text style={[st.fuelOptionText, { color: theme.textMuted }, active && { color: theme.red, fontWeight: '700' }]}>
                  {opt}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  }

  const displayValue = def.getValue(specs);

  if (editing) {
    const keys = def.editKeys ?? [];
    const labels = def.editLabels ?? [];
    return (
      <View style={[st.row, st.rowEditing, { borderBottomColor: theme.border }]}>
        <Feather name={def.icon as any} size={14} color={theme.textMuted} />
        <Text style={[st.rowLabel, { color: theme.textSecondary }]}>{def.label}</Text>
        <View style={st.editInputs}>
          {keys.map((k, i) => (
            <TextInput
              key={k}
              style={[st.editInput, { color: theme.textPrimary, borderColor: theme.border, backgroundColor: theme.inputBg }]}
              value={drafts[k] ?? ''}
              onChangeText={(t) => setDrafts((d) => ({ ...d, [k]: t }))}
              onBlur={handleBlur}
              onSubmitEditing={handleBlur}
              placeholder={labels[i] || def.label}
              placeholderTextColor={theme.inputPlaceholder}
              keyboardType={def.isNumeric ? 'numeric' : 'default'}
              autoFocus={i === 0}
              returnKeyType="done"
              selectTextOnFocus
            />
          ))}
        </View>
      </View>
    );
  }

  return (
    <Pressable style={[st.row, { borderBottomColor: theme.border }]} onPress={startEditing}>
      <Feather name={def.icon as any} size={14} color={theme.textMuted} />
      <Text style={[st.rowLabel, { color: theme.textSecondary }]}>{def.label}</Text>
      <Text style={[st.rowValue, { color: theme.textPrimary }]} numberOfLines={1}>
        {displayValue}
      </Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function SpecificationsSection({ bike, onCountChange }: { bike: Bike; onCountChange?: (n: number) => void }) {
  const { theme } = useTheme();
  const collapsed = false; // controlled by parent garage section
  const [specs, setSpecs] = useState<BikeSpecs>(bike.specs ?? {});
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupDone, setLookupDone] = useState(specs.specsLookedUp === true);
  const [lookedUpAt, setLookedUpAt] = useState<string | null>(specs.specsLookedUpAt ?? null);
  const hasTriggered = useRef(false);

  // Sync when bike changes
  useEffect(() => {
    const s = bike.specs ?? {};
    setSpecs(s);
    setLookupDone(s.specsLookedUp === true);
    setLookedUpAt(s.specsLookedUpAt ?? null);
    hasTriggered.current = false;
  }, [bike.id]);

  // Auto-lookup on first expand if not already done (or if previous lookup returned empty)
  useEffect(() => {
    if (collapsed || lookingUp || hasTriggered.current) return;
    const hasData = getMissingFields(specs).length < Object.keys(SPEC_FIELD_HINTS).length;
    if (!lookupDone || !hasData) {
      hasTriggered.current = true;
      performLookup();
    }
  }, [collapsed, lookupDone, lookingUp]);

  async function saveSpecs(updated: BikeSpecs) {
    setSpecs(updated);
    await supabase.from('bikes').update({ specs: updated }).eq('id', bike.id);
  }

  function handleFieldSave(patch: Partial<BikeSpecs>) {
    const updated: BikeSpecs = { ...specs, ...patch, specsSource: 'manual' };
    saveSpecs(updated);
  }

  async function performLookup() {
    setLookingUp(true);
    const year = String(bike.year ?? '');
    const make = bike.make ?? '';
    const model = bike.model ?? '';

    let merged: BikeSpecs = { ...specs };
    // Clear the flag so a fresh lookup populates cleanly
    delete merged.specsLookedUp;
    delete merged.specsSource;
    let source: BikeSpecs['specsSource'] = undefined;

    try {
      // 1. Try API Ninjas
      const apiResult = await lookupApiNinjas(make, model, year);
      if (apiResult) {
        source = 'api';
        for (const [k, v] of Object.entries(apiResult.specs)) {
          if (v != null && (merged as any)[k] == null) {
            (merged as any)[k] = v;
          }
        }
        // Fuel capacity writeback
        if (apiResult.fuelCapacity && !bike.fuelCapacity) {
          await supabase
            .from('bikes')
            .update({ fuelCapacity: apiResult.fuelCapacity, fuelCapacityUnit: 'gallons' })
            .eq('id', bike.id);
        }
      }

      // 2. Gemini fallback for any remaining gaps
      const missing = getMissingFields(merged);
      if (missing.length > 0) {
        const geminiResult = await lookupGemini(year, make, model, missing);
        if (geminiResult) {
          if (!source) source = 'gemini';
          for (const [k, v] of Object.entries(geminiResult)) {
            if (v != null && (merged as any)[k] == null) {
              (merged as any)[k] = v;
            }
          }
        }
      }
    } catch (e) {
      console.error('[Specs] Lookup error:', e);
    }

    merged.specsLookedUp = true;
    merged.specsLookedUpAt = new Date().toISOString();
    if (source) merged.specsSource = source;

    await saveSpecs(merged);
    setLookupDone(true);
    setLookedUpAt(merged.specsLookedUpAt ?? null);
    setLookingUp(false);
  }

  const bikeDesc = `${bike.year ?? ''} ${bike.make ?? ''} ${bike.model ?? ''}`.trim();
  const specCount = [...OPERATIONAL_ROWS, ...DIMENSION_ROWS].filter(
    (r) => r.getValue(specs) !== '\u2014',
  ).length;

  useEffect(() => { onCountChange?.(specCount); }, [specCount]);

  return (
    <View style={st.root}>
        <View>
          {/* Action row with refresh button */}
          <View style={st.actionRow}>
            <View style={st.actionLeft}>
              {lookupDone && (
                <Text style={[st.checkedAt, { color: theme.textMuted }]}>
                  {lookedUpAt ? `Last checked ${new Date(lookedUpAt).toLocaleDateString()}` : 'Specs loaded'}
                </Text>
              )}
            </View>
            {lookupDone && !lookingUp && (
              <Pressable
                style={[st.refreshBtn, { backgroundColor: theme.red }]}
                onPress={() => {
                  hasTriggered.current = true;
                  performLookup();
                }}
                hitSlop={6}
              >
                <Feather name="refresh-cw" size={12} color={theme.white} />
                <Text style={st.refreshBtnText}>REFRESH</Text>
              </Pressable>
            )}
          </View>

          {/* Loading state / empty hint */}
          {lookingUp ? (
            <View style={st.lookupBox}>
              <ActivityIndicator size="small" color={theme.red} />
              <Text style={[st.lookupText, { color: theme.textSecondary }]}>
                Looking up specs for {bikeDesc}...
              </Text>
            </View>
          ) : lookupDone && specCount === 0 ? (
            <View style={[st.hintBanner, { backgroundColor: '#FF980018', borderColor: '#FF9800' }]}>
              <Feather name="info" size={13} color="#FF9800" />
              <Text style={[st.hintText, { color: '#FF9800' }]}>
                Specs not found automatically. Tap any value to enter manually or make sure your bike title matches the manufacturer's exact model name (e.g. "R 1250 GS" not "GS 1250").
              </Text>
            </View>
          ) : null}

          {/* Spec rows — operational */}
          {OPERATIONAL_ROWS.map((def) => (
            <SpecRow key={def.key} def={def} specs={specs} onSave={handleFieldSave} />
          ))}

          {/* Spec rows — dimensions */}
          {DIMENSION_ROWS.map((def) => (
            <SpecRow key={def.key} def={def} specs={specs} onSave={handleFieldSave} />
          ))}

          {/* Empty hint — removed, moved to top */}
        </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const st = StyleSheet.create({
  root: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 0 },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.7 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  countBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  countText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  lookupBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
  },
  lookupText: { fontSize: 12 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowEditing: {
    flexWrap: 'wrap',
  },
  rowLabel: { fontSize: 12, fontWeight: '600', width: 110 },
  rowValue: { flex: 1, fontSize: 13, textAlign: 'right' },

  editInputs: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
  },
  editInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
  },

  fuelPicker: { flex: 1, flexDirection: 'row', justifyContent: 'flex-end', gap: 4 },
  fuelOption: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  fuelOptionText: { fontSize: 11, fontWeight: '600' },

  divider: { height: 1, marginVertical: 12 },

  hintBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginVertical: 12,
  },
  hintText: { flex: 1, fontSize: 12, lineHeight: 17 },

  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    marginTop: 12,
    marginBottom: 12,
  },
  actionLeft: { flex: 1, gap: 2 },
  checkedAt: { fontSize: 10, letterSpacing: 0.2 },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  refreshBtnText: { color: '#fff', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
});
