import { memo, useCallback, useEffect, useState } from 'react';
import {
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { FeedCardSkeleton } from '../../components/common/SkeletonLoader';
import NetworkError from '../../components/common/NetworkError';
import { Colors } from '../../lib/theme';

// ---------------------------------------------------------------------------
// Types + fetch
// ---------------------------------------------------------------------------

interface Article {
  id: string;
  title: string;
  thumbnail: string | null;
  subreddit: string;
  score: number;
  numComments: number;
  url: string;
  created: number;
}

async function fetchFeed(): Promise<Article[]> {
  const res = await fetch(
    'https://www.reddit.com/r/motorcycles/hot.json?limit=20&raw_json=1',
    { headers: { 'User-Agent': 'timetomoto/1.0' } },
  );
  if (!res.ok) throw new Error('Network error');
  const json = await res.json();
  return (json.data?.children ?? []).map((c: any) => ({
    id: c.data.id,
    title: c.data.title,
    thumbnail:
      c.data.preview?.images?.[0]?.source?.url?.replace(/&amp;/g, '&') ??
      (c.data.thumbnail?.startsWith('http') ? c.data.thumbnail : null),
    subreddit: c.data.subreddit_name_prefixed,
    score: c.data.score,
    numComments: c.data.num_comments,
    url: `https://www.reddit.com${c.data.permalink}`,
    created: c.data.created_utc,
  }));
}

function timeAgo(utc: number) {
  const diff = Math.floor((Date.now() / 1000 - utc) / 60);
  if (diff < 60)   return `${diff}m ago`;
  if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
  return `${Math.floor(diff / 1440)}d ago`;
}

// ---------------------------------------------------------------------------
// Article card — memoized
// ---------------------------------------------------------------------------

const ArticleCard = memo(function ArticleCard({ article }: { article: Article }) {
  function handlePress() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Linking.openURL(article.url);
  }

  return (
    <Pressable
      style={({ pressed }) => [s.card, pressed && { opacity: 0.82 }]}
      onPress={handlePress}
      accessibilityLabel={`Open article: ${article.title}`}
      accessibilityRole="link"
    >
      {article.thumbnail && (
        <Image
          source={{ uri: article.thumbnail }}
          style={s.cardImage}
          contentFit="cover"
          transition={250}
        />
      )}
      <View style={s.cardBody}>
        <Text style={s.cardSource}>{article.subreddit.toUpperCase()}</Text>
        <Text style={s.cardTitle} numberOfLines={3}>{article.title}</Text>
        <View style={s.cardMeta}>
          <View style={s.metaItem}>
            <Feather name="arrow-up" size={11} color={Colors.TEXT_SECONDARY} />
            <Text style={s.metaText}>{article.score.toLocaleString()}</Text>
          </View>
          <View style={s.metaItem}>
            <Feather name="message-circle" size={11} color={Colors.TEXT_SECONDARY} />
            <Text style={s.metaText}>{article.numComments}</Text>
          </View>
          <Text style={s.metaTime}>{timeAgo(article.created)}</Text>
        </View>
      </View>
    </Pressable>
  );
});

// ---------------------------------------------------------------------------
// FeedScreen
// ---------------------------------------------------------------------------

type LoadState = 'loading' | 'done' | 'error';

export default function FeedScreen() {
  const [state, setState]           = useState<LoadState>('loading');
  const [articles, setArticles]     = useState<Article[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setState('loading');
    try {
      const data = await fetchFeed();
      setArticles(data);
      setState('done');
    } catch {
      setState('error');
    }
  }, []);

  useEffect(() => { load(); }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  }, [load]);

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.header}>
        <Text style={s.heading}>FEED</Text>
        <Text style={s.subheading}>r/motorcycles</Text>
      </View>

      {state === 'error' ? (
        <NetworkError onRetry={() => load()} />
      ) : state === 'loading' ? (
        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          {[1, 2, 3].map((i) => <FeedCardSkeleton key={i} />)}
        </ScrollView>
      ) : articles.length === 0 ? (
        <View style={s.empty}>
          <Feather name="rss" size={36} color={Colors.TTM_BORDER} />
          <Text style={s.emptyTitle}>Nothing in the feed</Text>
          <Text style={s.emptyBody}>Pull down to refresh</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={s.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.TTM_RED} />
          }
        >
          {articles.map((a) => <ArticleCard key={a.id} article={a} />)}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.TTM_DARK },

  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.TTM_BORDER,
  },
  heading:    { color: Colors.TEXT_PRIMARY, fontSize: 20, fontWeight: '700', letterSpacing: 4 },
  subheading: { color: Colors.TEXT_SECONDARY, fontSize: 12, letterSpacing: 0.5 },

  content: { padding: 16, paddingBottom: 40 },

  card: {
    backgroundColor: Colors.TTM_CARD,
    borderWidth: 1,
    borderColor: Colors.TTM_BORDER,
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 14,
  },
  cardImage: { width: '100%', height: 180, backgroundColor: Colors.TTM_PANEL },
  cardBody:  { padding: 14, gap: 6 },
  cardSource: {
    color: Colors.TTM_RED,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 2,
  },
  cardTitle: {
    color: Colors.TEXT_PRIMARY,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 22,
  },
  cardMeta:  { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  metaItem:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText:  { color: Colors.TEXT_SECONDARY, fontSize: 11 },
  metaTime:  { color: Colors.TEXT_SECONDARY, fontSize: 11, marginLeft: 'auto' },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  emptyTitle: { color: Colors.TEXT_PRIMARY, fontSize: 16, fontWeight: '600' },
  emptyBody:  { color: Colors.TEXT_SECONDARY, fontSize: 13 },
});
