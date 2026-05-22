import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ConfidenceBadge } from '@/components/confidence-badge';
import { ProviderIcon } from '@/components/provider-icon';
import { Pill } from '@/components/ui';
import { formatArs } from '@/lib/format';
import { colors, radius, spacing, typography } from '@/lib/theme';
import type { MerchantOpportunity } from '@/types/app';

export function MerchantCard({
  merchant,
  onPress,
}: {
  merchant: MerchantOpportunity;
  onPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={styles.header}>
        <View style={styles.left}>
          <ProviderIcon provider={merchant.providerHint?.toLowerCase().replace(/\s+/g, '') || merchant.category.toLowerCase()} />
          <View style={styles.copy}>
            <Text style={styles.title}>{merchant.merchantName}</Text>
            <Text style={styles.meta}>
              {merchant.category}
              {merchant.distanceLabel ? ` - ${merchant.distanceLabel}` : ''}
            </Text>
          </View>
        </View>
        <Pill label={merchant.providerHint ? `Mejor fit: ${merchant.providerHint}` : 'Oportunidad'} tone="accent" />
      </View>

      <View style={styles.values}>
        <Text style={styles.netValue}>{formatArs(merchant.likelyNetSavingsArs)}</Text>
        <Text style={styles.valueCaption}>Ahorro neto estimado</Text>
      </View>

      <Text style={styles.reason}>{merchant.reason}</Text>
      <ConfidenceBadge confidence={merchant.confidence} />

      <View style={styles.tags}>
        {merchant.tags.map((tag) => (
          <Pill key={tag} label={tag} />
        ))}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  pressed: {
    transform: [{ scale: 0.985 }],
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  left: {
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  copy: {
    flex: 1,
    gap: spacing.xxs,
  },
  title: {
    ...typography.headingSm,
    color: colors.ink,
  },
  meta: {
    ...typography.caption,
    color: colors.inkMuted,
  },
  values: {
    gap: spacing.xxs,
  },
  netValue: {
    ...typography.displaySm,
    color: colors.teal,
  },
  valueCaption: {
    ...typography.caption,
    color: colors.inkMuted,
  },
  reason: {
    ...typography.bodySm,
    color: colors.inkMuted,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
});
