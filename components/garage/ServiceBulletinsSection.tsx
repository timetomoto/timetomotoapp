import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { useTheme } from '../../lib/useTheme';
import { useGarageStore, type Bike } from '../../lib/store';
import {
  useServiceBulletinsStore,
  bulletinKey,
  type NHTSARecall,
  type NHTSAComplaint,
} from '../../lib/serviceBulletinsStore';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tsbSearchUrl(make: string, model: string): string {
  const m = make.replace(/\s+/g, '-');
  const mo = model.replace(/\s+/g, '-');
  return `https://www.tsbsearch.com/${encodeURIComponent(m)}/${encodeURIComponent(mo)}`;
}

function formatDate(raw: string | undefined): string {
  if (!raw) return '';
  // NHTSA dates can be "20230315" or ISO strings
  if (/^\d{8}$/.test(raw)) {
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  }
  try { return new Date(raw).toLocaleDateString(); } catch { return raw; }
}

// ---------------------------------------------------------------------------
// Recall card
// ---------------------------------------------------------------------------

function RecallCard({ recall }: { recall: NHTSARecall }) {
  const { theme } = useTheme();
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={[s.bulletinCard, { backgroundColor: theme.bgCard, borderColor: theme.red + '44', borderLeftColor: theme.red }]}>
      <View style={s.bulletinBadgeRow}>
        <View style={[s.badge, { backgroundColor: theme.red + '22', borderColor: theme.red + '55' }]}>
          <Text style={[s.badgeText, { color: theme.red }]}>RECALL</Text>
        </View>
        <Text style={[s.bulletinId, { color: theme.textMuted }]}>#{recall.NHTSACampaignNumber}</Text>
      </View>

      {!!recall.Component && (
        <Text style={[s.bulletinComponent, { color: theme.textSecondary }]}>{recall.Component}</Text>
      )}

      <Pressable onPress={() => setExpanded((v) => !v)}>
        <Text
          style={[s.bulletinBody, { color: theme.textPrimary }]}
          numberOfLines={expanded ? undefined : 3}
        >
          {recall.Summary}
        </Text>
        {!expanded && (recall.Summary?.length ?? 0) > 120 && (
          <Text style={[s.expandBtn, { color: theme.red }]}>Show more</Text>
        )}
        {expanded && (
          <Text style={[s.expandBtn, { color: theme.red }]}>Show less</Text>
        )}
      </Pressable>

      {!!recall.Remedy && (
        <View style={[s.remedyBox, { backgroundColor: theme.bgPanel, borderColor: theme.border }]}>
          <Text style={[s.remedyLabel, { color: theme.textSecondary }]}>REMEDY</Text>
          <Text style={[s.remedyText, { color: theme.textPrimary }]}>{recall.Remedy}</Text>
        </View>
      )}

      {!!recall.ReportReceivedDate && (
        <Text style={[s.bulletinMeta, { color: theme.textMuted }]}>
          Received {formatDate(recall.ReportReceivedDate)}
          {recall.Manufacturer ? `  ·  ${recall.Manufacturer}` : ''}
        </Text>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Complaint card
// ---------------------------------------------------------------------------

function ComplaintCard({ complaint }: { complaint: NHTSAComplaint }) {
  const { theme } = useTheme();
  const [expanded, setExpanded] = useState(false);

  const hasFlags = complaint.crash || complaint.fire || (complaint.numberOfInjuries ?? 0) > 0 || (complaint.numberOfDeaths ?? 0) > 0;

  return (
    <View style={[s.bulletinCard, { backgroundColor: theme.bgCard, borderColor: '#FF980044', borderLeftColor: '#FF9800' }]}>
      <View style={s.bulletinBadgeRow}>
        <View style={[s.badge, { backgroundColor: '#FF980022', borderColor: '#FF980055' }]}>
          <Text style={[s.badgeText, { color: '#FF9800' }]}>COMPLAINT</Text>
        </View>
        <Text style={[s.bulletinId, { color: theme.textMuted }]}>ODI #{complaint.odiNumber}</Text>
      </View>

      {!!complaint.components && (
        <Text style={[s.bulletinComponent, { color: theme.textSecondary }]}>{complaint.components}</Text>
      )}

      <Pressable onPress={() => setExpanded((v) => !v)}>
        <Text
          style={[s.bulletinBody, { color: theme.textPrimary }]}
          numberOfLines={expanded ? undefined : 3}
        >
          {complaint.summary}
        </Text>
        {!expanded && (complaint.summary?.length ?? 0) > 120 && (
          <Text style={[s.expandBtn, { color: theme.red }]}>Show more</Text>
        )}
        {expanded && (
          <Text style={[s.expandBtn, { color: theme.red }]}>Show less</Text>
        )}
      </Pressable>

      {hasFlags && (
        <View style={s.flagRow}>
          {complaint.crash && (
            <View style={[s.flag, { backgroundColor: theme.red + '22', borderColor: theme.red + '55' }]}>
              <Text style={[s.flagText, { color: theme.red }]}>🚨 Crash</Text>
            </View>
          )}
          {complaint.fire && (
            <View style={[s.flag, { backgroundColor: theme.red + '22', borderColor: theme.red + '55' }]}>
              <Text style={[s.flagText, { color: theme.red }]}>🔥 Fire</Text>
            </View>
          )}
          {(complaint.numberOfInjuries ?? 0) > 0 && (
            <View style={[s.flag, { backgroundColor: '#FF980022', borderColor: '#FF980055' }]}>
              <Text style={[s.flagText, { color: '#FF9800' }]}>⚠️ {complaint.numberOfInjuries} injur{complaint.numberOfInjuries === 1 ? 'y' : 'ies'}</Text>
            </View>
          )}
          {(complaint.numberOfDeaths ?? 0) > 0 && (
            <View style={[s.flag, { backgroundColor: theme.red + '22', borderColor: theme.red + '55' }]}>
              <Text style={[s.flagText, { color: theme.red }]}>☠️ {complaint.numberOfDeaths} death{complaint.numberOfDeaths === 1 ? '' : 's'}</Text>
            </View>
          )}
        </View>
      )}

      {!!complaint.dateOfIncident && (
        <Text style={[s.bulletinMeta, { color: theme.textMuted }]}>Incident: {formatDate(complaint.dateOfIncident)}</Text>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ServiceBulletinsSection({ bike, onCountChange }: { bike: Bike; onCountChange?: (n: number) => void }) {
  const { theme } = useTheme();
  const collapsed = false; // controlled by parent garage section
  const { results, loading, fetchBulletins, clearCache } = useServiceBulletinsStore();

  const year  = String(bike.year ?? '');
  const make  = bike.make ?? '';
  const model = bike.model ?? '';
  const key   = bulletinKey(year, make, model);

  const result  = results[key] ?? null;
  const isLoading = loading[key] ?? false;

  const hasResults = result != null && (result.recalls.length > 0 || result.complaints.length > 0);
  const isEmpty    = result != null && result.recalls.length === 0 && result.complaints.length === 0;
  const totalCount = result ? result.recalls.length + result.complaints.length : 0;

  useEffect(() => { onCountChange?.(totalCount); }, [totalCount]);

  // Auto-check on first expand if no cached data
  const hasTriggered = useRef(false);
  const garageDataRefresh = useGarageStore((s) => s.garageDataRefresh);
  useEffect(() => {
    if (collapsed || isLoading || hasTriggered.current) return;
    if (!result && make && model) {
      hasTriggered.current = true;
      handleCheck();
    }
  }, [collapsed, garageDataRefresh]);

  async function handleCheck() {
    await fetchBulletins(year, make, model);
  }

  async function handleRefresh() {
    clearCache(key);
    await fetchBulletins(year, make, model);
  }

  async function openTSBSearch() {
    const url = tsbSearchUrl(result?.nhtsaMake ?? make, result?.nhtsaModel ?? model);
    await WebBrowser.openBrowserAsync(url);
  }

  async function openNHTSA() {
    const url = `https://www.nhtsa.gov/vehicle/${encodeURIComponent(result?.nhtsaMake ?? make)}/${encodeURIComponent(result?.nhtsaModel ?? model)}/${year}/complaints`;
    await WebBrowser.openBrowserAsync(url);
  }

  return (
    <View style={s.root}>
      <View>
      {/* ── Action button row ── */}
      <View style={s.headerRow}>
        <View style={s.headerLeft}>
          {result && (
            <Text style={[s.checkedAt, { color: theme.textMuted }]}>
              Last checked {new Date(result.fetchedAt).toLocaleDateString()}
            </Text>
          )}
        </View>
        {!isLoading && (
          <Pressable
            style={[s.checkBtn, { backgroundColor: theme.red }]}
            onPress={result ? handleRefresh : handleCheck}
            hitSlop={6}
          >
            <Feather name={result ? 'refresh-cw' : 'shield'} size={12} color={theme.white} />
            <Text style={s.checkBtnText}>{result ? 'REFRESH' : 'CHECK NOW'}</Text>
          </Pressable>
        )}
      </View>

      {/* Data source caption */}
      {result && (
        <Text style={[s.attribution, { color: theme.textMuted }]}>
          Data sourced from NHTSA (nhtsa.gov). Recalls and complaints are from the official U.S. government vehicle safety database. Not all issues may be listed — always check with your dealer for the latest safety information.
        </Text>
      )}

      {/* ── Idle state ── */}
      {!result && !isLoading && (
        <View style={[s.idleBox, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
          <Feather name="alert-circle" size={20} color={theme.border} />
          <Text style={[s.idleText, { color: theme.textSecondary }]}>
            Tap CHECK NOW to search the NHTSA government database for official recalls and owner-reported issues for this bike.
          </Text>
        </View>
      )}

      {/* ── Loading ── */}
      {isLoading && (
        <View style={s.loadingBox}>
          <ActivityIndicator color={theme.red} />
          <Text style={[s.loadingText, { color: theme.textSecondary }]}>Checking NHTSA database…</Text>
        </View>
      )}

      {/* ── No results ── */}
      {isEmpty && !isLoading && (
        <View style={[s.emptyBox, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
          <Feather name="check-circle" size={20} color={theme.green} />
          <Text style={[s.emptyTitle, { color: theme.textPrimary }]}>No recalls or complaints found</Text>
          <Text style={[s.emptySubtitle, { color: theme.textSecondary }]}>
            NHTSA has no records for{' '}
            <Text style={{ fontWeight: '700' }}>{result.nhtsaMake} {result.nhtsaModel}</Text>.
            This may mean NHTSA doesn't cover this make/model, or no issues have been reported. If the name looks wrong, edit your bike's year, make, or model to match the manufacturer's exact name.
          </Text>
          <Pressable style={[s.tsbBtn, { borderColor: theme.border }]} onPress={openTSBSearch}>
            <Feather name="external-link" size={13} color={theme.textSecondary} />
            <Text style={[s.tsbBtnText, { color: theme.textSecondary }]}>Search TSBSearch.com for service bulletins</Text>
          </Pressable>
        </View>
      )}

      {/* ── Results ── */}
      {hasResults && !isLoading && (
        <>
          {/* Recalls */}
          {result.recalls.length > 0 && (
            <>
              <Text style={[s.groupLabel, { color: theme.textSecondary }]}>
                RECALLS ({result.recalls.length})
              </Text>
              {result.recalls.map((r) => (
                <RecallCard key={r.NHTSACampaignNumber} recall={r} />
              ))}
            </>
          )}

          {/* Complaints */}
          {result.complaints.length > 0 && (
            <>
              <Text style={[s.groupLabel, { color: theme.textSecondary, marginTop: result.recalls.length > 0 ? 12 : 0 }]}>
                OWNER COMPLAINTS ({result.complaints.length}{result.totalComplaints > 10 ? ` of ${result.totalComplaints}` : ''})
              </Text>
              {result.complaints.map((c) => (
                <ComplaintCard key={c.odiNumber} complaint={c} />
              ))}
              {result.totalComplaints > 10 && (
                <Pressable style={[s.tsbBtn, { borderColor: theme.border, marginTop: 4 }]} onPress={openNHTSA}>
                  <Feather name="external-link" size={13} color={theme.textSecondary} />
                  <Text style={[s.tsbBtnText, { color: theme.textSecondary }]}>
                    View all {result.totalComplaints} complaints on NHTSA
                  </Text>
                </Pressable>
              )}
            </>
          )}
        </>
      )}

      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const s = StyleSheet.create({
  root: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 0 },

  collapseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  collapseRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  countBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  countText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    marginBottom: 12,
  },
  headerLeft: { flex: 1, gap: 2 },
  sectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  checkedAt: { fontSize: 10, letterSpacing: 0.2 },

  checkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  checkBtnText: { color: '#fff', fontSize: 10, fontWeight: '700', letterSpacing: 1 },

  idleBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    marginBottom: 12,
  },
  idleText: { flex: 1, fontSize: 12, lineHeight: 18 },

  loadingBox: { alignItems: 'center', paddingVertical: 28, gap: 12 },
  loadingText: { fontSize: 12 },

  emptyBox: {
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 8,
    padding: 20,
    marginBottom: 12,
  },
  emptyTitle: { fontSize: 14, fontWeight: '700', letterSpacing: 0.5 },
  emptySubtitle: { fontSize: 12, lineHeight: 18, textAlign: 'center' },

  tsbBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 8,
  },
  tsbBtnText: { fontSize: 11, fontWeight: '600' },

  groupLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 8,
  },

  bulletinCard: {
    borderWidth: 1,
    borderLeftWidth: 3,
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    gap: 6,
  },
  bulletinBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  bulletinId: { fontSize: 10, fontWeight: '600', letterSpacing: 0.2 },
  bulletinComponent: { fontSize: 11, fontWeight: '600', letterSpacing: 0.1 },
  bulletinBody: { fontSize: 12, lineHeight: 18 },
  expandBtn: { fontSize: 11, fontWeight: '600', marginTop: 2 },

  remedyBox: {
    borderWidth: 1,
    borderRadius: 6,
    padding: 10,
    gap: 4,
    marginTop: 2,
  },
  remedyLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  remedyText: { fontSize: 11, lineHeight: 17 },

  bulletinMeta: { fontSize: 10, letterSpacing: 0.1 },

  flagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  flag: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  flagText: { fontSize: 10, fontWeight: '600' },

  attribution: {
    fontSize: 10,
    lineHeight: 14,
    marginTop: 16,
    marginBottom: 8,
    fontStyle: 'italic',
  },
});
