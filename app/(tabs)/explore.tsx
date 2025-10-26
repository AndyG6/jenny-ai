import { useFocusEffect } from '@react-navigation/native';
import { Audio } from 'expo-av';
import Constants from 'expo-constants';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Dimensions, StyleSheet, Animated, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function ExploreScreen() {
  const [transcribedText, setTranscribedText] = useState('');
  const [hasDetectedSpeech, setHasDetectedSpeech] = useState(false);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const vadIntervalRef = useRef<any>(null);
  const silenceSinceRef = useRef<number>(0);

  // Blinking cursor animation
  const cursorOpacity = useRef(new Animated.Value(1)).current;

  const backendConfig = useCallback(() => {
    const baseUrl = ((Constants.expoConfig?.extra as any)?.backendUrl as string) || (process.env.BACKEND_URL as string) || 'http://127.0.0.1:8082';
    const apiKey = ((Constants.expoConfig?.extra as any)?.backendApiKey as string) || (process.env.API_KEY as string) || '';
    const userId = ((Constants.expoConfig?.extra as any)?.backendUserId as string) || (process.env.BACKEND_USER_ID as string) || '';
    return { baseUrl, apiKey, userId };
  }, []);

  // Use useFocusEffect to start/stop recording when tab is focused/unfocused
  useFocusEffect(
    useCallback(() => {
      // Small delay to ensure previous tab has cleaned up
      const focusTimer = setTimeout(() => {
        startRecording();
      }, 100);

      return () => {
        clearTimeout(focusTimer);
        if (vadIntervalRef.current) {
          clearInterval(vadIntervalRef.current);
          vadIntervalRef.current = null;
        }
        const rec = recordingRef.current;
        if (rec) {
          rec.stopAndUnloadAsync().catch(() => {});
          recordingRef.current = null;
        }
        // Reset audio mode
        Audio.setAudioModeAsync({ allowsRecordingIOS: false }).catch(() => {});
        // Reset state
        setHasDetectedSpeech(false);
        setTranscribedText('');
        silenceSinceRef.current = 0;
      };
    }, [])
  );

  // Cursor blinking animation - only when no speech detected
  useEffect(() => {
    if (!hasDetectedSpeech) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(cursorOpacity, {
            toValue: 0,
            duration: 530,
            useNativeDriver: true,
          }),
          Animated.timing(cursorOpacity, {
            toValue: 1,
            duration: 530,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      cursorOpacity.setValue(1);
    }
  }, [hasDetectedSpeech]);

  const startRecording = async () => {
    try {
      if (recordingRef.current) return;

      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) return;

      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const recording = new Audio.Recording();
      const baseOpts: any = Audio.RecordingOptionsPresets.HIGH_QUALITY as any;
      const options: any = {
        ...baseOpts,
        isMeteringEnabled: true,
      };
      await recording.prepareToRecordAsync(options);
      await recording.startAsync();
      recordingRef.current = recording;

      // Voice-activity detection
      const startTs = Date.now();
      silenceSinceRef.current = 0;

      if (vadIntervalRef.current) {
        clearInterval(vadIntervalRef.current);
      }

      vadIntervalRef.current = setInterval(async () => {
        try {
          const st: any = await recording.getStatusAsync();
          if (!st?.isRecording) {
            clearInterval(vadIntervalRef.current);
            vadIntervalRef.current = null;
            return;
          }

          const level = typeof st.metering === 'number' ? st.metering : null;

          if (level !== null) {
            if (level < -35) {
              // Silence detected
              if (!silenceSinceRef.current) {
                silenceSinceRef.current = Date.now();
                // Mark speech as detected when silence starts (means they were talking before)
                if (!hasDetectedSpeech) {
                  setHasDetectedSpeech(true);
                }
              }

              const silenceDuration = Date.now() - silenceSinceRef.current;

              if (silenceDuration > 1600) {
                // Stop recording after 1.6s of silence
                clearInterval(vadIntervalRef.current);
                vadIntervalRef.current = null;
                await stopRecordingAndProcess();
                return;
              }
            } else {
              // Sound detected - reset silence timer
              silenceSinceRef.current = 0;
            }
          }

          // Max 10 seconds
          if (Date.now() - startTs > 10000) {
            clearInterval(vadIntervalRef.current);
            vadIntervalRef.current = null;
            await stopRecordingAndProcess();
          }
        } catch (e) {
          clearInterval(vadIntervalRef.current);
          vadIntervalRef.current = null;
        }
      }, 200);
    } catch (e) {
      console.error('startRecording error', e);
    }
  };

  const stopRecordingAndProcess = async () => {
    const rec = recordingRef.current;
    if (!rec) return;

    try {
      if (vadIntervalRef.current) {
        clearInterval(vadIntervalRef.current);
        vadIntervalRef.current = null;
      }

      await rec.stopAndUnloadAsync();
      const uri = rec.getURI();
      recordingRef.current = null;

      if (!uri) {
        // Restart if no URI
        setHasDetectedSpeech(false);
        startRecording();
        return;
      }

      const { baseUrl, apiKey, userId } = backendConfig();
      const fileName = uri.split('/').pop() || 'recording.m4a';
      const form = new FormData();
      form.append('file', { uri, name: fileName, type: 'audio/m4a' } as any);
      const headers: any = {};
      if (apiKey) headers['X-API-Key'] = apiKey;
      if (userId) headers['X-User-Id'] = userId;

      const resp = await fetch(`${baseUrl}/v1/transcribe`, {
        method: 'POST',
        headers,
        body: form,
      });

      const ct = resp.headers.get('content-type') || '';
      if (!resp.ok || !ct.includes('application/json')) {
        // Restart on error
        setHasDetectedSpeech(false);
        setTranscribedText('');
        startRecording();
        return;
      }

      const js = await resp.json();
      const text: string = String(js?.text || '').trim();
      console.log('📝 Transcription result:', text);

      if (text) {
        setTranscribedText(text);

        // TODO: Navigate to results tab with the transcribed text
        // For now, just show it briefly then restart
        setTimeout(() => {
          setHasDetectedSpeech(false);
          setTranscribedText('');
          startRecording();
        }, 3000);
      } else {
        // No text - restart
        setHasDetectedSpeech(false);
        setTranscribedText('');
        startRecording();
      }
    } catch (e) {
      console.error('stopRecordingAndProcess error', e);
      // Restart on error
      setHasDetectedSpeech(false);
      setTranscribedText('');
      startRecording();
    }
  };

  return (
    <View style={styles.container}>
      {/* Beige/tan gradient background */}
      <View style={styles.background} />

      {/* Top left branding */}
      <View style={styles.brandingContainer}>
        <ThemedText style={styles.brandingText}>Library</ThemedText>
      </View>

      {/* Center area with "nina" text and decorative circle */}
      <View style={styles.centerContainer}>
        <View style={styles.decorativeCircle} />
        <ThemedText style={styles.ninaText}>nina</ThemedText>
      </View>

      {/* Bottom transcription area with blinking cursor */}
      <View style={styles.bottomContainer}>
        {!hasDetectedSpeech ? (
          <View style={styles.cursorContainer}>
            <Animated.View
              style={[
                styles.cursor,
                {
                  opacity: cursorOpacity,
                },
              ]}
            />
            <ThemedText style={styles.cursorPrompt}>
              Blinking cursor -- start transcribing
            </ThemedText>
          </View>
        ) : (
          <View style={styles.transcriptionContainer}>
            <ThemedText style={styles.transcriptionText}>
              {transcribedText || 'Transcribing...'}
            </ThemedText>
          </View>
        )}
      </View>
    </View>
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
    backgroundColor: '#D4C4B0', // Beige/tan color
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
  centerContainer: {
    position: 'absolute',
    top: SCREEN_HEIGHT * 0.4,
    right: SCREEN_WIDTH * 0.15,
    alignItems: 'center',
  },
  decorativeCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(217, 217, 217, 1)',
    position: 'absolute',
    top: -100,
    right: -20,
    zIndex: 1,
  },
  ninaText: {
    fontSize: 72,
    lineHeight: 80, // >= fontSize to avoid clipping
    fontWeight: '500',
    color: '#FFFFFF',
    letterSpacing: -2,
    textTransform: 'lowercase',
  },
  bottomContainer: {
    position: 'absolute',
    bottom: 120,
    left: 24,
    right: 24,
  },
  cursorContainer: {
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  cursor: {
    width: 3,
    height: 40,
    backgroundColor: '#FFFFFF',
    marginBottom: 16,
  },
  cursorPrompt: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  transcriptionContainer: {
    paddingVertical: 16,
  },
  transcriptionText: {
    fontSize: 18,
    fontWeight: '500',
    color: '#FFFFFF',
    lineHeight: 26,
  },
});
