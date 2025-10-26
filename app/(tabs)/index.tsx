import { Audio } from 'expo-av';
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { StyleSheet, Animated, View, Dimensions } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Constants from 'expo-constants';
import { ThemedText } from '@/components/themed-text';
import { PanGestureHandler, State } from 'react-native-gesture-handler';
import { useRouter } from 'expo-router';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function HomeScreen() {
  const router = useRouter();
  const [transcribedText, setTranscribedText] = useState('');
  const [hasDetectedSpeech, setHasDetectedSpeech] = useState(false);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const intervalRef = useRef<any>(null);
  const switchingRef = useRef<boolean>(false);

  // Blinking cursor animation
  const cursorOpacity = useRef(new Animated.Value(1)).current;

  // Use useFocusEffect to start/stop recording when tab is focused/unfocused
  useFocusEffect(
    useCallback(() => {
      // Small delay to ensure previous tab has cleaned up
      const timer = setTimeout(() => {
        startRecording();
      }, 100);

      // Cleanup when tab loses focus
      return () => {
        clearTimeout(timer);
        // Stop recording
        const rec = recordingRef.current;
        if (rec) {
          rec.stopAndUnloadAsync().catch(() => {});
          recordingRef.current = null;
        }
        // Clear interval
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        // Reset audio mode
        Audio.setAudioModeAsync({ allowsRecordingIOS: false }).catch(() => {});
        // Reset state
        setHasDetectedSpeech(false);
        setTranscribedText('');
      };
    }, [])
  );

  const onPanGestureEvent = useCallback((e: any) => {
    const ty = e?.nativeEvent?.translationY ?? 0;
    const vy = e?.nativeEvent?.velocityY ?? 0;
    if (!switchingRef.current && ty < -90 && vy < -200) {
      switchingRef.current = true;
      router.replace('/explore');
    }
  }, [router]);

  const onPanStateChange = useCallback((e: any) => {
    const st = e?.nativeEvent?.state;
    if (st === State.END || st === State.CANCELLED || st === State.FAILED) {
      switchingRef.current = false;
    }
  }, []);

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

      // Monitor for speech detection
      monitorSpeech(recording);
    } catch (e) {
      console.log('startRecording error', e);
    }
  };

  const monitorSpeech = (recording: Audio.Recording) => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    intervalRef.current = setInterval(async () => {
      try {
        const status: any = await recording.getStatusAsync();
        if (!status?.isRecording) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
          return;
        }
        const level = typeof status.metering === 'number' ? status.metering : null;

        // Detect speech (level > -35 dB indicates voice activity)
        if (level !== null && level > -35 && !hasDetectedSpeech) {
          setHasDetectedSpeech(true);
          // Stop after detecting speech and some silence
          setTimeout(() => {
            stopRecordingAndProcess();
            if (intervalRef.current) {
              clearInterval(intervalRef.current);
              intervalRef.current = null;
            }
          }, 2000);
        }
      } catch (e) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }
    }, 200);
  };

  const stopRecordingAndProcess = async () => {
    const rec = recordingRef.current;
    if (!rec) return;
    try {
      await rec.stopAndUnloadAsync();
      const uri = rec.getURI();
      recordingRef.current = null;
      if (!uri) return;

      const baseUrl =
        ((Constants.expoConfig?.extra as any)?.backendUrl as string) ||
        (process.env.BACKEND_URL as string) ||
        'http://127.0.0.1:8082';
      const apiKey =
        ((Constants.expoConfig?.extra as any)?.backendApiKey as string) ||
        (process.env.API_KEY as string) ||
        '';
      const headers: any = {};
      if (apiKey) headers['X-API-Key'] = apiKey;
      const userId =
        ((Constants.expoConfig?.extra as any)?.backendUserId as string) ||
        (process.env.BACKEND_USER_ID as string) ||
        '';
      if (userId) headers['X-User-Id'] = userId;
      const fileName = uri.split('/').pop() || 'recording.m4a';
      const form = new FormData();
      form.append('file', { uri, name: fileName, type: 'audio/m4a' } as any);

      const response = await fetch(`${baseUrl}/v1/transcribe`, {
        method: 'POST',
        headers,
        body: form,
      });

      const result = await response.json();
      console.log('Transcription result:', result);
      if (result?.text) {
        setTranscribedText(result.text);
      }

      // Reset and start listening again
      setTimeout(() => {
        setHasDetectedSpeech(false);
        setTranscribedText('');
        startRecording();
      }, 3000);
    } catch (e) {
      console.error('stopRecordingAndProcess error', e);
      // Retry
      setTimeout(() => {
        setHasDetectedSpeech(false);
        startRecording();
      }, 1000);
    }
  };

  return (
    <PanGestureHandler onGestureEvent={onPanGestureEvent} onHandlerStateChange={onPanStateChange} activeOffsetY={[-40, 40]}>
      <View style={styles.container}>
      {/* Beige/tan gradient background */}
      <View style={styles.background} />

      {/* Top left branding */}
      <View style={styles.brandingContainer}>
        <ThemedText style={styles.brandingText}>ThoughtT</ThemedText>
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
    backgroundColor: '#D4C4B0', // Beige/tan color from screenshot
  },
  brandingContainer: {
    position: 'absolute',
    top: 70,
    left: 24,
    zIndex: 2,
    overflow: 'visible',
  },
  brandingText: {
    fontSize: 28,
    lineHeight: 34, // >= fontSize
    fontWeight: '500',
    color: '#FFFFFF',
    letterSpacing: 0,
  },
  centerContainer: {
    position: 'absolute',
    top: SCREEN_HEIGHT * 0.4,
    right: SCREEN_WIDTH * 0.15,
    alignItems: 'center',
    zIndex: 2,
    overflow: 'visible',
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
