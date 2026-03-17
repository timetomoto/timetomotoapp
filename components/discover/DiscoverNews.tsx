import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import * as Haptics from 'expo-haptics';
import { FeedCardSkeleton } from '../common/SkeletonLoader';
import NetworkError from '../common/NetworkError';
import { useDiscoverStore, type NewsCategory } from '../../lib/discoverStore';
import { useTheme } from '../../lib/useTheme';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FILTER_PILLS: { label: string; value: NewsCategory }[] = [
  { label: 'ALL', value: 'all' },
  { label: 'ADV', value: 'adv' },
  { label: 'SPORT', value: 'sport' },
  { label: 'TOURING', value: 'touring' },
  { label: 'CRUISER', value: 'cruiser' },
  { label: 'GEAR', value: 'gear' },
  { label: 'SAFETY', value: 'safety' },
  { label: 'EVENTS', value: 'events' },
];

const CATEGORY_LABELS: Record<string, string> = {
  all: 'ALL',
  adv: 'ADV',
  sport: 'SPORT',
  touring: 'TOURING',
  cruiser: 'CRUISER',
  gear: 'GEAR',
  safety: 'SAFETY',
  moto_news: 'NEWS',
  events: 'EVENTS',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffMin < 1440) return `${Math.floor(diffMin / 60)}h ago`;
  return `${Math.floor(diffMin / 1440)}d ago`;
}

// ---------------------------------------------------------------------------
// NewsCard
// ---------------------------------------------------------------------------

const NewsCard = memo(function NewsCard({
  title,
  summary,
  source,
  category,
  imageUrl,
  publishedAt,
  url,
}: {
  title: string;
  summary: string;
  source: string;
  category: NewsCategory;
  imageUrl: string | null;
  publishedAt: Date;
  url: string;
}) {
  const { theme } = useTheme();
  const [imgError, setImgError] = useState(false);

  function handlePress() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    WebBrowser.openBrowserAsync(url, {
      toolbarColor: theme.bgPanel,
      controlsColor: theme.red,
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
    });
  }

  const catLabel = CATEGORY_LABELS[category] ?? category.toUpperCase();

  return (
    <Pressable
      style={({ pressed }) => [
        s.card,
        { backgroundColor: theme.bgCard, borderColor: theme.border },
        pressed && { opacity: 0.82 },
      ]}
      onPress={handlePress}
      accessibilityLabel={`Read article: ${title}`}
      accessibilityRole="link"
    >
      {imageUrl && !imgError && (
        <Image
          source={{ uri: imageUrl }}
          style={s.cardImage}
          resizeMode="cover"
          onError={() => setImgError(true)}
        />
      )}

      <View style={s.cardBody}>
        {/* Source · Category */}
        <Text style={[s.cardMeta, { color: theme.textMuted }]}>
          {source.toUpperCase()} · {catLabel}
        </Text>

        {/* Title */}
        <Text style={[s.cardTitle, { color: theme.textPrimary }]} numberOfLines={2}>
          {title}
        </Text>

        {/* Summary */}
        {!!summary && (
          <Text style={[s.cardSummary, { color: theme.textSecondary }]} numberOfLines={2}>
            {summary}
          </Text>
        )}

        {/* Relative time */}
        <Text style={[s.cardTime, { color: theme.textMuted }]}>{relativeTime(publishedAt)}</Text>
      </View>
    </Pressable>
  );
});

// ---------------------------------------------------------------------------
// DiscoverNews
// ---------------------------------------------------------------------------

type LoadState = 'loading' | 'done' | 'error';

export default function DiscoverNews() {
  const { theme } = useTheme();
  const {
    newsItems,
    activeNewsFilter,
    newsLastFetched,
    newsError,
    fetchNews,
    setNewsFilter,
  } = useDiscoverStore();
  const [loadState, setLoadState] = useState<LoadState>(newsLastFetched ? 'done' : 'loading');
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [manualRefreshing, setManualRefreshing] = useState(false);

  const load = useCallback(
    async (isRefresh = false) => {
      if (!isRefresh) setLoadState('loading');
      try {
        await fetchNews();
        const { newsError: err } = useDiscoverStore.getState();
        setLoadState(err ? 'error' : 'done');
      } catch {
        setLoadState('error');
      }
    },
    [fetchNews],
  );

  useEffect(() => {
    load();
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    useDiscoverStore.setState({ newsLastFetched: null });
    await load(true);
    setRefreshing(false);
  }, [load]);

  const handleManualRefresh = useCallback(async () => {
    setManualRefreshing(true);
    useDiscoverStore.setState({ newsLastFetched: null });
    await load(true);
    setManualRefreshing(false);
  }, [load]);

  const filtered = useMemo(() => {
    let items = newsItems;

    // Category filter
    if (activeNewsFilter !== 'all') {
      items = items.filter((item) => item.category === activeNewsFilter);
    }

    // Search filter
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      items = items.filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          item.summary.toLowerCase().includes(q),
      );
    }

    return items;
  }, [newsItems, activeNewsFilter, searchQuery]);

  if (loadState === 'error') {
    return (
      <NetworkError
        onRetry={() => {
          useDiscoverStore.setState({ newsLastFetched: null, newsError: null });
          load();
        }}
        message={newsError ?? undefined}
      />
    );
  }

  if (loadState === 'loading') {
    return (
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <View style={s.loadingRow}>
          <ActivityIndicator size="small" color={theme.red} />
          <Text style={[s.loadingText, { color: theme.textSecondary }]}>Loading latest news…</Text>
        </View>
        {[1, 2, 3].map((i) => (
          <FeedCardSkeleton key={i} />
        ))}
      </ScrollView>
    );
  }

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.red} />}
    >
      {/* Search bar + refresh */}
      <View style={s.searchSection}>
        <View style={[s.searchRow, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
          <Feather name="search" size={14} color={theme.textMuted} />
          <TextInput
            style={[s.searchInput, { color: theme.textPrimary }]}
            placeholder="Search news..."
            placeholderTextColor={theme.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
              <Feather name="x" size={14} color={theme.textMuted} />
            </Pressable>
          )}
        </View>
        <Pressable
          onPress={handleManualRefresh}
          disabled={manualRefreshing}
          style={[s.refreshBtn, { borderColor: theme.border }]}
          accessibilityLabel="Refresh news"
          accessibilityRole="button"
        >
          {manualRefreshing ? (
            <ActivityIndicator size="small" color={theme.textSecondary} />
          ) : (
            <Feather name="refresh-cw" size={14} color={theme.textSecondary} />
          )}
        </Pressable>
      </View>

      {/* Filter pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.pillsRow}
        style={[s.pillsContainer, { borderBottomColor: theme.border }]}
      >
        {FILTER_PILLS.map((pill) => {
          const active = activeNewsFilter === pill.value;
          return (
            <Pressable
              key={pill.value}
              style={[
                s.pill,
                active
                  ? { backgroundColor: theme.red, borderColor: theme.red }
                  : { backgroundColor: theme.pillBg, borderColor: theme.pillBorder },
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setNewsFilter(pill.value);
              }}
              accessibilityLabel={`Filter by ${pill.label}`}
              accessibilityRole="button"
            >
              <Text style={[s.pillText, active ? s.pillTextActive : { color: theme.pillText }]}>{pill.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* List */}
      <View style={s.content}>
        {filtered.length === 0 ? (
          <View style={s.empty}>
            <Text style={[s.emptyText, { color: theme.textSecondary }]}>
              {searchQuery.trim()
                ? 'No news matching your search'
                : activeNewsFilter === 'all'
                  ? 'No articles found. Pull down to refresh.'
                  : `Nothing in ${CATEGORY_LABELS[activeNewsFilter] ?? activeNewsFilter} right now`}
            </Text>
          </View>
        ) : (
          filtered.map((item) => <NewsCard key={item.id} {...item} />)
        )}
      </View>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const s = StyleSheet.create({
  searchSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  searchRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    padding: 0,
  },
  refreshBtn: {
    borderWidth: 1,
    borderRadius: 6,
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
    width: 36,
    height: 36,
  },

  pillsContainer: {
    borderBottomWidth: 1,
  },
  pillsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  pill: {
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
  },
  pillText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  pillTextActive: { color: '#fff' },

  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 16,
  },
  loadingText: {
    fontSize: 13,
    letterSpacing: 0.2,
  },
  content: { padding: 16, paddingBottom: 40 },

  card: {
    borderWidth: 1,
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 14,
  },
  cardImage: {
    width: '100%',
    height: 180,
  },
  cardBody: {
    padding: 14,
    gap: 6,
  },
  cardMeta: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
  },
  cardSummary: {
    fontSize: 13,
    lineHeight: 19,
  },
  cardTime: {
    fontSize: 11,
    marginTop: 2,
  },

  empty: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
    textAlign: 'center',
  },
});
