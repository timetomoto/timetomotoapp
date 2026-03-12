import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Haptics from 'expo-haptics';
import { FeedCardSkeleton } from '../common/SkeletonLoader';
import NetworkError from '../common/NetworkError';
import { useDiscoverStore } from '../../lib/discoverStore';
import { useTheme } from '../../lib/useTheme';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FILTER_CATEGORIES = ['ALL', 'ADV', 'GEAR', 'NEWS', 'REVIEWS', 'COMMUNITY', 'INDUSTRY'] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeTime(date: Date): string {
  const diffMs  = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 60)   return `${diffMin}m ago`;
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
  accent,
  tag,
  publishedAt,
  url,
}: {
  title: string;
  summary: string;
  source: string;
  accent: string;
  tag: string;
  publishedAt: Date;
  url: string;
}) {
  const { theme } = useTheme();

  function handlePress() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    WebBrowser.openBrowserAsync(url, {
      toolbarColor: theme.bgPanel,
      controlsColor: theme.red,
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
    });
  }

  return (
    <Pressable
      style={({ pressed }) => [
        s.card,
        { backgroundColor: theme.bgCard, borderColor: theme.border, borderLeftColor: accent },
        pressed && { opacity: 0.82 },
      ]}
      onPress={handlePress}
      accessibilityLabel={`Read article: ${title}`}
      accessibilityRole="link"
    >
      {/* Source row */}
      <View style={s.cardHeader}>
        <View style={[s.sourceBadge, { backgroundColor: accent + '22', borderColor: accent + '55' }]}>
          <Text style={[s.sourceBadgeText, { color: accent }]}>{tag}</Text>
        </View>
        <Text style={[s.sourceName, { color: theme.textSecondary }]}>{source}</Text>
        <Text style={[s.cardTime, { color: theme.textSecondary }]}>{relativeTime(publishedAt)}</Text>
      </View>

      {/* Title */}
      <Text style={[s.cardTitle, { color: theme.textPrimary }]} numberOfLines={3}>{title.toUpperCase()}</Text>

      {/* Summary */}
      {!!summary && (
        <Text style={[s.cardSummary, { color: theme.textMuted }]} numberOfLines={2}>{summary}</Text>
      )}

      {/* Read link */}
      <Text style={[s.readLink, { color: theme.red }]}>READ →</Text>
    </Pressable>
  );
});

// ---------------------------------------------------------------------------
// DiscoverNews
// ---------------------------------------------------------------------------

type LoadState = 'loading' | 'done' | 'error';

export default function DiscoverNews() {
  const { theme } = useTheme();
  const { newsItems, newsFilter, newsLastFetched, fetchNews, setNewsFilter } = useDiscoverStore();
  const [loadState, setLoadState] = useState<LoadState>(newsLastFetched ? 'done' : 'loading');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoadState('loading');
    try {
      await fetchNews();
      setLoadState('done');
    } catch {
      setLoadState('error');
    }
  }, [fetchNews]);

  useEffect(() => { load(); }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    useDiscoverStore.setState({ newsLastFetched: null });
    await load(true);
    setRefreshing(false);
  }, [load]);

  const filtered = useMemo(() => {
    if (newsFilter === 'ALL') return newsItems;
    return newsItems.filter((item) => item.tag === newsFilter);
  }, [newsItems, newsFilter]);

  if (loadState === 'error') {
    return <NetworkError onRetry={() => load()} />;
  }

  if (loadState === 'loading') {
    return (
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {[1, 2, 3].map((i) => <FeedCardSkeleton key={i} />)}
      </ScrollView>
    );
  }

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.red} />
      }
    >
      {/* Category filter pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.pillsRow}
        style={[s.pillsContainer, { borderBottomColor: theme.border }]}
      >
        {FILTER_CATEGORIES.map((cat) => {
          const active = newsFilter === cat;
          return (
            <Pressable
              key={cat}
              style={[
                s.pill,
                active
                  ? { backgroundColor: theme.red, borderColor: theme.red }
                  : { backgroundColor: theme.pillBg, borderColor: theme.pillBorder },
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setNewsFilter(cat);
              }}
              accessibilityLabel={`Filter by ${cat}`}
              accessibilityRole="button"
            >
              <Text style={[s.pillText, active ? s.pillTextActive : { color: theme.pillText }]}>
                {cat}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* List */}
      <View style={s.content}>
        {filtered.length === 0 ? (
          <View style={s.empty}>
            <Text style={[s.emptyText, { color: theme.textSecondary }]}>
              {newsFilter === 'ALL'
                ? 'No articles found. Pull down to refresh.'
                : `Nothing in ${newsFilter} right now`}
            </Text>
          </View>
        ) : (
          filtered.map((item) => (
            <NewsCard key={item.id} {...item} />
          ))
        )}
      </View>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const s = StyleSheet.create({
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
    fontFamily: 'BarlowCondensed',
  },
  pillTextActive: { color: '#fff' },

  content: { padding: 16, paddingBottom: 40 },

  card: {
    borderWidth: 1,
    borderLeftWidth: 3,
    borderRadius: 8,
    padding: 14,
    marginBottom: 12,
    gap: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sourceBadge: {
    borderWidth: 1,
    borderRadius: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  sourceBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.5,
    fontFamily: 'BarlowCondensed',
    textTransform: 'uppercase',
  },
  sourceName: {
    fontSize: 11,
    flex: 1,
  },
  cardTime: {
    fontSize: 10,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 21,
    fontFamily: 'BarlowCondensed',
    textTransform: 'uppercase',
  },
  cardSummary: {
    fontSize: 12,
    lineHeight: 18,
  },
  readLink: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
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
