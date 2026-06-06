import { useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CompactRecommendationRow } from '@/components/recommendation-card';
import { RecommendationBreakdown } from '@/components/recommendation-breakdown';
import { RuleGrid } from '@/components/rule-grid';
import { EmptyState, IconButton, Pill, SecondaryButton } from '@/components/ui';
import { usePagamax } from '@/context/pagamax-context';
import { buildPaymentHandoffPlan, openPaymentApp } from '@/lib/handoff';
import { buildRecommendationPresentation, sortRecommendationsForMode } from '@/lib/experience';
import { colors, radius, shadows, spacing, typography } from '@/lib/theme';

const DAY_LABELS: Record<string, string> = {
  everyday: 'todos los dias',
  daily: 'todos los dias',
  monday: 'lunes',
  tuesday: 'martes',
  wednesday: 'miercoles',
  thursday: 'jueves',
  friday: 'viernes',
  saturday: 'sabado',
  sunday: 'domingo',
};

function formatRuleDate(raw: string | null | undefined, fallback: string) {
  if (!raw) return fallback;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
}

function formatDayPattern(raw: string | null | undefined) {
  if (!raw) return 'Sin detalle';
  return raw
    .split(/[;,]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => DAY_LABELS[part.toLowerCase()] ?? part)
    .join(', ');
}

function formatChannel(raw: string | null | undefined) {
  if (!raw) return 'Sin detalle';
  const normalized = raw.toLowerCase();
  if (normalized === 'in_store') return 'Tienda';
  if (normalized === 'online') return 'Online';
  if (normalized === 'qr') return 'QR';
  if (normalized === 'mixed' || normalized === 'hybrid') return 'Mixto';
  if (normalized === 'all') return 'Todos';
  return raw;
}

function formatHandoffConfidence(label: ReturnType<typeof buildPaymentHandoffPlan>['confidenceLabel']): string {
  if (label === 'high confidence') return 'Muy seguro';
  if (label === 'estimated') return 'Estimado';
  return 'Revisalo manual';
}

export default function DetailScreen() {
  const { currentSession, recordHandoff, settings } = usePagamax();
  const params = useLocalSearchParams<{ index?: string }>();
  const [reasonsOpen, setReasonsOpen] = useState(true);
  const scrollY = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();
  const selectedIndex = Number(params.index ?? '0');

  const ranked = useMemo(() => (
    currentSession ? sortRecommendationsForMode(currentSession, settings.optimizationMode) : []
  ), [currentSession, settings.optimizationMode]);

  const recommendation = useMemo(() => {
    if (!currentSession || !Number.isFinite(selectedIndex)) return null;
    return ranked[selectedIndex] ?? null;
  }, [currentSession, ranked, selectedIndex]);
  const alternativeRecommendations = useMemo(
    () => ranked.filter((_, index) => index !== selectedIndex).slice(0, 3),
    [ranked, selectedIndex],
  );

  if (!currentSession || !recommendation) {
    return (
      <View style={styles.emptyWrap}>
        <EmptyState title="No hay detalle cargado" body="Volver a resultados y elegir otra opcion." />
      </View>
    );
  }

  const presentation = buildRecommendationPresentation(currentSession, recommendation);
  const handoffPlan = buildPaymentHandoffPlan(currentSession, recommendation);
  const handleOpen = async () => {
    try {
      const mode = await openPaymentApp(recommendation.method.provider, {
        merchantName: currentSession.match.merchant_name,
        amountArs: currentSession.amountEstimated ? undefined : currentSession.amountArs,
        qrPayload: currentSession.qrPayload,
      });
      recordHandoff(recommendation.method.provider, mode, handoffPlan.detail);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'No se pudo abrir la app seleccionada.';
      recordHandoff(recommendation.method.provider, 'error', message);
    }
  };

  return (
    <View style={styles.screen}>
      <Animated.View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.topBarInner}>
          <IconButton icon="arrow-back" onPress={() => router.back()} />
          <View style={styles.topCopy}>
            <Text numberOfLines={1} style={styles.topTitle}>{recommendation.method.label}</Text>
            <Text numberOfLines={1} style={styles.topSub}>{formatHandoffConfidence(handoffPlan.confidenceLabel)}</Text>
          </View>
          <SecondaryButton stretch={false} onPress={() => void handleOpen()}>
            {handoffPlan.primaryLabel.replace(/^Abrir\s|^Buscar\s/, '')}
          </SecondaryButton>
        </View>
      </Animated.View>

      <Animated.ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 112 }]}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.merchant}>{currentSession.match.merchant_name}</Text>
          <Text style={styles.total}>
            {currentSession.amountEstimated ? 'Monto de referencia: ' : 'Total analizado '}
            {currentSession.amountArs.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })}
          </Text>
        </View>

        <View style={styles.hero}>
          <Text style={styles.value}>{recommendation.valueType === 'fallback' ? 'Paga simple' : presentation.netSavingsArs.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })}</Text>
          <Text style={styles.caption}>{recommendation.valueType === 'fallback' ? 'No encontre promo segura. Esta es la opcion directa.' : 'Plata estimada que queda para vos'}</Text>
          <Text style={styles.net}>Usa: {recommendation.method.label}</Text>
          <View style={styles.pills}>
            <Pill label={recommendation.valueType === 'cashback' ? 'Reintegro' : recommendation.valueType === 'financing_estimate' ? 'Cuotas' : recommendation.valueType === 'fallback' ? 'Opcion simple' : 'Descuento'} tone="accent" />
            <Pill label={recommendation.source === 'merchant' ? 'Regla del comercio' : recommendation.source === 'fallback' ? 'Sin promo confirmada' : 'Regla general'} />
          </View>
        </View>

        {recommendation.valueType === 'fallback' ? null : (
          <RecommendationBreakdown
            grossSavingsArs={presentation.grossSavingsArs}
            pagamaxFeeArs={presentation.pagamaxFeeArs}
            netSavingsArs={presentation.netSavingsArs}
            confidence={presentation.confidence}
          />
        )}
        <Text style={styles.orderNote}>
          Orden actual: {settings.optimizationMode === 'max_savings' ? 'mas plata para vos' : 'menos vueltas'}
        </Text>

        <View style={styles.integrityCard}>
          <Ionicons name="shield-checkmark-outline" size={18} color={colors.accentPressed} />
          <Text style={styles.integrityText}>Esta opcion se ordena por lo que mas sirve en este pago. Los comercios pagos aparecen marcados y no se mezclan aca.</Text>
        </View>

        <View style={styles.handoffCard}>
          <Text style={styles.handoffTitle}>{handoffPlan.primaryLabel}</Text>
          <Text style={styles.handoffText}>{handoffPlan.instruction}</Text>
          <Text style={styles.handoffMeta}>
            QR: {handoffPlan.supportsQrPayload ? 'puede llevarlo' : 'manual'} - monto: {handoffPlan.supportsAmount ? 'puede llevarlo' : 'manual'}
          </Text>
        </View>

        <RuleGrid
          items={[
            { icon: 'calendar-outline', label: 'Dias', value: formatDayPattern(recommendation.promo.day_pattern) },
            { icon: 'hourglass-outline', label: 'Vigencia', value: `${formatRuleDate(recommendation.promo.valid_from, 'sin inicio')} al ${formatRuleDate(recommendation.promo.valid_to, 'sin fin')}` },
            { icon: 'storefront-outline', label: 'Canal', value: formatChannel(recommendation.promo.channel) },
            { icon: 'qr-code-outline', label: 'QR', value: currentSession.match.qr.payment_provider ?? currentSession.match.qr.qr_type },
            { icon: 'card-outline', label: 'Emisor', value: recommendation.promo.issuer },
            { icon: 'cash-outline', label: 'Tope', value: recommendation.promo.cap_amount_ars ? recommendation.promo.cap_amount_ars.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }) : 'Sin tope' },
            { icon: 'pricetag-outline', label: 'Minimo', value: recommendation.promo.min_purchase_ars ? recommendation.promo.min_purchase_ars.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }) : 'Sin minimo' },
          ]}
        />

        <View style={styles.section}>
          <Pressable onPress={() => setReasonsOpen((prev) => !prev)} style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Por que conviene</Text>
            <Text style={styles.sectionToggle}>{reasonsOpen ? '-' : '+'}</Text>
          </Pressable>
          {reasonsOpen ? presentation.qualifiers.map((reason) => (
            <View key={reason} style={styles.reasonRow}>
              <Text style={styles.reasonCheck}>+</Text>
              <Text style={styles.reasonText}>{reason}</Text>
            </View>
          )) : null}
        </View>

        {presentation.caveats.length > 0 ? (
          <View style={styles.warningCard}>
            <Text style={styles.warningTitle}>Condiciones a mirar</Text>
            {presentation.caveats.map((warning) => (
              <Text key={warning} style={styles.warningText}>{warning}</Text>
            ))}
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Otras opciones</Text>
          {alternativeRecommendations.map((item) => {
            const breakdown = buildRecommendationPresentation(currentSession, item);
            const index = ranked.findIndex((candidate) => candidate === item);
            return (
              <CompactRecommendationRow
                key={`${item.method.id}-${item.promo.promo_key}`}
                rank={index + 1}
                recommendation={item}
                netSavingsArs={breakdown.netSavingsArs}
                onPress={() => router.replace({ pathname: '/detail', params: { index: String(index) } })}
              />
            );
          })}
        </View>

        <SecondaryButton onPress={() => router.push({ pathname: '/success', params: { index: params.index ?? '0' } })}>
          Guardar este pago
        </SecondaryButton>
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  emptyWrap: {
    flex: 1,
    padding: spacing.md,
    backgroundColor: colors.background,
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xl,
    backgroundColor: colors.background,
  },
  topBarInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    ...shadows.sm,
  },
  topCopy: {
    flex: 1,
    gap: spacing.xxs,
  },
  topTitle: {
    ...typography.headingSm,
    color: colors.ink,
  },
  topSub: {
    ...typography.caption,
    color: colors.inkMuted,
  },
  content: {
    paddingTop: 120,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  header: {
    gap: spacing.xxs,
  },
  merchant: {
    ...typography.headingLg,
    color: colors.ink,
  },
  total: {
    ...typography.bodySm,
    color: colors.inkMuted,
  },
  hero: {
    backgroundColor: colors.tealSoft,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  value: {
    ...typography.displayLg,
    color: colors.teal,
  },
  caption: {
    ...typography.caption,
    color: colors.inkMuted,
  },
  net: {
    ...typography.headingSm,
    color: colors.ink,
  },
  pills: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
    marginTop: spacing.sm,
  },
  orderNote: {
    ...typography.caption,
    color: colors.inkMuted,
  },
  integrityCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
    padding: spacing.md,
  },
  integrityText: {
    ...typography.bodySm,
    color: colors.accentPressed,
    flex: 1,
  },
  handoffCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  handoffTitle: {
    ...typography.headingSm,
    color: colors.ink,
  },
  handoffText: {
    ...typography.bodySm,
    color: colors.inkMuted,
  },
  handoffMeta: {
    ...typography.caption,
    color: colors.inkMuted,
  },
  section: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    ...typography.headingLg,
    color: colors.ink,
  },
  sectionToggle: {
    ...typography.headingLg,
    color: colors.inkMuted,
  },
  reasonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  reasonCheck: {
    ...typography.headingSm,
    color: colors.success,
  },
  reasonText: {
    ...typography.bodySm,
    color: colors.inkMuted,
    flex: 1,
  },
  warningCard: {
    backgroundColor: colors.warningSoft,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.xs,
  },
  warningTitle: {
    ...typography.headingSm,
    color: colors.warning,
  },
  warningText: {
    ...typography.bodySm,
    color: colors.warning,
  },
});
