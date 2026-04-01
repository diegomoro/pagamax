import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { PaymentRecommendation } from '@pagamax/core';
import { Card, Pill, SecondaryButton } from '@/components/ui';
import { formatArs } from '@/lib/format';
import { colors, spacing } from '@/lib/theme';

interface RecommendationCardProps {
  recommendation: PaymentRecommendation;
  appLabel: string;
  handoffLabel: string;
  onPressDetails: () => void;
  onPressHandoff: () => void;
}

export function RecommendationCard({
  recommendation,
  appLabel,
  handoffLabel,
  onPressDetails,
  onPressHandoff,
}: RecommendationCardProps) {
  return (
    <Pressable onPress={onPressDetails}>
      <Card>
        <View style={styles.header}>
          <View style={styles.valueWrap}>
            <Text style={styles.value}>{formatArs(recommendation.estimatedSavingsArs)}</Text>
            <Text style={styles.caption}>Ahorro estimado</Text>
          </View>
          <View style={styles.badges}>
            <Pill label={recommendation.source === 'merchant' ? 'Comercio' : 'General'} tone="accent" />
            <Pill label={recommendation.valueType === 'cashback' ? 'Reintegro' : recommendation.valueType === 'discount' ? 'Descuento' : 'Cuotas'} />
          </View>
        </View>

        <View style={styles.body}>
          <Text style={styles.method}>{recommendation.method.label}</Text>
          <Text style={styles.promo}>{recommendation.promo.promo_title}</Text>
          <Text style={styles.netPay}>Pagás aprox. {formatArs(recommendation.estimatedNetPaymentArs)}</Text>
        </View>

        <View style={styles.reasons}>
          {recommendation.reasons.slice(0, 2).map(reason => (
            <Text key={reason} style={styles.reason}>• {reason}</Text>
          ))}
          {recommendation.warnings[0] ? (
            <Text style={styles.warning}>Advertencia: {recommendation.warnings[0]}</Text>
          ) : null}
        </View>

        <View style={styles.footer}>
          <Text style={styles.appHint}>{appLabel}</Text>
          <SecondaryButton onPress={onPressHandoff}>{handoffLabel}</SecondaryButton>
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  valueWrap: {
    gap: 2,
  },
  value: {
    fontSize: 30,
    lineHeight: 34,
    fontWeight: '900',
    color: colors.teal,
  },
  caption: {
    color: colors.inkMuted,
    fontSize: 13,
  },
  badges: {
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  body: {
    gap: 4,
  },
  method: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: '800',
  },
  promo: {
    color: colors.inkMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  netPay: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '700',
  },
  reasons: {
    gap: 4,
  },
  reason: {
    color: colors.inkMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  warning: {
    color: colors.warning,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  footer: {
    gap: spacing.sm,
  },
  appHint: {
    color: colors.inkMuted,
    fontSize: 13,
  },
});
