import { useEffect, useRef, useState } from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { DEMO_ACTIVITY } from '@/lib/demo-data';
import { buildRecommendationPresentation, summarizeActivity } from '@/lib/experience';
import { CtaBar } from '@/components/cta-bar';
import { RecommendationBreakdown } from '@/components/recommendation-breakdown';
import { ScreenScroll, SecondaryButton } from '@/components/ui';
import { usePagamax } from '@/context/pagamax-context';
import { colors, radius, spacing, typography } from '@/lib/theme';

export default function SuccessScreen() {
  const params = useLocalSearchParams<{ index?: string; simulated?: string }>();
  const { activity, currentSession, recordSuccessfulRecommendation, settings, toggleSavedMerchant } = usePagamax();
  const hasRecorded = useRef(false);
  const [recordedId, setRecordedId] = useState<string | null>(null);
  const isSimulated = params.simulated === '1';

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
  const alreadySaved = settings.savedMerchants.includes(currentSession.match.merchant_name);
  const presentation = buildRecommendationPresentation(currentSession, recommendation);
  const shareRecommendation = async () => {
    const value = presentation.netSavingsArs > 0
      ? `me marco una ruta con ahorro estimado de ${presentation.netSavingsArs.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })}`
      : 'me confirmo la ruta mas simple sin promo confiable';

    try {
      await Share.share({
        message: `Antes de pagar en ${currentSession.match.merchant_name}, Paga Menos ${value}. Es una forma tranquila de elegir mejor como pagar.`,
      });
    } catch {
      // Sharing is optional and should not block the success flow.
    }
  };

  return (
    <View style={styles.screen}>
      <ScreenScroll contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.kicker}>{isSimulated ? 'Pago simulado' : 'Pago optimizado'}</Text>
          <Text style={styles.title}>
            {isSimulated
              ? `Flujo revisado para ${currentSession.match.merchant_name}`
              : `Paga Menos encontro una ruta clara para ${currentSession.match.merchant_name}`}
          </Text>
          <Text style={styles.subtitle}>
            {isSimulated
              ? 'No confirma pagos reales. Registra el resultado para validar ahorro, historial y reuso.'
              : 'Tu decision queda explicada y registrada para que la proxima vez entres mas rapido.'}
          </Text>
        </View>

        <RecommendationBreakdown
          grossSavingsArs={presentation.grossSavingsArs}
          pagamaxFeeArs={presentation.pagamaxFeeArs}
          netSavingsArs={presentation.netSavingsArs}
          confidence={{
            label: currentSession.match.match_method === 'cuit' || currentSession.match.match_method === 'name_exact' ? 'Alta' : 'Media',
            score: currentSession.match.match_method === 'cuit' || currentSession.match.match_method === 'name_exact' ? 0.9 : 0.72,
            tone: currentSession.match.match_method === 'cuit' || currentSession.match.match_method === 'name_exact' ? 'success' : 'warning',
            note: 'El resultado queda guardado como referencia para futuros pagos.',
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
          <Text style={styles.whyTitle}>Por que funciono</Text>
          {presentation.qualifiers.slice(0, 3).map((reason) => (
            <Text key={reason} style={styles.whyText}>+ {reason}</Text>
          ))}
        </View>

        <SecondaryButton onPress={() => toggleSavedMerchant(currentSession.match.merchant_name)}>
          {alreadySaved ? 'Quitar de accesos rapidos' : 'Guardar comercio para reuso rapido'}
        </SecondaryButton>

        <SecondaryButton onPress={() => void shareRecommendation()}>
          Compartir con alguien
        </SecondaryButton>

        {recordedId ? <Text style={styles.recorded}>Guardado en tu actividad reciente.</Text> : null}
      </ScreenScroll>

      <View style={styles.footer}>
        <CtaBar
          title="Sigue con el siguiente pago"
          primaryLabel="Revisar otro pago"
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
