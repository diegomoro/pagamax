import { memo, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { PaymentRecommendation } from '@pagamax/core';
import { ConfidenceBadge } from '@/components/confidence-badge';
import { ProviderIcon } from '@/components/provider-icon';
import { RecommendationBreakdown } from '@/components/recommendation-breakdown';
import { Pill, PrimaryButton, SecondaryButton } from '@/components/ui';
import { formatArs } from '@/lib/format';
import { colors, radius, shadows, spacing, typography } from '@/lib/theme';
import type { ConfidenceInfo } from '@/types/app';

function valueTypeLabel(valueType: PaymentRecommendation['valueType']): string {
  if (valueType === 'cashback') return 'Reintegro';
  if (valueType === 'financing_estimate') return 'Cuotas';
  if (valueType === 'fallback') return 'Opcion simple';
  return 'Descuento';
}

function useEntrance(delay: number) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 260,
        delay,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 260,
        delay,
        useNativeDriver: true,
      }),
    ]).start();
  }, [delay, opacity, translateY]);

  return {
    opacity,
    transform: [{ translateY }],
  };
}

export const HeroRecommendationCard = memo(function HeroRecommendationCard({
  recommendation,
  confidence,
  grossSavingsArs,
  pagamaxFeeArs,
  netSavingsArs,
  qualifiers,
  dataDateLabel,
  primaryLabel,
  onPressDetails,
  onPressPrimary,
  delay = 0,
}: {
  recommendation: PaymentRecommendation;
  confidence: ConfidenceInfo;
  grossSavingsArs: number;
  pagamaxFeeArs: number;
  netSavingsArs: number;
  qualifiers: string[];
  dataDateLabel: string;
  primaryLabel: string;
  onPressDetails: () => void;
  onPressPrimary: () => void;
  delay?: number;
}) {
  const animatedStyle = useEntrance(delay);
  const counter = useRef(new Animated.Value(0)).current;
  const [displayValue, setDisplayValue] = useState(0);
  const isFallback = recommendation.valueType === 'fallback';

  useEffect(() => {
    const listener = counter.addListener(({ value }) => setDisplayValue(value));
    Animated.timing(counter, {
      toValue: netSavingsArs,
      duration: 600,
      delay,
      useNativeDriver: false,
    }).start();
    return () => counter.removeListener(listener);
  }, [counter, delay, netSavingsArs]);

  return (
    <Animated.View style={[styles.heroCard, animatedStyle]}>
      <View style={styles.heroHeader}>
        <View style={styles.heroLeft}>
          <ProviderIcon provider={recommendation.method.provider} size={48} />
          <View style={styles.heroCopy}>
            <Text style={styles.heroMethod}>{recommendation.method.label}</Text>
            <Text style={styles.heroPromo}>{recommendation.promo.promo_title}</Text>
          </View>
        </View>
        <Pill label={valueTypeLabel(recommendation.valueType)} tone="accent" />
      </View>

      <View style={styles.decisionRow}>
        <View style={styles.decisionLeft}>
          <Ionicons name={isFallback ? 'shield-checkmark-outline' : 'sparkles-outline'} size={16} color={colors.accentPressed} />
          <Text style={styles.decisionLabel}>{isFallback ? 'Anda con esta' : 'Usa esta para pagar'}</Text>
        </View>
        <Pill label={`Confianza ${confidence.label}`} tone={confidence.tone === 'success' ? 'success' : confidence.tone === 'warning' ? 'warning' : 'default'} />
      </View>

      <View style={styles.heroValueWrap}>
        <Text style={styles.heroValue}>{isFallback ? 'Paga simple' : formatArs(displayValue)}</Text>
        <Text style={styles.heroCaption}>{isFallback ? 'No encontre una promo segura. Esta es la opcion mas directa.' : 'Plata estimada que queda para vos'}</Text>
      </View>

      {isFallback ? null : (
        <RecommendationBreakdown
          grossSavingsArs={grossSavingsArs}
          pagamaxFeeArs={pagamaxFeeArs}
          netSavingsArs={netSavingsArs}
          confidence={confidence}
          hideFee
        />
      )}

      <View style={styles.qualifiers}>
        {qualifiers.slice(0, 2).map((qualifier) => (
          <Text key={qualifier} style={styles.qualifier}>+ {qualifier}</Text>
        ))}
      </View>

      <Text style={styles.heroTrust}>
        {isFallback ? `Revisado al ${dataDateLabel}. Si aparece una promo real, te la mostramos.` : `Estimado con reglas vigentes al ${dataDateLabel}. Mira la app antes de confirmar.`}
      </Text>

      <View style={styles.heroActions}>
        <PrimaryButton onPress={onPressPrimary}>{primaryLabel}</PrimaryButton>
        <View style={styles.heroSecondary}>
          <SecondaryButton onPress={onPressDetails}>Ver el por que</SecondaryButton>
        </View>
      </View>
    </Animated.View>
  );
});

export const CompactRecommendationRow = memo(function CompactRecommendationRow({
  recommendation,
  rank,
  netSavingsArs,
  onPress,
  delay = 0,
}: {
  recommendation: PaymentRecommendation;
  rank: number;
  netSavingsArs: number;
  onPress: () => void;
  delay?: number;
}) {
  const animatedStyle = useEntrance(delay);

  return (
    <Animated.View style={animatedStyle}>
      <Pressable onPress={onPress} style={({ pressed }) => [styles.rowCard, pressed && styles.rowPressed]}>
        <View style={styles.rankCircle}>
          <Text style={styles.rankLabel}>{rank}</Text>
        </View>
        <View style={styles.rowCopy}>
          <Text numberOfLines={1} style={styles.rowMethod}>{recommendation.method.label}</Text>
          <Text numberOfLines={1} style={styles.rowPromo}>{recommendation.promo.promo_title}</Text>
        </View>
        <View style={styles.rowRight}>
          <Text style={styles.rowValue}>{recommendation.valueType === 'fallback' ? 'Abrir' : formatArs(netSavingsArs)}</Text>
          <Text style={styles.rowHint}>{recommendation.valueType === 'fallback' ? 'simple' : 'para vos'}</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  heroCard: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.md,
    ...shadows.md,
  },
  heroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  heroLeft: {
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  heroCopy: {
    flex: 1,
    gap: spacing.xxs,
  },
  heroMethod: {
    ...typography.headingLg,
    color: colors.ink,
  },
  heroPromo: {
    ...typography.bodySm,
    color: colors.inkMuted,
  },
  heroValueWrap: {
    gap: spacing.xxs,
  },
  decisionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  decisionLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  decisionLabel: {
    ...typography.caption,
    color: colors.inkMuted,
    flex: 1,
  },
  heroValue: {
    ...typography.displayLg,
    color: colors.teal,
  },
  heroCaption: {
    ...typography.caption,
    color: colors.inkMuted,
  },
  qualifiers: {
    gap: spacing.xxs,
  },
  qualifier: {
    ...typography.bodySm,
    color: colors.inkMuted,
  },
  heroTrust: {
    ...typography.caption,
    color: colors.inkMuted,
  },
  heroActions: {
    gap: spacing.sm,
  },
  heroSecondary: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  rowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  rowPressed: {
    transform: [{ scale: 0.985 }],
  },
  rankCircle: {
    width: 34,
    height: 34,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  rankLabel: {
    ...typography.caption,
    color: colors.ink,
  },
  rowCopy: {
    flex: 1,
    gap: spacing.xxs,
  },
  rowMethod: {
    ...typography.headingSm,
    color: colors.ink,
  },
  rowPromo: {
    ...typography.caption,
    color: colors.inkMuted,
  },
  rowRight: {
    alignItems: 'flex-end',
    gap: spacing.xxs,
  },
  rowValue: {
    ...typography.headingSm,
    color: colors.teal,
  },
  rowHint: {
    ...typography.caption,
    color: colors.inkMuted,
  },
});
