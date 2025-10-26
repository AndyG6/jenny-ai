import { useFocusEffect } from '@react-navigation/native';
import { Audio } from 'expo-av';
import Constants from 'expo-constants';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Dimensions, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function ConversationScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Array<{ id: string; title?: string | null; content: string; summary?: string | null; tags: string[]; entities: string[]; interpretation?: string | null; created_at: string; source: string }>>([]);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const timerRef = useRef<any>(null);
  const vadIntervalRef = useRef<any>(null);
  const silenceSinceRef = useRef<number>(0);

  const backendConfig = useCallback(() => {
    const baseUrl = ((Constants.expoConfig?.extra as any)?.backendUrl as string) || (process.env.BACKEND_URL as string) || 'http://127.0.0.1:8082';
    const apiKey = ((Constants.expoConfig?.extra as any)?.backendApiKey as string) || (process.env.API_KEY as string) || '';
    const userId = ((Constants.expoConfig?.extra as any)?.backendUserId as string) || (process.env.BACKEND_USER_ID as string) || '';
    return { baseUrl, apiKey, userId };
  }, []);

  // TTS/commentary removed: Explore acts as STT-only and shows cards.

  const fetchResults = useCallback(async (q: string): Promise<any[]> => {
    try {
      const baseUrl = ((Constants.expoConfig?.extra as any)?.backendUrl as string) || (process.env.BACKEND_URL as string) || 'http://127.0.0.1:8082';
      const apiKey = ((Constants.expoConfig?.extra as any)?.backendApiKey as string) || (process.env.API_KEY as string) || '';
      const userId = ((Constants.expoConfig?.extra as any)?.backendUserId as string) || (process.env.BACKEND_USER_ID as string) || '';
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (apiKey) headers['X-API-Key'] = apiKey;
      if (userId) headers['X-User-Id'] = userId;
      const res = await fetch(`${baseUrl}/v1/assist-search-full`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ query: q, topK: 10 }),
      });
      const ct = res.headers.get('content-type') || '';
      if (!res.ok) {
        const txt = await res.text();
        // eslint-disable-next-line no-console
        console.error('assist-search http error', res.status, txt);
        return [];
      }
      if (!ct.includes('application/json')) {
        const txt = await res.text();
        // eslint-disable-next-line no-console
        console.warn('assist-search non-json', txt);
        return [];
      }
      const js = await res.json();
      let items: any[] = [];
      if (Array.isArray(js)) {
        items = js as any[];
      } else if (Array.isArray(js?.results)) {
        items = js.results as any[];
      }
      setResults(items);
      return items;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('assist-search error', e);
      return [];
    }
  }, []);

  const startRecording = useCallback(async () => {
    try {
      // If already recording, just keep going
      if (recordingRef.current) {
        return;
      }
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) return;
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      setIsProcessing(false);
      const recording = new Audio.Recording();
      const baseOpts: any = Audio.RecordingOptionsPresets.HIGH_QUALITY as any;
      const options: any = {
        ...baseOpts,
        isMeteringEnabled: true,
      };
      await recording.prepareToRecordAsync(options);
      await recording.startAsync();
      recordingRef.current = recording;
      setIsRecording(true);
      // Voice-activity detection (iOS metering): stop on ~1600ms of silence or max 10s
      const startTs = Date.now();
      silenceSinceRef.current = 0;
      if (vadIntervalRef.current) { try { clearInterval(vadIntervalRef.current); } catch {} }
      vadIntervalRef.current = setInterval(async () => {
        try {
          const st: any = await recording.getStatusAsync();
          if (!st?.isRecording) return;
          const level = typeof st.metering === 'number' ? st.metering : null; // dBFS, 0 loud, ~-160 silent
          console.log("Lol: " + level + " " + (typeof level));
          if (level !== null) {
            if (level < -35) {
              const elapsed = silenceSinceRef.current ? Date.now() - silenceSinceRef.current : 0;
              console.log("WHY AM I NOT TURNED OFF! Silence duration: " + elapsed + "ms");

              if (!silenceSinceRef.current) {
                console.log("Starting silence timer NOW");
                silenceSinceRef.current = Date.now();
              }

              const silenceDuration = Date.now() - (silenceSinceRef.current || 0);
              console.log("Silence duration: " + silenceDuration + "ms / 1600ms");

              if (silenceDuration > 1600) {
                console.log("🛑 STOPPING NOW - calling stopRecordingAndProcess");
                clearInterval(vadIntervalRef.current);
                vadIntervalRef.current = null;
                console.log("About to call stopRecordingAndProcess, type: " + typeof stopRecordingAndProcess);
                await stopRecordingAndProcess();
                console.log("stopRecordingAndProcess completed");
                return;
              }
            } else {
              console.log("Level too high (" + level + "), resetting silence timer");
              silenceSinceRef.current = 0;
            }
          }
          if (Date.now() - startTs > 10000) {
            clearInterval(vadIntervalRef.current);
            vadIntervalRef.current = null;
            await stopRecordingAndProcess();
          }
        } catch {}
      }, 200);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('startRecording error', e);
    }
  }, []);

  const stopRecordingAndProcess = useCallback(async () => {
    const rec = recordingRef.current;
    if (!rec) return;
    try {
      if (timerRef.current) { try { clearTimeout(timerRef.current); } catch {} timerRef.current = null; }
      if (vadIntervalRef.current) { try { clearInterval(vadIntervalRef.current); } catch {} vadIntervalRef.current = null; }
      await rec.stopAndUnloadAsync();
      setIsRecording(false);
      setIsProcessing(true);
      const uri = rec.getURI();
      recordingRef.current = null;
      if (!uri) return;
      const { baseUrl, apiKey, userId } = backendConfig();
      const fileName = uri.split('/').pop() || 'recording.m4a';
      const form = new FormData();
      form.append('file', { uri, name: fileName, type: 'audio/m4a' } as any);
      const headers: any = {};
      if (apiKey) headers['X-API-Key'] = apiKey;
      if (userId) headers['X-User-Id'] = userId;
      const resp = await fetch(`${baseUrl}/v1/transcribe`, { method: 'POST', headers, body: form });
      const ct = resp.headers.get('content-type') || '';
      if (!resp.ok || !ct.includes('application/json')) {
        setIsProcessing(false);
        startRecording();
        return;
      }
      const js = await resp.json();
      const text: string = String(js?.text || '').trim();
      console.log('📝 Transcription result:', text, '| Length:', text.length);
      if (text) {
        console.log('✅ Text found, will search and restart');
        setQuery(text);
        await fetchResults(text);
        setIsProcessing(false);
        // loop back to listen for next utterance
        // startRecording();
      } else {
        // restart listening if nothing parsed
        console.log('❌ No text - but restarting anyway (infinite loop bug)');
        setIsProcessing(false);
        startRecording();
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('stopRecordingAndProcess error', e);
      console.log('💥 Error occurred - but restarting anyway');
      setIsProcessing(false);
      startRecording();
    }
  }, [backendConfig, fetchResults]);

  

  const handleSubmitEditing = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    await fetchResults(q);
  }, [query, fetchResults]);

  const handleInputFocus = useCallback(() => {
    // Behave like navigating to this tab: start listening immediately
    startRecording();
  }, [startRecording]);

  useFocusEffect(
    useCallback(() => {
      // Small delay to ensure previous tab has cleaned up
      const focusTimer = setTimeout(() => {
        startRecording();
      }, 100);

      return () => {
        clearTimeout(focusTimer);
        try { if (timerRef.current) clearTimeout(timerRef.current); } catch {}
        timerRef.current = null;
        try { if (vadIntervalRef.current) clearInterval(vadIntervalRef.current); } catch {}
        vadIntervalRef.current = null;
        const rec = recordingRef.current;
        if (rec) {
          rec.stopAndUnloadAsync().catch(() => {});
          recordingRef.current = null;
        }
        // Reset audio mode
        Audio.setAudioModeAsync({ allowsRecordingIOS: false }).catch(() => {});
        setIsRecording(false);
        setIsProcessing(false);
      };
    }, [startRecording])
  );

  const gradientColors = colorScheme === 'dark' 
    ? ['#8B5CF6', '#EC4899', '#3B82F6'] 
    : ['#A78BFA', '#F472B6', '#60A5FA'];


  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => {
      fetchResults(q);
    }, 350);
    return () => clearTimeout(t);
  }, [query, fetchResults]);

  return (
    <View style={styles.container}>
      {/* Gradient background matching home screen */}
      <LinearGradient
        colors={
          colorScheme === 'dark'
            ? ['#0F0A1E', '#1A0F2E', '#0F0A1E']
            : ['#FAF5FF', '#FDF4FF', '#F0F9FF']
        }
        style={styles.backgroundGradient}
      />

      {/* Subtle decorative gradient orbs */}
      <View style={styles.orbContainer}>
        <View style={[styles.orb, styles.orb1, { backgroundColor: `${gradientColors[0]}12` }]} />
        <View style={[styles.orb, styles.orb2, { backgroundColor: `${gradientColors[1]}12` }]} />
      </View>

      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <View style={styles.header}>
          <ThemedText style={styles.title}>explore</ThemedText>
        </View>

        <View style={styles.searchBarWrap}>
          <LinearGradient
            colors={[`${gradientColors[0]}15`, `${gradientColors[1]}15`]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.searchGradientBorder}
          >
            <TextInput
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={handleSubmitEditing}
              onFocus={handleInputFocus}
              placeholder="search your thoughts..."
              placeholderTextColor={colorScheme === 'dark' ? '#8E8E93' : '#9CA3AF'}
              style={[
                styles.searchInput,
                {
                  backgroundColor: colorScheme === 'dark' ? 'rgba(15,10,30,0.8)' : 'rgba(255,255,255,0.8)',
                  color: colorScheme === 'dark' ? '#fff' : '#000',
                },
              ]}
              returnKeyType="search"
            />
          </LinearGradient>
        </View>

        <View style={styles.statusContainer}>
          <View style={[
            styles.statusDot,
            { backgroundColor: isProcessing ? '#F59E0B' : (isRecording ? '#10B981' : '#6B7280') }
          ]} />
          <ThemedText style={styles.statusText}>
            {isProcessing ? 'processing...' : (isRecording ? 'listening...' : 'idle')}
          </ThemedText>
        </View>
      </SafeAreaView>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {results.length === 0 ? (
          <View style={styles.placeholderContainer}>
            <ThemedText style={styles.placeholderText}>your thoughts will appear here</ThemedText>
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
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1,
  },
  backgroundGradient: {
    position: 'absolute',
    width: '100%',
    height: '100%',
  },
  orbContainer: {
    position: 'absolute',
    width: '100%',
    height: '100%',
  },
  orb: {
    position: 'absolute',
    borderRadius: 9999,
  },
  orb1: {
    width: 250,
    height: 250,
    top: '5%',
    right: '-15%',
  },
  orb2: {
    width: 200,
    height: 200,
    bottom: '20%',
    left: '-10%',
  },
  safeArea: {},
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '300',
    letterSpacing: 3,
    textTransform: 'lowercase',
    opacity: 0.8,
  },
  searchBarWrap: {
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  searchGradientBorder: {
    borderRadius: 16,
    padding: 1,
  },
  searchInput: {
    borderRadius: 15,
    paddingHorizontal: 18,
    paddingVertical: 14,
    fontSize: 16,
    fontWeight: '300',
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 8,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 13,
    opacity: 0.6,
    fontWeight: '300',
    letterSpacing: 1,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    flexGrow: 1,
    paddingHorizontal: 20,
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
  },
  cardContent: {
    fontSize: 14,
    opacity: 0.8,
    marginBottom: 8,
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
  },
});