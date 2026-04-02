import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { DEMO_ACTIVITY } from '@/lib/demo-data';
import { summarizeActivity } from '@/lib/experience';
import { CtaBar } from '@/components/cta-bar';
import { RecommendationBreakdown } from '@/components/recommendation-breakdown';
import { ScreenScroll, SecondaryButton } from '@/components/ui';
import { usePagamax } from '@/context/pagamax-context';
import { colors, radius, spacing, typography } from '@/lib/theme';

export default function SuccessScreen() {
  const params = useLocalSearchParams<{ index?: string }>();
  const { activity, currentSession, recordSuccessfulRecommendation, settings, toggleSavedMerchant } = usePagamax();
  const hasRecorded = useRef(false);
  const [recordedId, setRecordedId] = useState<string | null>(null);

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
        <Text style={styles.emptyTitle}>No hay una ruta para confirmar</Text>
      </View>
    );
  }

  const recommendation = currentSession.recommendations[Number(params.index ?? '0')];
  const history = activity.length > 0 ? activity : DEMO_ACTIVITY;
  const summary = summarizeActivity(history);
  const grossSavingsArs = Math.round(recommendation.estimatedSavingsArs);
  const pagamaxFeeArs = Math.round(grossSavingsArs * 0.16);
  const netSavingsArs = Math.max(0, grossSavingsArs - pagamaxFeeArs);
  const alreadySaved = settings.savedMerchants.includes(currentSession.match.merchant_name);

  return (
    <View style={styles.screen}>
      <ScreenScroll contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.kicker}>Payment optimized</Text>
          <Text style={styles.title}>Pagamax encontro una ruta clara para {currentSession.match.merchant_name}</Text>
          <Text style={styles.subtitle}>Tu decision queda explicada y registrada para que la proxima vez entres mas rapido.</Text>
        </View>

        <RecommendationBreakdown
          grossSavingsArs={grossSavingsArs}
          pagamaxFeeArs={pagamaxFeeArs}
          netSavingsArs={netSavingsArs}
          confidence={{
            label: currentSession.match.match_method === 'cuit' || currentSession.match.match_method === 'name_exact' ? 'Alta' : 'Media',
            score: currentSession.match.match_method === 'cuit' || currentSession.match.match_method === 'name_exact' ? 0.9 : 0.72,
            tone: currentSession.match.match_method === 'cuit' || currentSession.match.match_method === 'name_exact' ? 'success' : 'warning',
            note: 'El resultado queda guardado como referencia para futuros pagos.',
          }}
        />

        <View style={styles.totalRow}>
          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>This month</Text>
            <Text style={styles.totalValue}>${summary.monthlyNetSavingsArs.toLocaleString('es-AR')}</Text>
          </View>
          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>Lifetime</Text>
            <Text style={styles.totalValue}>${summary.lifetimeNetSavingsArs.toLocaleString('es-AR')}</Text>
          </View>
        </View>

        <View style={styles.whyCard}>
          <Text style={styles.whyTitle}>Why this worked</Text>
          {recommendation.reasons.slice(0, 3).map((reason) => (
            <Text key={reason} style={styles.whyText}>+ {reason}</Text>
          ))}
        </View>

        <SecondaryButton onPress={() => toggleSavedMerchant(currentSession.match.merchant_name)}>
          {alreadySaved ? 'Remove merchant from quick access' : 'Save merchant for faster reuse'}
        </SecondaryButton>

        {recordedId ? <Text style={styles.recorded}>Guardado en tu actividad reciente.</Text> : null}
      </ScreenScroll>

      <View style={styles.footer}>
        <CtaBar
          title="Sigue con el siguiente pago"
          primaryLabel="Check another payment"
          onPressPrimary={() => router.replace('/scan')}
          secondaryLabel="Return home"
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
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.sm,
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
  emptyTitle: {
    ...typography.headingLg,
    color: colors.ink,
  },
});
