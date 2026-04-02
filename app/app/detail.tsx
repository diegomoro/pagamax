import { useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { ConfidenceBadge } from '@/components/confidence-badge';
import { CompactRecommendationRow } from '@/components/recommendation-card';
import { RecommendationBreakdown } from '@/components/recommendation-breakdown';
import { RuleGrid } from '@/components/rule-grid';
import { Chip, EmptyState, IconButton, Pill, SecondaryButton } from '@/components/ui';
import { usePagamax } from '@/context/pagamax-context';
import { getPaymentAppConfig } from '@/config/payment-apps';
import { openPaymentApp } from '@/lib/handoff';
import { buildRecommendationPresentation, sortRecommendationsForMode } from '@/lib/experience';
import { colors, radius, shadows, spacing, typography } from '@/lib/theme';

export default function DetailScreen() {
  const { currentSession, settings, updateSettings } = usePagamax();
  const params = useLocalSearchParams<{ index?: string }>();
  const [reasonsOpen, setReasonsOpen] = useState(true);
  const scrollY = useRef(new Animated.Value(0)).current;

  const ranked = useMemo(() => (
    currentSession ? sortRecommendationsForMode(currentSession, settings.optimizationMode) : []
  ), [currentSession, settings.optimizationMode]);

  const recommendation = useMemo(() => {
    const index = Number(params.index ?? '0');
    if (!currentSession || !Number.isFinite(index)) return null;
    return ranked[index] ?? null;
  }, [currentSession, params.index, ranked]);

  if (!currentSession || !recommendation) {
    return (
      <View style={styles.emptyWrap}>
        <EmptyState title="No hay detalle cargado" body="Vuelve a resultados y elige una recomendacion." />
      </View>
    );
  }

  const config = getPaymentAppConfig(recommendation.method.provider);
  const presentation = buildRecommendationPresentation(currentSession, recommendation);
  const compactHeight = scrollY.interpolate({
    inputRange: [0, 80],
    outputRange: [88, 68],
    extrapolate: 'clamp',
  });

  return (
    <View style={styles.screen}>
      <Animated.View style={[styles.topBar, { height: compactHeight }]}>
        <View style={styles.topBarInner}>
          <IconButton icon="arrow-back" onPress={() => router.back()} />
          <View style={styles.topCopy}>
            <Text numberOfLines={1} style={styles.topTitle}>{recommendation.method.label}</Text>
            <Text numberOfLines={1} style={styles.topSub}>Abrir {config.label}</Text>
          </View>
          <SecondaryButton stretch={false} onPress={() => void openPaymentApp(recommendation.method.provider)}>
            {config.verifiedDeepLink ? 'Abrir' : 'Buscar'}
          </SecondaryButton>
        </View>
      </Animated.View>

      <Animated.ScrollView
        contentContainerStyle={styles.content}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.merchant}>{currentSession.match.merchant_name}</Text>
          <Text style={styles.total}>Total analizado {currentSession.amountArs.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })}</Text>
        </View>

        <View style={styles.hero}>
          <Text style={styles.value}>{presentation.netSavingsArs.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })}</Text>
          <Text style={styles.caption}>You keep estimado</Text>
          <Text style={styles.net}>Ruta sugerida: {recommendation.method.label}</Text>
          <View style={styles.pills}>
            <Pill label={recommendation.valueType === 'cashback' ? 'Reintegro' : recommendation.valueType === 'financing_estimate' ? 'Cuotas' : 'Descuento'} tone="accent" />
            <Pill label={recommendation.source === 'merchant' ? 'Regla del comercio' : 'Regla general'} />
          </View>
        </View>

        <RecommendationBreakdown
          grossSavingsArs={presentation.grossSavingsArs}
          pagamaxFeeArs={presentation.pagamaxFeeArs}
          netSavingsArs={presentation.netSavingsArs}
          confidence={presentation.confidence}
        />

        <View style={styles.preferenceRow}>
          <Text style={styles.preferenceLabel}>Optimize for</Text>
          <View style={styles.preferenceChips}>
            <Chip
              label="Max savings"
              selected={settings.optimizationMode === 'max_savings'}
              onPress={() => updateSettings({ optimizationMode: 'max_savings' })}
            />
            <Chip
              label="Fastest checkout"
              selected={settings.optimizationMode === 'fastest_checkout'}
              onPress={() => updateSettings({ optimizationMode: 'fastest_checkout' })}
            />
          </View>
        </View>

        <ConfidenceBadge confidence={presentation.confidence} />

        <RuleGrid
          items={[
            { icon: 'calendar-outline', label: 'Days', value: recommendation.promo.day_pattern || 'Sin detalle' },
            { icon: 'hourglass-outline', label: 'Validity', value: `${recommendation.promo.valid_from || 'sin inicio'} a ${recommendation.promo.valid_to || 'sin fin'}` },
            { icon: 'storefront-outline', label: 'Channel', value: recommendation.promo.channel || 'Sin detalle' },
            { icon: 'card-outline', label: 'Issuer', value: recommendation.promo.issuer },
            { icon: 'cash-outline', label: 'Cap', value: recommendation.promo.cap_amount_ars ? recommendation.promo.cap_amount_ars.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }) : 'Sin tope' },
            { icon: 'pricetag-outline', label: 'Minimum', value: recommendation.promo.min_purchase_ars ? recommendation.promo.min_purchase_ars.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }) : 'Sin minimo' },
          ]}
        />

        <View style={styles.section}>
          <Pressable onPress={() => setReasonsOpen((prev) => !prev)} style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Why this route wins</Text>
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
            <Text style={styles.warningTitle}>Eligibility and caveats</Text>
            {presentation.caveats.map((warning) => (
              <Text key={warning} style={styles.warningText}>{warning}</Text>
            ))}
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Alternative routes</Text>
          {ranked.slice(0, 3).map((item, index) => {
            const breakdown = buildRecommendationPresentation(currentSession, item);
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
          Proceed with this route
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
  preferenceRow: {
    gap: spacing.xs,
  },
  preferenceLabel: {
    ...typography.caption,
    color: colors.inkMuted,
  },
  preferenceChips: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
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
