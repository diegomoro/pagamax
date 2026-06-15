import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing, typography } from '@/lib/theme';

export type ScanPhase = 'scanning' | 'detected' | 'calculating' | 'ready' | 'error';

export function ScanOverlay({
  success = false,
  error = false,
  phase = 'scanning',
}: {
  success?: boolean;
  error?: boolean;
  phase?: ScanPhase;
}) {
  const pulse = useRef(new Animated.Value(0.45)).current;
  const beam = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 750, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.45, duration: 750, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(beam, {
        toValue: 1,
        duration: 1600,
        useNativeDriver: true,
      }),
      { iterations: 8 },
    );
    loop.start();
    return () => loop.stop();
  }, [beam]);

  const frameColor = success ? colors.teal : error ? colors.danger : colors.white;
  const beamY = beam.interpolate({
    inputRange: [0, 1],
    outputRange: [-100, 100],
  });
  const phaseCopy: Record<ScanPhase, string> = {
    scanning: 'Buscando QR',
    detected: 'QR detectado',
    calculating: 'Calculando la mejor opción',
    ready: 'Listo, ya esta',
    error: 'Revisá el QR',
  };

  return (
    <View pointerEvents="none" style={[styles.overlay, { paddingTop: insets.top + spacing.xxl + spacing.xl }]}>
      <View style={styles.topCopy}>
        <Text style={styles.title}>Escanear QR</Text>
        <View style={[styles.statusPill, (success || phase === 'ready') && styles.statusPillReady, (error || phase === 'error') && styles.statusPillError]}>
          <Text style={[styles.statusText, (success || phase === 'ready') && styles.statusTextReady, (error || phase === 'error') && styles.statusTextError]}>
            {error ? phaseCopy.error : success ? phaseCopy.ready : phaseCopy[phase]}
          </Text>
        </View>
      </View>

      <View style={styles.center}>
        <Animated.View style={[styles.scanFrame, { borderColor: frameColor, opacity: pulse }]}>
          {!success && !error ? <Animated.View style={[styles.scanBeam, { transform: [{ translateY: beamY }] }]} /> : null}
          {success ? <Ionicons name="checkmark-circle" size={34} color={colors.teal} /> : null}
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
    backgroundColor: 'rgba(19, 32, 45, 0.22)',
  },
  topCopy: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    ...typography.headingLg,
    color: colors.white,
    textAlign: 'center',
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  scanFrame: {
    width: 260,
    height: 260,
    borderRadius: radius.xl,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
    overflow: 'hidden',
  },
  scanBeam: {
    width: 220,
    height: 2,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  statusPill: {
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  statusPillReady: {
    backgroundColor: 'rgba(216,236,223,0.88)',
    borderColor: 'rgba(216,236,223,0.9)',
  },
  statusPillError: {
    backgroundColor: 'rgba(247,216,223,0.88)',
    borderColor: 'rgba(247,216,223,0.9)',
  },
  statusText: {
    ...typography.caption,
    color: colors.white,
  },
  statusTextReady: {
    color: colors.success,
  },
  statusTextError: {
    color: colors.danger,
  },
});
