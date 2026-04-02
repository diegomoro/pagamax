import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '@/lib/theme';

export function ScanOverlay({ success = false, error = false }: { success?: boolean; error?: boolean }) {
  const pulse = useRef(new Animated.Value(0.45)).current;

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

  const frameColor = success ? colors.teal : error ? colors.danger : colors.white;

  return (
    <View pointerEvents="none" style={styles.overlay}>
      <View style={styles.topCopy}>
        <Text style={styles.title}>Apunta al QR del comercio</Text>
        <Text style={styles.body}>Leemos el QR solo para calcular promociones en tu telefono.</Text>
      </View>

      <View style={styles.center}>
        <Animated.View style={[styles.scanFrame, { borderColor: frameColor, opacity: pulse }]}>
          {success ? <Ionicons name="checkmark-circle" size={34} color={colors.teal} /> : null}
        </Animated.View>
      </View>

      <Text style={styles.footer}>Busca que el codigo quede dentro del marco.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
    backgroundColor: 'rgba(19, 32, 45, 0.22)',
  },
  topCopy: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  title: {
    ...typography.headingLg,
    color: colors.white,
    textAlign: 'center',
  },
  body: {
    ...typography.bodySm,
    color: colors.whiteSoft,
    textAlign: 'center',
    maxWidth: 280,
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
  },
  footer: {
    ...typography.caption,
    color: colors.whiteSoft,
    textAlign: 'center',
  },
});
