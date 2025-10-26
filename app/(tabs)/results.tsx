import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import Constants from 'expo-constants';
import { ThemedText } from '@/components/themed-text';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { PanGestureHandler, State } from 'react-native-gesture-handler';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

type ThoughtItem = {
  id: string;
  title?: string | null;
  content: string;
  summary?: string | null;
  tags: string[];
  entities: string[];
  interpretation?: string | null;
  created_at: string;
  source: string;
};

export default function ResultsScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const initialQuery = useMemo(() => String(params.query || params.q || '').trim(), [params]);
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<ThoughtItem[]>([]);
  const [loading, setLoading] = useState(false);
  const switchingRef = useRef<boolean>(false);
  const scrollRef = useRef<any>(null);

  const backendConfig = useCallback(() => {
    const baseUrl = ((Constants.expoConfig?.extra as any)?.backendUrl as string) || (process.env.BACKEND_URL as string) || 'http://127.0.0.1:8082';
    const apiKey = ((Constants.expoConfig?.extra as any)?.backendApiKey as string) || (process.env.API_KEY as string) || '';
    const userId = ((Constants.expoConfig?.extra as any)?.backendUserId as string) || (process.env.BACKEND_USER_ID as string) || '';
    return { baseUrl, apiKey, userId };
  }, []);

  const fetchResults = useCallback(async (q: string) => {
    if (!q) {
      setResults([]);
      return;
    }
    try {
      setLoading(true);
      const { baseUrl, apiKey, userId } = backendConfig();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (apiKey) headers['X-API-Key'] = apiKey;
      if (userId) headers['X-User-Id'] = userId;
      const res = await fetch(`${baseUrl}/v1/assist-search-full`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ query: q, topK: 20 }),
      });
      const ct = res.headers.get('content-type') || '';
      if (!res.ok || !ct.includes('application/json')) {
        setResults([]);
        setLoading(false);
        return;
      }
      const js = await res.json();
      let items: any[] = [];
      if (Array.isArray(js)) items = js as any[];
      else if (Array.isArray(js?.results)) items = js.results as any[];
      setResults(items as ThoughtItem[]);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [backendConfig]);

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    if (query) fetchResults(query);
    else setResults([]);
  }, [query, fetchResults]);

  const onPanGestureEvent = useCallback((e: any) => {
    const ty = e?.nativeEvent?.translationY ?? 0;
    const vy = e?.nativeEvent?.velocityY ?? 0;
    if (!switchingRef.current && ty > 60 && vy > 150) {
      switchingRef.current = true;
      router.replace('/(tabs)/explore');
    }
  }, [router]);

  const onPanStateChange = useCallback((e: any) => {
    const st = e?.nativeEvent?.state;
    if (st === State.END || st === State.CANCELLED || st === State.FAILED) {
      switchingRef.current = false;
    }
  }, []);

  return (
    <PanGestureHandler onGestureEvent={onPanGestureEvent} onHandlerStateChange={onPanStateChange} simultaneousHandlers={scrollRef} activeOffsetY={[-40, 40]}>
      <View style={styles.container}>
      <View style={styles.background} />

      <View style={styles.brandingContainer}>
        <ThemedText style={styles.brandingText}>Library</ThemedText>
      </View>

      <View style={styles.headerRow}>
        <ThemedText style={styles.headerQuery}>
          {query ? `“${query}”` : ''}
        </ThemedText>
        {loading ? <ThemedText style={styles.loading}>loading…</ThemedText> : null}
      </View>

      <ScrollView ref={scrollRef} style={styles.content} contentContainerStyle={styles.contentContainer}>
        {results.length === 0 && !loading ? (
          <View style={styles.placeholderContainer}>
            <ThemedText style={styles.placeholderText}>no results</ThemedText>
          </View>
        ) : (
          <View style={{ paddingVertical: 6 }}>
            {results.map((r) => (
              <View key={r.id} style={styles.card}>
                <ThemedText style={styles.cardTitle}>{r.title || '(untitled)'}</ThemedText>
                <ThemedText style={styles.cardContent}>{r.content}</ThemedText>
                {Array.isArray(r.tags) && r.tags.length > 0 ? (
                  <View style={styles.tagRow}>
                    {r.tags.map((t, idx) => (
                      <View key={`${r.id}-tag-${idx}`} style={styles.tagChip}>
                        <ThemedText style={styles.tagText}>#{t}</ThemedText>
                      </View>
                    ))}
                  </View>
                ) : null}
                <ThemedText style={styles.cardMeta}>{new Date(r.created_at).toLocaleString()} • {r.source}</ThemedText>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
      </View>
    </PanGestureHandler>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  background: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    backgroundColor: '#D4C4B0',
  },
  brandingContainer: {
    position: 'absolute',
    top: 70,
    left: 24,
  },
  brandingText: {
    fontSize: 28,
    fontWeight: '500',
    color: '#FFFFFF',
    letterSpacing: 0,
  },
  headerRow: {
    marginTop: 140,
    paddingHorizontal: 24,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerQuery: {
    fontSize: 18,
    fontWeight: '500',
    color: '#FFFFFF',
    opacity: 0.9,
  },
  loading: {
    fontSize: 14,
    color: '#FFFFFF',
    opacity: 0.8,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  placeholderContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
  },
  placeholderText: {
    fontSize: 15,
    opacity: 0.3,
    fontWeight: '300',
    letterSpacing: 2,
    textTransform: 'lowercase',
  },
  card: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 10,
    backgroundColor: 'transparent',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 6,
    color: '#111827',
  },
  cardContent: {
    fontSize: 14,
    opacity: 0.9,
    marginBottom: 8,
    color: '#111827',
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  tagChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(99,102,241,0.12)',
  },
  tagText: {
    fontSize: 12,
    opacity: 0.85,
  },
  cardMeta: {
    fontSize: 12,
    opacity: 0.6,
    color: '#111827',
  },
});
