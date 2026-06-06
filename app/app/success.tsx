import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Share, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DEMO_ACTIVITY } from '@/lib/demo-data';
import { buildRecommendationPresentation, summarizeActivity } from '@/lib/experience';
import { CtaBar } from '@/components/cta-bar';
import { RecommendationBreakdown } from '@/components/recommendation-breakdown';
import { ScreenScroll, SecondaryButton } from '@/components/ui';
import { usePagamax } from '@/context/pagamax-context';
import { colors, radius, spacing, typography } from '@/lib/theme';

const PARTICLES = [
  { left: '12%', delay: 0, drift: -18, color: colors.accent },
  { left: '22%', delay: 80, drift: 14, color: colors.success },
  { left: '36%', delay: 30, drift: -10, color: colors.warning },
  { left: '52%', delay: 110, drift: 18, color: colors.accentPressed },
  { left: '68%', delay: 50, drift: -14, color: colors.teal },
  { left: '82%', delay: 130, drift: 10, color: colors.success },
] as const;

function CelebrationParticles() {
  const particles = useRef(PARTICLES.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    Animated.stagger(
      35,
      particles.map((particle, index) => (
        Animated.timing(particle, {
          toValue: 1,
          duration: 900,
          delay: PARTICLES[index]!.delay,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        })
      )),
    ).start();
  }, [particles]);

  return (
    <View pointerEvents="none" style={styles.particleLayer}>
      {particles.map((particle, index) => {
        const config = PARTICLES[index]!;
        return (
          <Animated.View
            key={`${config.left}-${config.delay}`}
            style={[
              styles.particle,
              {
                left: config.left,
                backgroundColor: config.color,
                opacity: particle.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 0.85, 0] }),
                transform: [
                  { translateY: particle.interpolate({ inputRange: [0, 1], outputRange: [14, -46] }) },
                  { translateX: particle.interpolate({ inputRange: [0, 1], outputRange: [0, config.drift] }) },
                  { scale: particle.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0.7, 1, 0.92] }) },
                ],
              },
            ]}
          />
        );
      })}
    </View>
  );
}

export default function SuccessScreen() {
  const params = useLocalSearchParams<{ index?: string }>();
  const { activity, currentSession, recordSuccessfulRecommendation, settings, toggleSavedMerchant } = usePagamax();
  const hasRecorded = useRef(false);
  const [recordedId, setRecordedId] = useState<string | null>(null);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (hasRecorded.current) return;
    if (!currentSession) return;

    try {
      const item = recordSuccessfulRecommendation(Number(params.index ?? '0'));
      setRecordedId(item.id);
      hasRecorded.current = true;
    } catch {
      // Keep the success UI available even if persistence fails.
    }
  }, [currentSession, params.index, recordSuccessfulRecommendation]);

  if (!currentSession || !currentSession.recommendations[Number(params.index ?? '0')]) {
    return (
      <View style={styles.empty}>
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No hay decision para guardar</Text>
          <Text style={styles.emptyBody}>Escanea un QR o busca un comercio para guardar una buena decision.</Text>
          <SecondaryButton onPress={() => router.replace('/scan')}>Escanear QR</SecondaryButton>
        </View>
      </View>
    );
  }

  const recommendation = currentSession.recommendations[Number(params.index ?? '0')];
  const history = activity.length > 0 ? activity : DEMO_ACTIVITY;
  const summary = summarizeActivity(history);
  const alreadySaved = settings.savedMerchants.includes(currentSession.match.merchant_name);
  const presentation = buildRecommendationPresentation(currentSession, recommendation);
  const shareRecommendation = async () => {
    const value = presentation.netSavingsArs > 0
      ? `me marco un ahorro estimado de ${presentation.netSavingsArs.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })}`
      : 'me dijo cual era la opcion simple sin promo segura';

    try {
      await Share.share({
        message: `Antes de pagar en ${currentSession.match.merchant_name}, Paga Menos ${value}. Dos segundos y quedas como el que sabe pagar.`,
      });
    } catch {
      // Sharing is optional and should not block the success flow.
    }
  };

  return (
    <View style={styles.screen}>
      <ScreenScroll contentContainerStyle={styles.content}>
        <LinearGradient colors={[colors.surfaceElevated, colors.tealSoft]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <CelebrationParticles />
          <View style={styles.successIcon}>
            <Ionicons name="checkmark" size={30} color={colors.white} />
          </View>
          <Text style={styles.kicker}>Decision guardada</Text>
          <Text style={styles.title}>Ya sabes como pagar en {currentSession.match.merchant_name}</Text>
          <Text style={styles.subtitle}>Esto no confirma pagos reales. Solo guarda la recomendacion para que la proxima compra sea mas rapida.</Text>
        </LinearGradient>

        <RecommendationBreakdown
          grossSavingsArs={presentation.grossSavingsArs}
          pagamaxFeeArs={presentation.pagamaxFeeArs}
          netSavingsArs={presentation.netSavingsArs}
          confidence={{
            label: currentSession.match.match_method === 'cuit' || currentSession.match.match_method === 'name_exact' ? 'Alta' : 'Media',
            score: currentSession.match.match_method === 'cuit' || currentSession.match.match_method === 'name_exact' ? 0.9 : 0.72,
            tone: currentSession.match.match_method === 'cuit' || currentSession.match.match_method === 'name_exact' ? 'success' : 'warning',
            note: 'Queda guardado para que la proxima compra sea mas facil.',
          }}
        />

        <View style={styles.totalRow}>
          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>Este mes</Text>
            <Text style={styles.totalValue}>${summary.monthlyNetSavingsArs.toLocaleString('es-AR')}</Text>
          </View>
          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>Acumulado</Text>
            <Text style={styles.totalValue}>${summary.lifetimeNetSavingsArs.toLocaleString('es-AR')}</Text>
          </View>
        </View>

        <View style={styles.whyCard}>
          <Text style={styles.whyTitle}>Por que era buena idea</Text>
          {presentation.qualifiers.slice(0, 3).map((reason) => (
            <Text key={reason} style={styles.whyText}>+ {reason}</Text>
          ))}
        </View>

        <SecondaryButton onPress={() => toggleSavedMerchant(currentSession.match.merchant_name)}>
          {alreadySaved ? 'Quitar de accesos rapidos' : 'Guardar este lugar'}
        </SecondaryButton>

        <SecondaryButton onPress={() => void shareRecommendation()}>
          Pasarselo a alguien
        </SecondaryButton>

        {recordedId ? <Text style={styles.recorded}>Guardado. Ya cuenta para tu historial.</Text> : null}
      </ScreenScroll>

      <View style={[styles.footer, { bottom: insets.bottom + spacing.md }]}>
        <CtaBar
          title="Siguiente compra: mirala antes"
          primaryLabel="Escanear otro QR"
          onPressPrimary={() => router.replace('/scan')}
          secondaryLabel="Volver al inicio"
          onPressSecondary={() => router.replace('/')}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingBottom: 180,
    gap: spacing.lg,
  },
  hero: {
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.sm,
    overflow: 'hidden',
  },
  particleLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  particle: {
    position: 'absolute',
    top: 34,
    width: 8,
    height: 18,
    borderRadius: radius.full,
  },
  successIcon: {
    width: 58,
    height: 58,
    borderRadius: radius.full,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  kicker: {
    ...typography.overline,
    color: colors.teal,
  },
  title: {
    ...typography.displaySm,
    color: colors.ink,
  },
  subtitle: {
    ...typography.bodyLg,
    color: colors.inkMuted,
  },
  totalRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  totalCard: {
    flex: 1,
    backgroundColor: colors.tealSoft,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.xxs,
  },
  totalLabel: {
    ...typography.caption,
    color: colors.inkMuted,
  },
  totalValue: {
    ...typography.headingLg,
    color: colors.teal,
  },
  whyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  whyTitle: {
    ...typography.headingLg,
    color: colors.ink,
  },
  whyText: {
    ...typography.bodySm,
    color: colors.inkMuted,
  },
  recorded: {
    ...typography.caption,
    color: colors.inkMuted,
    textAlign: 'center',
  },
  footer: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.lg,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    padding: spacing.lg,
  },
  emptyCard: {
    width: '100%',
    borderRadius: radius.xl,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  emptyTitle: {
    ...typography.headingLg,
    color: colors.ink,
  },
  emptyBody: {
    ...typography.bodySm,
    color: colors.inkMuted,
  },
});
