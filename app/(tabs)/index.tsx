import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Animated, View, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';

import Constants from 'expo-constants';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function HomeScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const [isRecording, setIsRecording] = useState(false);
  const [lastUri, setLastUri] = useState<string | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  
  // Animations
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const wave1Anim = useRef(new Animated.Value(0)).current;
  const wave2Anim = useRef(new Animated.Value(0)).current;
  const wave3Anim = useRef(new Animated.Value(0)).current;
  const floatAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    return () => {
      const rec = recordingRef.current;
      if (rec) rec.stopAndUnloadAsync().catch(() => {});
    };
  }, []);

  useEffect(() => {
    // Wave animations with different speeds and easing
    Animated.loop(
      Animated.timing(wave1Anim, {
        toValue: 1,
        duration: 120000,
        useNativeDriver: true,
        easing: (t) => t, // Linear for smoothness
      })
    ).start();

    Animated.loop(
      Animated.timing(wave2Anim, {
        toValue: 1,
        duration: 150000,
        useNativeDriver: true,
        easing: (t) => t,
      })
    ).start();

    Animated.loop(
      Animated.timing(wave3Anim, {
        toValue: 1,
        duration: 18000,
        useNativeDriver: true,
        easing: (t) => t,
      })
    ).start();

    // Floating text animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue: 1,
          duration: 3000,
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim, {
          toValue: 0,
          duration: 3000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  useEffect(() => {
    if (isRecording) {
      // Pulsing animation
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.08,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      ).start();

      // Rotating animation
      Animated.loop(
        Animated.timing(rotateAnim, {
          toValue: 1,
          duration: 3000,
          useNativeDriver: true,
        })
      ).start();

      // Glow animation
      Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, {
            toValue: 1,
            duration: 1500,
            useNativeDriver: true,
          }),
          Animated.timing(glowAnim, {
            toValue: 0,
            duration: 1500,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
      rotateAnim.setValue(0);
      glowAnim.setValue(0);
    }
  }, [isRecording]);

  const onPressMic = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

    if (isRecording) {
      try {
        const rec = recordingRef.current;
        if (!rec) return;
        await rec.stopAndUnloadAsync();
        const uri = rec.getURI();
        if (uri) {
          setLastUri(uri);
          try {
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
            await fetch(`${baseUrl}/v1/thoughts/transcribe`, {
              method: 'POST',
              headers,
              body: form,
            });
          } catch {}
        }
        recordingRef.current = null;
        setIsRecording(false);
      } catch {}
      return;
    }

    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) return;
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await recording.startAsync();
      recordingRef.current = recording;
      setIsRecording(true);
    } catch {}
  };

  const rotation = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const glowOpacity = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.4, 0.7],
  });

  const wave1TranslateX = wave1Anim.interpolate({
    inputRange: [0, 1],
    outputRange: [-SCREEN_WIDTH * 2, SCREEN_WIDTH * 2],
  });

  const wave2TranslateX = wave2Anim.interpolate({
    inputRange: [0, 1],
    outputRange: [SCREEN_WIDTH * 2, -SCREEN_WIDTH * 2],
  });

  const wave3TranslateX = wave3Anim.interpolate({
    inputRange: [0, 1],
    outputRange: [-SCREEN_WIDTH, SCREEN_WIDTH],
  });

  const floatTranslateY = floatAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -8],
  });

  const floatOpacity = floatAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.3, 0.5, 0.3],
  });

  const gradientColors = colorScheme === 'dark' 
    ? ['#8B5CF6', '#EC4899', '#3B82F6'] 
    : ['#A78BFA', '#F472B6', '#60A5FA'];

  return (
    <View style={styles.container}>
      {/* Gradient background for entire screen */}
      <LinearGradient
        colors={
          colorScheme === 'dark'
            ? ['#0F0A1E', '#1A0F2E', '#0F0A1E']
            : ['#FAF5FF', '#FDF4FF', '#F0F9FF']
        }
        style={styles.backgroundGradient}
      />

      {/* Animated wave backgrounds */}
      <View style={styles.wavesContainer}>
        <Animated.View
          style={[
            styles.waveLayer,
            {
              transform: [{ translateX: wave1TranslateX }],
            },
          ]}
        >
          <LinearGradient
            colors={[gradientColors[0], gradientColors[1]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.wave1}
          />
        </Animated.View>

        <Animated.View
          style={[
            styles.waveLayer,
            {
              transform: [{ translateX: wave2TranslateX }],
            },
          ]}
        >
          <LinearGradient
            colors={[gradientColors[1], gradientColors[2]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.wave2}
          />
        </Animated.View>

        <Animated.View
          style={[
            styles.waveLayer,
            {
              transform: [{ translateX: wave3TranslateX }],
            },
          ]}
        >
          <LinearGradient
            colors={[gradientColors[2], gradientColors[0]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.wave3}
          />
        </Animated.View>
      </View>

      {/* Floating hint text */}
      {!isRecording && (
        <Animated.View
          style={[
            styles.hintContainer,
            {
              transform: [{ translateY: floatTranslateY }],
              opacity: floatOpacity,
            },
          ]}
        >
          <ThemedText style={styles.hintText}>tap to start speaking</ThemedText>
        </Animated.View>
      )}

      <View style={styles.centerContent}>
        {/* Microphone button with layers */}
        <View style={styles.micContainer}>
          {/* Outer glow layer (animated) */}
          {isRecording && (
            <Animated.View
              style={[
                styles.glowLayer,
                {
                  transform: [{ scale: pulseAnim }],
                  opacity: glowOpacity,
                },
              ]}
            >
              <LinearGradient
                colors={[...gradientColors, gradientColors[0]]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.glowGradient}
              />
            </Animated.View>
          )}

          {/* Rotating ring layer */}
          <Animated.View
            style={[
              styles.ringLayer,
              {
                transform: [{ rotate: rotation }],
              },
            ]}
          >
            <LinearGradient
              colors={[gradientColors[0], 'transparent', gradientColors[1], 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.ringGradient}
            />
          </Animated.View>

          {/* Main button */}
          <Pressable
            accessibilityLabel="Record a thought"
            accessibilityRole="button"
            onPress={onPressMic}
            style={({ pressed }) => [
              styles.micButton,
              {
                transform: [{ scale: pressed ? 0.95 : 1 }],
              },
            ]}
          >
            <LinearGradient
              colors={gradientColors}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.buttonGradient}
            >
              <IconSymbol
                name={isRecording ? 'stop.fill' : 'mic.fill'}
                size={72}
                color="#fff"
              />
            </LinearGradient>
          </Pressable>
        </View>

        {/* Status text */}
        {isRecording && (
          <View style={styles.captionContainer}>
            <View style={styles.recordingIndicator}>
              <View style={styles.recordingDot} />
              <ThemedText style={styles.caption}>Recording...</ThemedText>
            </View>
          </View>
        )}
      </View>

      {lastUri ? (
        <View style={styles.transcriptContainer}>
          <BlurView
            intensity={30}
            tint={colorScheme}
            style={styles.transcriptBlur}
          >
            <ThemedText style={styles.transcript} numberOfLines={2}>
              ✓ Saved: {lastUri.replace(FileSystem.documentDirectory ?? '', '')}
            </ThemedText>
          </BlurView>
        </View>
      ) : null}
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
  wavesContainer: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    overflow: 'hidden',
  },
  waveLayer: {
    position: 'absolute',
    width: SCREEN_WIDTH * 4,
    height: '100%',
  },
  wave1: {
    position: 'absolute',
    width: SCREEN_WIDTH * 4,
    height: 600,
    bottom: -100,
    left: -SCREEN_WIDTH * 2,
    borderTopLeftRadius: 400,
    borderTopRightRadius: 400,
    opacity: 0.3,
    transform: [{ rotate: '-12deg' }],
  },
  wave2: {
    position: 'absolute',
    width: SCREEN_WIDTH * 3.5,
    height: 500,
    bottom: -50,
    right: -SCREEN_WIDTH * 1.5,
    borderTopLeftRadius: 350,
    borderTopRightRadius: 350,
    opacity: 0.25,
    transform: [{ rotate: '8deg' }],
  },
  wave3: {
    position: 'absolute',
    width: SCREEN_WIDTH * 3,
    height: 450,
    bottom: -20,
    left: -SCREEN_WIDTH * 1,
    borderTopLeftRadius: 300,
    borderTopRightRadius: 300,
    opacity: 0.2,
    transform: [{ rotate: '5deg' }],
  },
  hintContainer: {
    position: 'absolute',
    top: 120,
    alignSelf: 'center',
    zIndex: 10,
  },
  hintText: {
    fontSize: 16,
    fontWeight: '300',
    letterSpacing: 2,
    textTransform: 'lowercase',
    opacity: 0.8,
  },
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 32,
  },
  micContainer: {
    width: 200,
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowLayer: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
  },
  glowGradient: {
    width: '100%',
    height: '100%',
    borderRadius: 110,
  },
  ringLayer: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
  },
  ringGradient: {
    width: '100%',
    height: '100%',
    borderRadius: 100,
  },
  micButton: {
    width: 180,
    height: 180,
    borderRadius: 90,
    shadowColor: '#8B5CF6',
    shadowOpacity: 0.4,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  buttonGradient: {
    width: '100%',
    height: '100%',
    borderRadius: 90,
    alignItems: 'center',
    justifyContent: 'center',
  },
  captionContainer: {
    alignItems: 'center',
  },
  recordingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
  },
  caption: {
    fontSize: 18,
    opacity: 0.9,
    fontWeight: '500',
  },
  transcriptContainer: {
    position: 'absolute',
    bottom: 100,
    alignSelf: 'center',
    maxWidth: 320,
    borderRadius: 16,
    overflow: 'hidden',
  },
  transcriptBlur: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  transcript: {
    textAlign: 'center',
    opacity: 0.9,
    fontSize: 13,
  },
});