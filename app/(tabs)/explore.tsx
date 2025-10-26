import { useFocusEffect } from '@react-navigation/native';
import Vapi from '@vapi-ai/react-native';
import Constants from 'expo-constants';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useRef, useState } from 'react';
import { Dimensions, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function ConversationScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState<Array<{ role: string; text: string }>>([]);
  const [query, setQuery] = useState('');
  const vapiRef = useRef<Vapi | null>(null);

  const apiKey = (Constants.expoConfig?.extra as any)?.vapiPublicApiKey || process.env.VAPI_PUBLIC_API_KEY;
  const assistantId = (Constants.expoConfig?.extra as any)?.vapiAssistantId || process.env.VAPI_ASSISTANT_ID;

  const ensureClient = useCallback(() => {
    if (!vapiRef.current && apiKey) {
      const v = new Vapi(apiKey);
      v.on('call-start', () => setIsConnected(true));
      v.on('call-end', () => setIsConnected(false));
      v.on('message', (message: any) => {
        if (message?.type === 'transcript') {
          const role = message.role ?? 'unknown';
          const isFinal = message?.final === true || message?.is_final === true || message?.isFinal === true;
          if ((role === 'user' || role === 'speaker') && isFinal) {
            const text = String(message.transcript ?? '').trim();
            if (text.length > 0) {
              setQuery((prev) => (prev ? `${prev} ${text}` : text));
            }
          }
        }
      });
      v.on('error', (err: any) => {
        // eslint-disable-next-line no-console
        console.error('Vapi error:', err);
      });
      vapiRef.current = v;
    }
    return vapiRef.current;
  }, [apiKey]);

  useFocusEffect(
    useCallback(() => {
      const v = ensureClient();
      let cancelled = false;
      (async () => {
        if (!v) return;
        try {
          if (assistantId) {
            await v.start(assistantId);
          } else {
            await v.start({
              model: { provider: 'openai', model: 'gpt-4o' },
              voice: { provider: '11labs', voiceId: '21m00Tcm4TlvDq8ikWAM' },
              firstMessage: 'Listening…',
            });
          }
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error('Failed to start Vapi call', e);
        }
      })();

      return () => {
        cancelled = true;
        if (v) v?.stop();
      };
    }, [ensureClient, assistantId])
  );

  const gradientColors = colorScheme === 'dark' 
    ? ['#8B5CF6', '#EC4899', '#3B82F6'] 
    : ['#A78BFA', '#F472B6', '#60A5FA'];

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
          <View style={[styles.statusDot, { backgroundColor: isConnected ? '#10B981' : '#6B7280' }]} />
          <ThemedText style={styles.statusText}>
            {isConnected ? 'listening...' : 'connecting...'}
          </ThemedText>
        </View>
      </SafeAreaView>

      {/* Placeholder for future content */}
      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <View style={styles.placeholderContainer}>
          <ThemedText style={styles.placeholderText}>
            your thoughts will appear here
          </ThemedText>
        </View>
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
});